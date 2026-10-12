/**
 * 实验4 · 基础测试用例
 *
 * 目标不是"跑通就算过"，而是**把每一步的预期写下来，然后拿实际结果去对**。
 * 输出是一张可以直接抄进报告的表：用例 / 输入 / 预期 / 实际 / 判定。
 *
 * 用法：
 *   npm test                 # 若服务未启动，脚本会自己拉起一个（结束自动关掉）
 *   node scripts/test.mjs    # 同上
 *
 * 前置：Node ≥ 22.5（内置 node:sqlite）
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearBusiness, openDb, seedAll } from './seed-core.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3210
const BASE = `http://localhost:${PORT}`

/**
 * 清空 / 恢复样例数据 —— **在本进程内直接做**，不派生子进程。
 * 原因：派生 node 子进程在部分受限环境里会直接 EBUSY 失败，
 * 而一旦失败被忽略，用例就会给出"看起来通过、其实没跑"的假象。
 */
const db = openDb()
function seedClear() {
  clearBusiness(db)
}
function seedRestore() {
  seedAll(db)
}

/* ----------------------------------------------------------- 服务起来 */

async function reachable() {
  try {
    const r = await fetch(`${BASE}/api/tones`, { signal: AbortSignal.timeout(2500) })
    return r.ok
  } catch {
    return false
  }
}

let child = null
let spawnError = ''
if (!(await reachable())) {
  console.log('未发现运行中的服务，自动启动一个（测试结束后关闭）…')
  child = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', String(PORT)],
    { cwd: ROOT, stdio: 'ignore' }
  )
  child.on('error', (e) => {
    spawnError = String(e.message || e)
  })
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    if (await reachable()) break
    if (spawnError) break
  }
  if (!(await reachable())) {
    // 有的受限环境禁止派生进程（spawn 直接 EBUSY）。这时给出可操作的指引，而不是一句"启动失败"。
    console.error(
      spawnError
        ? `无法自动启动服务：${spawnError}\n请先在另一个终端执行  npm run dev  然后再运行  npm test`
        : '服务在 60 秒内没有就绪，请检查 npm run dev 的输出'
    )
    child?.kill()
    process.exit(1)
  }
}

/* --------------------------------------------------------------- 工具 */

async function req(method, url, body) {
  const init = { method, headers: {} }
  if (typeof body === 'string') {
    init.body = body
    init.headers['content-type'] = 'application/json'
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers['content-type'] = 'application/json'
  }
  const r = await fetch(BASE + url, init)
  let j = null
  try {
    j = await r.json()
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: r.status, json: j }
}

const LONG = '这是一段用于验证长度上限的正文。'.repeat(200)
const NOISY = [
  '数据链路层位于物理层与网络层之间，为网络层提供服务。',
  '',
  '如图 1 所示，帧由帧头、数据部分和帧尾组成，帧尾是 4 字节的循环冗余校验码。',
  '',
  '差错控制分为检错与纠错两类，检错只判断是否出错，纠错还要定位到具体哪一位。',
  '',
  '参见第 3.2 节，滑动窗口协议把确认与重传结合起来。'
].join('\n')

const results = []
function record(no, title, input, expect, actual, pass, note = '') {
  results.push({ no, title, input, expect, actual, pass, note })
  console.log(`${pass ? '✅' : '❌'} ${no} ${title}`)
  console.log(`     输入：${input}`)
  console.log(`     预期：${expect}`)
  console.log(`     实际：${actual}`)
  if (note) console.log(`     说明：${note}`)
}

const inRange = (n, max) => Number.isInteger(n) && (n === 0 || (n >= 1 && n <= max))

/* --------------------------------------------------------------- 用例 */

// 先把数据恢复成样例状态，保证用例可重复跑
seedRestore()

/* --- T1 正常：上传并解析 --- */
{
  const t = `/api/articles T1-${Date.now()}`
  const r = await req('POST', '/api/articles', {
    title: t,
    content: NOISY
  })
  const d = r.json?.data
  const pass =
    r.status === 201 && d?.paragraphs?.length === 4 && d?.paragraphs?.[0]?.seq === 1 &&
    d?.paragraphs?.map((p) => p.seq).join(',') === '1,2,3,4'
  record(
    'T1',
    '正常数据：上传并解析文章（段落编号从 1 连续）',
    '4 段、含空行的 Markdown 文本',
    'HTTP 201；段落数 4；seq 连续为 1,2,3,4',
    `HTTP ${r.status}；段落数 ${d?.paragraphs?.length}；seq = ${d?.paragraphs?.map((p) => p.seq).join(',')}`,
    pass
  )
  globalThis.__articleId = d?.article?.id
}

/* --- T2 正常：生成对谈稿 --- */
let scriptId = 0
{
  const r = await req('POST', '/api/scripts', { article_id: globalThis.__articleId, tone_code: 'teacher_student' })
  const d = r.json?.data
  const lines = d?.lines ?? []
  const seqOk = lines.every((l, i) => l.seq === i + 1)
  const spkOk = lines.every((l) => l.speaker === 'A' || l.speaker === 'B')
  const pass = r.status === 201 && lines.length > 0 && seqOk && spkOk
  scriptId = d?.script?.id ?? 0
  record(
    'T2',
    '正常数据：生成对谈稿并落库',
    'POST /api/scripts {article_id, tone_code:teacher_student}',
    'HTTP 201；台词数 > 0；seq 连续；speaker 只取 A/B',
    `HTTP ${r.status}；台词 ${lines.length} 句；seq 连续=${seqOk}；角色合法=${spkOk}`,
    pass
  )
}

/* --- T3 正常：出处必须落在本文段落范围内（AC1 的出处可追溯） --- */
{
  const r = await req('GET', `/api/scripts/${scriptId}`)
  const lines = r.json?.data?.lines ?? []
  const max = (r.json?.data?.paragraphs ?? []).length
  const bad = lines.filter((l) => !inRange(l.source_paragraph, max))
  record(
    'T3',
    '正常数据：每句出处都指向本文已有段落或标为无依据',
    'GET /api/scripts/{id}',
    `每句 source_paragraph ∈ {0} ∪ [1,${max}]`,
    `越界 ${bad.length} 句；越界样例：${JSON.stringify(bad.slice(0, 2))}`,
    bad.length === 0,
    '0 表示"该句没有原文依据"，由程序判定，不是模型说了算'
  )
}

/* --- T4 正常：听觉可用性（AC1：文本中无括号、编号、图表引用） --- */
{
  const r = await req('GET', `/api/scripts/${scriptId}`)
  const lines = r.json?.data?.lines ?? []
  const re = /[（(【\[]|[）)】\]]|\[\s*\d+\s*\]|(?:如|见|参见|详见)\s*(?:图|表)|第\s*[\d.]+\s*节|\*|`/
  const bad = lines.filter((l) => re.test(l.text))
  record(
    'T4',
    '正常数据：台词中无括号、编号、图表引用等书面残留',
    '检查全部台词的文本',
    '0 句含残留（生成时由程序清洗）',
    `${bad.length} 句含残留`,
    bad.length === 0,
    bad.length ? JSON.stringify(bad.slice(0, 2)) : '上游文本含"如图 1 所示""参见第 3.2 节"，已被规则清除'
  )
}

/* --- T5 正常：待确认数与实际可疑项数一致 --- */
{
  const r = await req('GET', `/api/scripts/${scriptId}`)
  const d = r.json?.data
  const flagged = (d?.lines ?? []).filter((l) => l.flag && !l.confirmed).length
  const pending = d?.script?.pending_confirm
  record(
    'T5',
    '正常数据：稿件的待确认数与实际待确认条目一致',
    'GET /api/scripts/{id}',
    'script.pending_confirm === 未确认的可疑条目数',
    `pending_confirm=${pending}，实际=${flagged}`,
    pending === flagged,
    flagged ? `本批被标记 ${flagged} 处（类型 term）：上游文本自带的书面残留` : ''
  )
}

/* --- T6 错误输入：空内容 --- */
{
  const r = await req('POST', '/api/articles', { title: '空', content: '   \n\n  ' })
  record(
    'T6',
    '错误输入：正文为空',
    'content = "   \\n\\n  "',
    'HTTP 400；code=EMPTY_CONTENT；带 suggestion',
    `HTTP ${r.status}；code=${r.json?.error}；suggestion=${r.json?.suggestion ? '有' : '无'}`,
    r.status === 400 && r.json?.error === 'EMPTY_CONTENT' && !!r.json?.suggestion
  )
}

/* --- T7 错误输入：超出字数上限 --- */
{
  const r = await req('POST', '/api/articles', { title: '超长', content: LONG })
  record(
    'T7',
    '错误输入：正文超过 3000 字上限',
    'content = 3200 字',
    'HTTP 413；code=FILE_TOO_LARGE；原因里带实际字数',
    `HTTP ${r.status}；code=${r.json?.error}；reason=${r.json?.reason}`,
    r.status === 413 && r.json?.error === 'FILE_TOO_LARGE'
  )
}

/* --- T8 错误输入：编码/二进制内容 --- */
{
  const r = await req('POST', '/api/articles', { title: '二进制', content: '正常\u0000\u0000内容\uFFFD\uFFFD' })
  record(
    'T8',
    '错误输入：内容含无法识别的字符（二进制或错误编码）',
    'content 含 \\u0000 与 U+FFFD',
    'HTTP 400；code=ENCODING_UNSUPPORTED',
    `HTTP ${r.status}；code=${r.json?.error}；reason=${r.json?.reason}`,
    r.status === 400 && r.json?.error === 'ENCODING_UNSUPPORTED'
  )
}

/* --- T9 错误输入：请求体畸形（初版缺陷，修订版修复） --- */
{
  const r = await req('POST', '/api/articles', '{title: 没有引号}')
  record(
    'T9',
    '错误输入：请求体不是合法 JSON',
    'body = {title: 没有引号}',
    'HTTP 400；code=BAD_REQUEST（属于客户端错误，不应是 500）',
    `HTTP ${r.status}；code=${r.json?.error}`,
    r.status === 400 && r.json?.error === 'BAD_REQUEST',
    '初版此处返回 500 INTERNAL_ERROR，修订版新增 BAD_REQUEST 错误码并修正'
  )
}

/* --- T10 数据不存在 --- */
{
  const r = await req('GET', '/api/articles/999999')
  const r2 = await req('POST', '/api/scripts', { article_id: 999999, tone_code: 'bicker' })
  record(
    'T10',
    '数据不存在：文章编号不存在 / 编号非法',
    'GET /api/articles/999999；POST /api/scripts{article_id:999999}',
    '两处均 HTTP 404；code=NOT_FOUND',
    `GET→${r.status}/${r.json?.error}；POST→${r2.status}/${r2.json?.error}`,
    r.status === 404 && r2.status === 404
  )
}

/* --- T11 数据冲突：口吻不存在 --- */
{
  const r = await req('POST', '/api/scripts', { article_id: globalThis.__articleId, tone_code: 'not_a_tone' })
  record(
    'T11',
    '错误输入：口吻代码不存在',
    'tone_code = not_a_tone',
    'HTTP 400；code=TONE_NOT_FOUND',
    `HTTP ${r.status}；code=${r.json?.error}；reason=${r.json?.reason}`,
    r.status === 400 && r.json?.error === 'TONE_NOT_FOUND',
    '初版把这类情况混进 NOT_FOUND(404)，修订版拆成独立错误码'
  )
}

/* --- T12 业务规则：内容形态不适合转音频（AC3） --- */
{
  const list = await req('GET', '/api/articles')
  const table = (list.json?.data?.articles ?? []).find((a) => a.title.includes('数据汇总表'))
  const r = await req('POST', '/api/scripts', { article_id: table?.id, tone_code: 'bicker' })
  record(
    'T12',
    '业务规则：表格公式占比过高时拒绝生成（AC3）',
    `article_id=${table?.id}（表格文章）`,
    'HTTP 422；code=NOT_SUITABLE_FOR_AUDIO；带 unsuitable_ratio',
    `HTTP ${r.status}；code=${r.json?.error}；ratio=${r.json?.unsuitable_ratio}；reason=${r.json?.reason}`,
    r.status === 422 && r.json?.error === 'NOT_SUITABLE_FOR_AUDIO' && typeof r.json?.unsuitable_ratio === 'number'
  )
}

/* --- T13 人工确认点：仍有未确认项时拒绝合成（AC4） --- */
{
  const r = await req('POST', `/api/scripts/${scriptId}/audio`)
  const ids = r.json?.pending_line_ids
  record(
    'T13',
    '人工确认点：存在未确认的可疑项时拒绝合成音频（AC4）',
    `POST /api/scripts/${scriptId}/audio`,
    'HTTP 409；code=PENDING_CONFIRMATION；返回 pending_line_ids',
    `HTTP ${r.status}；code=${r.json?.error}；pending_line_ids=${JSON.stringify(ids)}`,
    r.status === 409 && r.json?.error === 'PENDING_CONFIRMATION' && Array.isArray(ids) && ids.length > 0
  )
}

/* --- T14 数据冲突：确认一个本来不可疑的条目 --- */
{
  const d = await req('GET', `/api/scripts/${scriptId}`)
  const clean = (d.json?.data?.lines ?? []).find((l) => !l.flag)
  const r = await req('POST', `/api/lines/${clean?.id}/confirm`)
  record(
    'T14',
    '数据冲突：确认一条本来没有被标记的台词',
    `POST /api/lines/${clean?.id}/confirm`,
    'HTTP 409；code=NOT_PENDING_CONFIRMATION（不能静默成功）',
    `HTTP ${r.status}；code=${r.json?.error}`,
    r.status === 409 && r.json?.error === 'NOT_PENDING_CONFIRMATION'
  )
}

/* --- T15 边界：单句超长 --- */
{
  const d = await req('GET', `/api/scripts/${scriptId}`)
  const line = (d.json?.data?.lines ?? [])[0]
  const r = await req('PATCH', `/api/lines/${line?.id}`, { text: '字'.repeat(200) })
  record(
    'T15',
    '边界：单句台词超过长度上限',
    'PATCH /api/lines/{id} { text: 200 字 }',
    'HTTP 400；code=LINE_TOO_LONG；原因带实际字数',
    `HTTP ${r.status}；code=${r.json?.error}；reason=${r.json?.reason}`,
    r.status === 400 && r.json?.error === 'LINE_TOO_LONG'
  )
}

/* --- T16 依赖不可用：语音合成服务不可用时的降级（AC5） --- */
{
  // 先把可疑项全部确认
  const d = await req('GET', `/api/scripts/${scriptId}`)
  const pending = (d.json?.data?.lines ?? []).filter((l) => l.flag && !l.confirmed)
  for (const l of pending) await req('POST', `/api/lines/${l.id}/confirm`)

  const r = await req('POST', `/api/scripts/${scriptId}/audio`)
  const after = await req('GET', `/api/scripts/${scriptId}`)
  const status = after.json?.data?.script?.status
  const linesKept = (after.json?.data?.lines ?? []).length
  record(
    'T16',
    '依赖不可用：语音合成不可用，降级为仅文字稿（AC5）',
    `确认完全部可疑项后 POST /api/scripts/${scriptId}/audio`,
    'HTTP 503；code=TTS_UNAVAILABLE；fallback=text_only；文字稿不丢；稿件状态=text_only',
    `HTTP ${r.status}；code=${r.json?.error}；fallback=${r.json?.fallback}；状态=${status}；文字稿仍有 ${linesKept} 句`,
    r.status === 503 && r.json?.error === 'TTS_UNAVAILABLE' && r.json?.fallback === 'text_only' &&
      status === 'text_only' && linesKept > 0
  )
}

/* --- T17 空数据：清空业务数据后 —— 口吻字典必须还在（初版缺陷，修订版修复） --- */
{
  seedClear()
  const t = await req('GET', '/api/tones')
  const a = await req('GET', '/api/articles')
  const tones = t.json?.data?.tones?.length ?? -1
  const articles = a.json?.data?.articles?.length ?? -1
  record(
    'T17',
    '空数据：清空业务数据后，预置口吻仍可用、历史为空',
    'node scripts/seed.mjs --clear 后读取接口',
    '口吻 = 6（字典数据保留）；历史 = 0；两者都 HTTP 200',
    `口吻 = ${tones}；历史 = ${articles}；HTTP ${t.status}/${a.status}`,
    tones === 6 && articles === 0 && t.status === 200 && a.status === 200,
    '初版把口吻和业务数据一起删了，清空后界面一个口吻都选不了'
  )
}

/* --- T18 可恢复：样例数据一条命令恢复（幂等） --- */
{
  seedRestore()
  const first = await req('GET', '/api/articles')
  seedRestore()
  const second = await req('GET', '/api/articles')
  const n1 = first.json?.data?.articles?.length ?? -1
  const n2 = second.json?.data?.articles?.length ?? -1
  record(
    'T18',
    '可恢复：样例数据可重复初始化且幂等（不会重复插入）',
    '连续执行两次 node scripts/seed.mjs',
    '两次历史条数相同且都 > 0',
    `第一次 ${n1} 条，第二次 ${n2} 条`,
    n1 === n2 && n1 > 0
  )
}

/* --------------------------------------------------------------- 汇总 */

const failed = results.filter((r) => !r.pass)
console.log('\n' + '='.repeat(74))
console.log(`共 ${results.length} 个用例，通过 ${results.length - failed.length}，失败 ${failed.length}`)
if (failed.length) console.log('失败：' + failed.map((f) => `${f.no} ${f.title}`).join('；'))
console.log('='.repeat(74))

if (child) child.kill()
process.exit(failed.length ? 1 : 0)
