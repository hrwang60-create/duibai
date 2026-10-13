/**
 * 实验5 · §2.1 LLM 调用与输出格式 —— 证据采集
 *
 * 采集四组证据，全部使用**真实云端调用**：
 *   A. 一次正常问答的完整输入与返回（含模型名、参数、耗时、Token）
 *   B. 三组输入：正常问题 / 缺少必要信息的问题 / 超出任务范围的问题
 *   C. 三种调用失败：HTTP 错误（密钥无效）、超时、连接不可达
 *   D. 结构化输出校验：真实模型生成对话稿 + 故意喂入不合规 JSON，验证校验能定位到第几条
 *
 * 输出：../实验5-证据/01-llm调用证据.json 与 .md
 *
 * 运行：npm run exp5:probe
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_PARAMS, chat, deepseekLlm, parseDialogueJSON } from '../src/ai/llm/deepseek.mjs'
import { buildDialogueMessages, renderMessages } from '../src/ai/llm/prompt.mjs'
import { INSUFFICIENT_ANSWER, ask } from '../src/ai/rag/ask.mjs'
import { loadIndex } from '../src/ai/rag/store.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EVID = path.resolve(ROOT, '..', '实验5-证据')
fs.mkdirSync(EVID, { recursive: true })

const index = loadIndex(path.join(ROOT, 'data', 'kb', 'index.json'))
const out = { generated_at: new Date().toISOString(), model_params: DEFAULT_PARAMS, cases: [] }

const line = (s = '') => console.log(s)
const rule = (t) => console.log(`\n${'═'.repeat(4)} ${t} ${'═'.repeat(4)}`)

/* ───────────────────── A. 正常问答：完整输入与返回 ───────────────────── */

rule('A. 正常问题 —— 完整输入与返回')
const QA_NORMAL = '「对白」一共提供哪几种口吻？'
const a = await ask({ question: QA_NORMAL, index, root: ROOT })
out.cases.push({
  id: 'A',
  desc: '正常问题：知识库有明确答案',
  question: QA_NORMAL,
  mode: 'rag',
  model: a.model,
  params: a.model ? { ...DEFAULT_PARAMS, json: false } : null,
  usage: a.usage,
  ms: a.ms,
  total_ms: a.total_ms,
  retrieval: a.retrieval,
  context: a.context,
  judge: a.judge,
  answer: a.answer,
  citations: a.citations,
  input_rendered: a.input_rendered,
  calls: a.calls
})
line(`问题：${QA_NORMAL}`)
line(`模型：${a.model}   主调用耗时：${a.ms} ms   总耗时（含检索+判定）：${a.total_ms} ms`)
line(`Token：输入 ${a.usage?.prompt_tokens} / 输出 ${a.usage?.completion_tokens} / 合计 ${a.usage?.total_tokens}`)
line(`检索：${a.retrieval.reason}`)
line(`上下文：${a.context.chars} 字符，片段 ${a.context.chunks.map((c) => c.id).join('、')}`)
line(`模型判定：coverage=${a.judge?.coverage} —— ${a.judge?.reason}`)
line(`回答：\n${a.answer}`)
line(`引用检查：编号 ${a.citations.cited.join('、')}；有效=${a.citations.ok}`)

/* ─────────────────── B. 三组输入：正常 / 缺信息 / 超范围 ─────────────────── */

rule('B. 三组输入')
const THREE = [
  ['B1', '正常问题', '语音合成服务不可用的时候，系统会怎么处理？'],
  ['B2', '缺少必要信息', '为什么我生成不了音频？'],
  ['B3', '超出任务范围', '帮我写一首关于春天的诗。']
]
for (const [id, type, q] of THREE) {
  const r = await ask({ question: q, index, root: ROOT })
  const insufficient = r.insufficient === true
  out.cases.push({
    id,
    desc: `${type}：${q}`,
    type,
    question: q,
    mode: 'rag',
    insufficient,
    insufficient_by: r.insufficient_by,
    judge: r.judge,
    retrieval_reason: r.retrieval.reason,
    answer: r.answer,
    usage: r.usage,
    ms: r.ms,
    total_ms: r.total_ms,
    citations: r.citations
  })
  line(`\n── ${id}（${type}）${q}`)
  line(`   期望：${id === 'B1' ? '依据资料给出结论，并引用来源' : id === 'B2' ? '指出还缺什么信息，列出可能的原因' : '说明不在回答范围内，不硬答'}`)
  line(`   检索：${r.retrieval.reason}`)
  if (r.judge) line(`   模型判定：coverage=${r.judge.coverage}`)
  line(`   判定结果：${insufficient ? `资料不足（由${r.insufficient_by === 'program' ? '程序' : '模型'}判定）` : '依据资料生成回答'}`)
  line(`   回答：\n${r.answer.replace(/^/gm, '     ')}`)
}

/* ────────────────────────── C. 三种调用失败 ────────────────────────── */

rule('C. 调用失败处理')
const FAILS = [
  {
    id: 'C1',
    desc: '接口鉴权失败（错误的 API Key）',
    run: () => chat([{ role: 'user', content: 'hi' }], { apiKey: 'sk-invalid-key-for-test', quiet: true, retries: 0 })
  },
  {
    id: 'C2',
    desc: '响应超时（timeout 设为 1 ms）',
    run: () => chat([{ role: 'user', content: 'hi' }], { root: ROOT, quiet: true, retries: 0, params: { timeout_ms: 1 } })
  },
  {
    id: 'C3',
    desc: '连接不可达（接口地址指向保留端口），并验证重试',
    run: () =>
      chat([{ role: 'user', content: 'hi' }], {
        root: ROOT,
        quiet: true,
        retries: 1,
        baseUrl: 'http://127.0.0.1:9'
      })
  }
]
for (const f of FAILS) {
  const t0 = Date.now()
  let rec
  try {
    await f.run()
    rec = { error: null, note: '未按预期失败（异常）' }
  } catch (e) {
    rec = {
      error_code: e.code || e.name,
      error_message: e.message,
      http_status: e.status ?? null,
      cause: e.cause ?? null,
      elapsed_ms: Date.now() - t0
    }
  }
  out.cases.push({ id: f.id, desc: f.desc, ...rec })
  line(`\n── ${f.id} ${f.desc}`)
  line(`   错误码：${rec.error_code}`)
  line(`   归因（给用户看的原因）：${rec.error_message}`)
  if (rec.http_status) line(`   HTTP 状态：${rec.http_status}`)
  if (rec.cause) line(`   底层原因：${rec.cause}`)
  line(`   从发起到抛出：${rec.elapsed_ms} ms`)
}

/* ──────────────────── D. 结构化输出校验（真实模型） ──────────────────── */

rule('D. 结构化输出校验')
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'sample-data.json'), 'utf8'))
const art = sample.sample_article
const tone = sample.tones.find((t) => t.code === 'teacher_student') || sample.tones[0]
const paragraphs = String(art.content)
  .split(/\n{2,}/)
  .map((t) => t.trim())
  .filter(Boolean)
  .slice(0, 4)
  .map((text, i) => ({ seq: i + 1, text }))

const messages = buildDialogueMessages({ title: art.title, tone, paragraphs })
const r = await chat(messages, { json: true, root: ROOT })
let parsed
let parseError = null
try {
  parsed = parseDialogueJSON(r.text)
} catch (e) {
  parseError = { code: e.code, message: e.message }
}
line(`\n── D 真实模型的结构化输出`)
line(`   调用对象：${deepseekLlm.name}（isMock=${deepseekLlm.isMock}）`)
line(`   输入段落数：${paragraphs.length}，输入字符：${messages.reduce((n, m) => n + m.content.length, 0)}`)
line(`   耗时 ${r.ms} ms，Token 输入 ${r.usage?.prompt_tokens} / 输出 ${r.usage?.completion_tokens}，finish_reason=${r.finish_reason}`)
line(`   解析结果：${parseError ? `失败 ${parseError.code} ${parseError.message}` : `成功，共 ${parsed.length} 条台词`}`)
if (parsed) {
  for (const l of parsed.slice(0, 6)) line(`     ${l.speaker}: ${l.text}  ←P${l.source_paragraph}`)
}

// 故意喂入不合规 JSON，验证校验能定位问题（这是"校验真的在工作"的直接证据）
const BAD = [
  ['缺少 text 字段', '{"lines":[{"speaker":"A","source_paragraph":1}]}'],
  ['speaker 取值非法', '{"lines":[{"speaker":"C","text":"你好","source_paragraph":1}]}'],
  ['lines 不是数组', '{"lines":"一段话"}'],
  ['根本不是 JSON', '抱歉，我无法完成这个请求。'],
  ['source_paragraph 不是数字', '{"lines":[{"speaker":"A","text":"你好","source_paragraph":"第一段"}]}']
]
const badResults = []
line(`\n   —— 故意喂入不合规输出，验证校验能报出"第几条、哪里不对"：`)
for (const [name, bad] of BAD) {
  let got
  try {
    parseDialogueJSON(bad)
    got = '未报错（异常）'
  } catch (e) {
    got = `${e.code}：${e.message}`
  }
  badResults.push({ case: name, input: bad, result: got })
  line(`     ${name.padEnd(22)} → ${got}`)
}

out.cases.push({
  id: 'D',
  desc: '结构化输出校验（真实模型 + 故意不合规输入）',
  llm_name: deepseekLlm.name,
  is_mock: deepseekLlm.isMock,
  paragraphs: paragraphs.length,
  input_chars: messages.reduce((n, m) => n + m.content.length, 0),
  input_rendered: renderMessages(messages),
  raw_output: r.text,
  usage: r.usage,
  ms: r.ms,
  finish_reason: r.finish_reason,
  parsed_count: parsed ? parsed.length : null,
  parsed_sample: parsed ? parsed.slice(0, 8) : null,
  parse_error: parseError,
  invalid_cases: badResults
})

/* ───────────────────────────── 落盘 ───────────────────────────── */

fs.writeFileSync(path.join(EVID, '01-llm调用证据.json'), JSON.stringify(out, null, 2), 'utf8')

const md = []
md.push('# 实验5 · §2.1 LLM 调用与输出格式 —— 原始证据\n')
md.push(`采集时间：${out.generated_at}`)
md.push(`\n主要参数：model=${DEFAULT_PARAMS.model}，temperature=${DEFAULT_PARAMS.temperature}，top_p=${DEFAULT_PARAMS.top_p}，max_tokens=${DEFAULT_PARAMS.max_tokens}，stream=false，超时 ${DEFAULT_PARAMS.timeout_ms} ms\n`)
for (const c of out.cases) {
  md.push(`\n## ${c.id}. ${c.desc || c.question}\n`)
  if (c.answer) md.push(`**问题**：${c.question || ''}\n`)
  if (c.insufficient !== undefined && c.insufficient !== null) md.push(`**判定**：${c.insufficient ? `资料不足（${c.insufficient_by}）` : '依据资料回答'}\n`)
  if (c.retrieval) md.push(`**检索**：${c.retrieval.reason}\n`)
  if (c.judge) md.push(`**模型判定**：coverage=${c.judge.coverage}；理由：${c.judge.reason}\n`)
  if (c.usage) md.push(`**调用统计**：耗时 ${c.ms ?? '-'} ms；tokens 输入 ${c.usage.prompt_tokens ?? '-'} / 输出 ${c.usage.completion_tokens ?? '-'} / 合计 ${c.usage.total_tokens ?? '-'}\n`)
  if (c.context) md.push(`**实际上下文**（${c.context.chars} 字符 ≈ ${c.context.est_tokens} tokens）：\n\n\`\`\`\n${c.context.text}\n\`\`\`\n`)
  if (c.answer) md.push(`**回答**：\n\n\`\`\`\n${c.answer}\n\`\`\`\n`)
  if (c.citations) md.push(`**引用检查**：编号 ${c.citations.cited.join('、') || '无'}；有效性 ${c.citations.ok ? '通过' : '失败'}\n`)
  if (c.input_rendered) md.push(`**实际发送给模型的完整输入**：\n\n\`\`\`\n${c.input_rendered}\n\`\`\`\n`)
  if (c.error_code) md.push(`**错误码**：${c.error_code}\n\n**归因**：${c.error_message}\n\n**耗时**：${c.elapsed_ms} ms\n`)
  if (c.invalid_cases) {
    md.push(`**不合规输入校验**：\n\n| 构造的不合规输出 | 校验结果 |\n| --- | --- |\n`)
    for (const b of c.invalid_cases) md.push(`| ${b.case} | ${b.result} |\n`)
  }
}
fs.writeFileSync(path.join(EVID, '01-llm调用证据.md'), md.join('\n'), 'utf8')

line(`\n✓ 证据已写入 实验5-证据/01-llm调用证据.json 与 .md`)
