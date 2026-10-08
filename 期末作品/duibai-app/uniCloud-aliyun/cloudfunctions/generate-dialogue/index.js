'use strict'

/**
 * generate-dialogue —— 对话生成编排（本项目的核心链路）
 *
 * 入参：{ token, article_id, tone_code }
 * 出参：{ code:0, data:{ script_id, status, lines, pending_confirm } }
 *
 * 流程（对应实验设计里的"模块依赖与数据流向图"）：
 *   1. 取文章与段落
 *   2. 内容形态判断（表格/公式占比过高 → 422，不进入生成）
 *   3. 取口吻模板，组装 Prompt
 *   4. 调用大模型（结构化 JSON 输出）
 *   5. 三项程序化校验：JSON 结构 / 出处是否真实存在 / 括号等不可朗读残留
 *   6. 落库 scripts + dialogue_lines，返回待确认项数量
 *
 * ⚠️ 超时提示：uniCloud 云函数默认超时较短，本函数在 package.json 里设了 timeout:60。
 *    若一篇文章生成经常超过 60 秒，应改为「提交任务 → 客户端轮询 scripts.status」的异步模式，
 *    不要在云函数里做超长同步等待。
 *
 * ⚠️ 密钥：DEEPSEEK_API_KEY 放云函数环境变量，前端拿不到。
 */

const common = require('common')
const appConfig = require('app-config')
const { ERR, ok, fail, assertLogin } = common

const MODEL = 'deepseek-chat'
const MAX_CHARS = 3000

/* ---------------- 1. 内容形态判断 ---------------- */

/** 统计不可朗读字符占比（表格竖线、制表符、公式符号等） */
function unsuitableRatio (text) {
  const total = text.length || 1
  const bad = (text.match(/[|│┃┆┊\t]/g) || []).length
  const formula = (text.match(/[∑∫√≈≤≥±×÷∞∂]/g) || []).length
  return (bad + formula) / total
}

/* ---------------- 2. Prompt 组装 ---------------- */

function buildPrompt (tone, paragraphs, title) {
  const body = paragraphs.map(p => `P${p.seq}: ${p.text}`).join('\n')
  return [
    {
      role: 'system',
      content:
        '你是一个把书面文章改写成双人口语对话的助手。' +
        '严格要求：\n' +
        '1. 只输出 JSON，不要输出任何解释文字；\n' +
        '2. JSON 结构为 {"lines":[{"speaker":"A|B","text":"台词","source_paragraph":段落号}]}；\n' +
        '3. 每句台词必须能对应到给定段落，source_paragraph 填该段号；确实无出处的填 0；\n' +
        '4. 台词必须是口语短句，**不得出现括号、编号、图表引用、Markdown 符号**；\n' +
        '5. 不得编造原文没有的事实、数字与结论；\n' +
        '6. 拿不准的术语读法，把该句放进待确认（由程序据此打标记）。'
    },
    {
      role: 'user',
      content:
        `【口吻要求】${tone.name}：${tone.description || ''}\n${tone.prompt_template || ''}\n\n` +
        `【文章标题】${title}\n\n【原文段落】\n${body}\n\n` +
        '请按上述要求输出 JSON。'
    }
  ]
}

/* ---------------- 3. 调用大模型 ---------------- */

/**
 * mock 模式：返回可预测的固定对话稿，不调真实模型。
 *
 * 用途：在还没配 DEEPSEEK_API_KEY 的情况下，也能把
 * 「建文章 → 切段落 → 组装 Prompt → 三项校验 → 落库 → 读回」整条链路跑通并验证。
 *
 * 刻意构造了三种边界，用来确认校验分支真的生效：
 *   ① source_paragraph 指向不存在的段落 → 应被置 0 并打 no_source 标记
 *   ② 台词里带括号 → 应被清理并把该条记为可疑项
 *   ③ 正常条目 → 应保持原样、flag 为空
 */
function mockContent (paragraphs) {
  const lines = []
  const src = paragraphs.slice(0, 6)
  src.forEach((p, i) => {
    lines.push({
      speaker: i % 2 === 0 ? 'A' : 'B',
      text: '模拟台词第' + (i + 1) + '句：' + String(p.text).slice(0, 30),
      source_paragraph: p.seq
    })
  })
  // ① 无出处
  lines.push({ speaker: 'A', text: '这句在原文里找不到来源', source_paragraph: 9999 })
  // ② 括号残留
  lines.push({ speaker: 'B', text: '这里有（括号）残留', source_paragraph: src.length ? src[0].seq : 1 })
  return JSON.stringify({ lines })
}

async function callLLM (messages, paragraphs, allowMock) {
  // mock 可由两处开启：云函数环境变量 MOCK_LLM=1，或入参 event.mock=true（便于自检脚本调用，
  // 因为 CLI 无法设置云函数环境变量）。
  // ⚠️ 交付前应删掉入参这条通路（连同 selftest 云函数一起），避免线上被喂假数据。
  if (allowMock) {
    console.warn('[duibai] mock 模式：返回模拟对话稿，未调用真实模型')
    return mockContent(paragraphs)
  }

  // 优先级：云函数环境变量 > app-config/config.json
  const key = appConfig.get('DEEPSEEK_API_KEY')
  if (!key) {
    const e = new Error('未配置 DEEPSEEK_API_KEY（可在云函数环境变量或 app-config/config.json 里填）')
    e.errorCode = ERR.INTERNAL
    throw e
  }
  const res = await uniCloud.httpclient.request(
    'https://api.deepseek.com/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key
      },
      data: {
        model: MODEL,
        messages,
        temperature: 1.0,
        response_format: { type: 'json_object' }
      },
      contentType: 'json',
      dataType: 'json',
      timeout: 55000
    }
  )
  if (res.status !== 200) {
    const e = new Error('模型服务返回 ' + res.status)
    e.errorCode = ERR.BACKEND_UNAVAILABLE
    throw e
  }
  const content = res.data && res.data.choices && res.data.choices[0]
    && res.data.choices[0].message && res.data.choices[0].message.content
  if (!content) {
    const e = new Error('模型未返回内容')
    e.errorCode = ERR.BACKEND_UNAVAILABLE
    throw e
  }
  return content
}

/* ---------------- 4. 三项程序化校验 ---------------- */

const ILLEGAL = /[（）()【】\[\]{}<>《》「」]|^\s*\d+[.、]|\*\*|__|#/

function validate (content, maxSeq) {
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    return { ok: false, reason: '结构化输出不合规：不是合法 JSON' }
  }
  if (!parsed || !Array.isArray(parsed.lines) || !parsed.lines.length) {
    return { ok: false, reason: '结构化输出不合规：缺少 lines 数组' }
  }

  const lines = []
  for (let i = 0; i < parsed.lines.length; i++) {
    const raw = parsed.lines[i] || {}
    const speaker = raw.speaker === 'B' ? 'B' : 'A'
    let text = String(raw.text == null ? '' : raw.text).trim()
    if (!text) continue

    let flag = ''
    // a) 出处校验：source_paragraph 必须是本文真实存在的段号
    let sp = parseInt(raw.source_paragraph, 10)
    if (isNaN(sp)) sp = 0
    const hasSource = sp >= 1 && sp <= maxSeq
    if (!hasSource) {
      sp = 0
      flag = 'no_source'
    }
    // b) 括号残留校验（不可朗读字符）
    if (ILLEGAL.test(text)) {
      text = text.replace(/[（）()【】\[\]{}<>《》「」]/g, '').replace(/\*\*|__|#/g, '')
      if (!flag) flag = 'term'
    }
    lines.push({
      seq: lines.length + 1,
      speaker,
      text,
      source_paragraph: sp,
      flag,
      confirmed: false
    })
  }

  if (!lines.length) return { ok: false, reason: '结构化输出不合规：有效台词为空' }
  return { ok: true, lines }
}

/* ---------------- 主流程 ---------------- */

exports.main = common.wrap(async (event) => {
  const { article_id, tone_code } = event || {}
  if (!article_id || !tone_code) return fail(ERR.PARAM, '缺少 article_id 或 tone_code')

  const uid = assertLogin(event)
  const db = uniCloud.database()
  const t0 = Date.now()

  // 1) 文章与段落
  const artRes = await db.collection('articles').doc(article_id).get()
  const article = artRes.data && artRes.data[0]
  if (!article) return fail(ERR.NOT_FOUND, '文章不存在')
  if (article.user_id !== uid) return fail(ERR.FORBIDDEN, '无权访问该文章')

  const paraRes = await db.collection('paragraphs')
    .where({ article_id }).orderBy('seq', 'asc').limit(200).get()
  const paragraphs = paraRes.data || []
  if (!paragraphs.length) return fail(ERR.PARAM, '该文章还没有解析出段落')

  // 2) 内容形态判断
  if (unsuitableRatio(article.content) > 0.3) {
    return fail(ERR.NOT_SUITABLE_FOR_AUDIO, '表格与公式占比过高，无法朗读',
      { reason: '表格与公式占比超过 30%', suggestion: '请改用文字摘要形式' })
  }

  // 3) 口吻模板
  const toneRes = await db.collection('tones').where({ code: tone_code, enabled: true }).limit(1).get()
  const tone = toneRes.data && toneRes.data[0]
  if (!tone) return fail(ERR.PARAM, '口吻不存在或已停用')

  // 4) 生成 + 5) 校验（最多重试 1 次）
  const useMock = process.env.MOCK_LLM === '1' || (event && event.mock === true)
  const maxSeq = paragraphs.length
  let result = null
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    const content = await callLLM(buildPrompt(tone, paragraphs, article.title), paragraphs, useMock)
    const v = validate(content, maxSeq)
    if (v.ok) result = v
    else console.warn('[duibai] 校验未通过，重试', attempt + 1, v.reason)
  }
  if (!result) {
    await db.collection('gen_logs').add({
      user_id: uid, script_id: '', stage: 'dialogue',
      ms: Date.now() - t0, ok: false,
      error_code: 'VALIDATE_FAILED', created_at: Date.now()
    })
    return fail(ERR.BACKEND_UNAVAILABLE, '模型输出连续不合规，请稍后重试')
  }

  // 6) 落库
  const pending = result.lines.filter(l => l.flag && !l.confirmed).length
  const scriptAdd = await db.collection('scripts').add({
    article_id,
    user_id: uid,
    tone_code,
    status: 'generated',
    line_count: result.lines.length,
    pending_confirm: pending,
    // 对话痕迹：存前两句，让历史页不用再查台词（避免 N+1）
    preview: result.lines.slice(0, 2).map(l => l.text),
    created_at: Date.now()
  })

  const COL = db.collection('dialogue_lines')
  // uniCloud 逐条 add 较慢，这里顺序写入；量大可改用批量导入
  for (const l of result.lines) {
    await COL.add(Object.assign({ script_id: scriptAdd.id, user_id: uid }, l))
  }

  await db.collection('gen_logs').add({
    user_id: uid, script_id: scriptAdd.id, stage: 'dialogue',
    ms: Date.now() - t0, ok: true, error_code: '', created_at: Date.now()
  })

  return ok({
    script_id: scriptAdd.id,
    status: 'generated',
    lines: result.lines.length,
    pending_confirm: pending
  })
})
