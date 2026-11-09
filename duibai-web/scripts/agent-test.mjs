/**
 * 实验6 · §2.6 测试与结果分析
 *
 * 覆盖 5 类必测情况（另加 3 个边界）：
 *   T1 正常完成        —— **真实模型 + 真实工具**（异常类才允许模拟）
 *   T2 参数错误        —— 模型把 script_id 写成字符串，程序拦下 → 回传错误 → 模型改正后继续
 *   T3 工具异常        —— 请求不存在的稿件，工具抛错 → 回传错误与提示
 *   T4 工具名越界      —— 模型请求 run_sql，白名单外，直接拒绝且不执行
 *   T5 达到步数上限    —— 模型一直调工具，步数用尽即停
 *   T6 人工确认 · 同意  —— 写操作获批后确实落库
 *   T7 人工确认 · 拒绝  —— 拒绝后不落库，任务终止
 *   T8 确认等待超时    —— 超时视为不执行
 *
 * 异常与边界用**脚本化的假模型**触发（§2.6 允许"模拟触发"），
 * 好处是错误是确定的、可重复的；正常流程仍走真实模型与真实工具。
 *
 * 运行：npm run agent:test
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runAgent } from '../src/ai/agent/harness.mjs'
import { makeQualityTask, recomputeFacts } from '../src/ai/agent/qualityTask.mjs'
import { openReadonly, openReadWrite } from '../src/ai/agent/db.mjs'
import { chat } from '../src/ai/llm/deepseek.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_FILE = path.join(ROOT, 'data', 'duibai.db')
const REPORTS = path.join(ROOT, 'data', 'reports')
const EVID = path.resolve(ROOT, '..', '实验6-证据')
fs.mkdirSync(EVID, { recursive: true })

/* ───────────────────────── 测试用的小工具 ───────────────────────── */

/** 直接改一下库里两条 term 台词的状态，作为确认类用例的前置条件 */
function setFlag(id, flag, confirmed) {
  const db = openReadWrite(DB_FILE)
  try {
    db.prepare('UPDATE dialogue_lines SET flag = ?, confirmed = ? WHERE id = ?').run(flag, confirmed, id)
  } finally {
    db.close()
  }
}
function readLine(id) {
  const db = openReadonly(DB_FILE)
  try {
    return { ...db.prepare('SELECT id, flag, confirmed FROM dialogue_lines WHERE id = ?').get(id) }
  } finally {
    db.close()
  }
}

/**
 * 脚本化假模型：按给定序列返回，每轮取一条。
 * 用来制造确定的错误与边界，避免"等真实模型碰巧出错"。
 */
function scriptedChat(steps) {
  let i = 0
  return async () => {
    const s = steps[Math.min(i, steps.length - 1)]
    i++
    const toolCalls = (s.tool_calls || []).map((c, k) => ({
      id: `call_fake_${i}_${k}`,
      type: 'function',
      function: {
        name: c.name,
        arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments)
      }
    }))
    return {
      text: s.text || '',
      tool_calls: toolCalls,
      usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
      ms: 2,
      model: 'scripted-fake',
      finish_reason: toolCalls.length ? 'tool_calls' : 'stop'
    }
  }
}

const approve = async () => 'approve'
const reject = async () => 'reject'
const neverResolve = () => new Promise(() => {})

const CASES = []

function addCase(c) {
  CASES.push(c)
}

/* ───────────────────────────── 用例定义 ───────────────────────────── */

addCase({
  id: 'T1',
  category: '正常完成',
  name: '真实模型 + 真实工具：质检 → 确认待确认项 → 写报告',
  model: 'real',
  confirm: approve,
  limits: { maxSteps: 8 },
  expect: (r) => {
    const chk = r.events.find((e) => e.event === 'success_check')
    return {
      ok: r.status === 'completed' && chk?.ok === true,
      basis: `状态=${r.status}；成功复核=${chk?.ok ? '通过' : (chk?.reasons || ['未执行']).join('；')}；步数=${r.steps_used}`
    }
  }
})

addCase({
  id: 'T2',
  category: '参数错误',
  name: '模型把 script_id 写成字符串 "1"，程序拦下并回传错误',
  model: 'fake',
  steps: [
    { tool_calls: [{ name: 'get_script', arguments: { script_id: '1' } }] },
    { tool_calls: [{ name: 'get_script', arguments: { script_id: 1, limit: 3 } }] },
    { text: '已取到稿件，结束演示。' }
  ],
  confirm: approve,
  limits: { maxSteps: 4 },
  expect: (r) => {
    const bad = r.events.find((e) => e.event === 'tool_bad_args')
    const fixed = r.events.find((e) => e.event === 'tool_result' && e.tool === 'get_script')
    return {
      ok: bad?.error_code === 'PARAM_INVALID' && Boolean(fixed),
      basis: `首次拦截=${bad?.error_code || '无'}（${bad?.note?.slice(0, 40) || ''}）；改正后成功=${Boolean(fixed)}`
    }
  }
})

addCase({
  id: 'T3',
  category: '工具异常',
  name: '模型请求不存在的稿件 #999999，工具抛错并回传提示',
  model: 'fake',
  steps: [
    { tool_calls: [{ name: 'get_script', arguments: { script_id: 999999 } }] },
    { text: '稿件不存在，无法质检。' }
  ],
  confirm: approve,
  limits: { maxSteps: 3 },
  expect: (r) => {
    const err = r.events.find((e) => e.event === 'tool_error')
    return {
      ok: err?.error_code === 'NOT_FOUND',
      basis: `错误码=${err?.error_code || '无'}；原因=${(err?.note || '').slice(0, 40)}`
    }
  }
})

addCase({
  id: 'T4',
  category: '工具名越界',
  name: '模型请求白名单外的 run_sql，程序直接拒绝且不执行',
  model: 'fake',
  steps: [
    { tool_calls: [{ name: 'run_sql', arguments: { sql: 'DELETE FROM dialogue_lines' } }] },
    { text: '该工具不可用。' }
  ],
  confirm: approve,
  limits: { maxSteps: 3 },
  expect: (r) => {
    const denied = r.events.find((e) => e.event === 'tool_denied')
    const executed = r.events.find((e) => e.event === 'tool_result' && e.tool === 'run_sql')
    const lines = readLine(4)
    return {
      ok: denied?.error_code === 'TOOL_NOT_ALLOWED' && !executed && lines !== undefined,
      basis: `拒绝码=${denied?.error_code || '无'}；是否执行=${executed ? '是' : '否'}`
    }
  }
})

addCase({
  id: 'T5',
  category: '步数上限',
  name: '模型一直调工具不收敛，达到 maxSteps=3 即停',
  model: 'fake',
  steps: [{ tool_calls: [{ name: 'lint_script', arguments: { script_id: 1 } }] }],
  confirm: approve,
  limits: { maxSteps: 3 },
  expect: (r) => ({
    ok: r.status === 'step_limit' && r.steps_used === 3,
    basis: `状态=${r.status}；步数=${r.steps_used}/3`
  })
})

addCase({
  id: 'T6',
  category: '人工确认·同意',
  name: '写操作获批后确实落库（台词 #4 由 term/未确认 → 已确认）',
  model: 'fake',
  steps: [
    { tool_calls: [{ name: 'set_line_confirmed', arguments: { line_id: 4, confirmed: true } }] },
    { text: '已确认。' }
  ],
  confirm: approve,
  limits: { maxSteps: 3 },
  before: () => setFlag(4, 'term', 0),
  expect: (r) => {
    const row = readLine(4)
    const approved = r.events.find((e) => e.event === 'confirm_approved')
    return {
      ok: Boolean(approved) && row.confirmed === 1,
      basis: `获批=${Boolean(approved)}；库中 confirmed=${row.confirmed}, flag="${row.flag}"`
    }
  }
})

addCase({
  id: 'T7',
  category: '人工确认·拒绝',
  name: '用户拒绝后不执行，任务终止，数据不变',
  model: 'fake',
  steps: [
    { tool_calls: [{ name: 'set_line_confirmed', arguments: { line_id: 8, confirmed: true } }] },
    { text: '用户拒绝，未修改。' }
  ],
  confirm: reject,
  limits: { maxSteps: 3 },
  before: () => setFlag(8, 'term', 0),
  expect: (r) => {
    const row = readLine(8)
    const rejected = r.events.find((e) => e.event === 'confirm_rejected')
    return {
      ok: Boolean(rejected) && r.status === 'rejected' && row.confirmed === 0,
      basis: `状态=${r.status}；库中 confirmed=${row.confirmed}（应为 0）`
    }
  }
})

addCase({
  id: 'T8',
  category: '确认超时',
  name: '等待确认超时，按不执行处理',
  model: 'fake',
  steps: [{ tool_calls: [{ name: 'set_line_confirmed', arguments: { line_id: 8, confirmed: true } }] }],
  confirm: neverResolve,
  confirmTimeoutMs: 250,
  limits: { maxSteps: 3 },
  before: () => setFlag(8, 'term', 0),
  expect: (r) => {
    const row = readLine(8)
    return {
      ok: r.status === 'confirm_timeout' && row.confirmed === 0,
      basis: `状态=${r.status}；库中 confirmed=${row.confirmed}（应为 0）`
    }
  }
})

/* ───────────────────────────── 执行 ───────────────────────────── */

const results = []
console.log('实验6 · 测试用例（共 %d 个）\n', CASES.length)

// 夹具复位：确保起点一致（上一次运行崩溃时可能留下"已确认"的残留，
// 那会让 T1 的基线与报告数字对不上 —— 这不是 Agent 的问题，是测试不干净）。
setFlag(4, 'term', 0)
setFlag(8, 'term', 0)

for (const c of CASES) {
  if (c.before) c.before()
  const baseline = recomputeFacts({ dbFile: DB_FILE, scriptId: 1 })
  const model = c.model === 'real' ? chat : scriptedChat(c.steps || [{ text: '无操作' }])
  process.stdout.write(`▶ ${c.id} ${c.category} —— ${c.name}\n`)
  let r
  try {
    r = await runAgent({
      task: makeQualityTask({ scriptId: 1, baseline }),
      root: ROOT,
      dbFile: DB_FILE,
      reportsDir: REPORTS,
      openReadonly,
      openReadWrite,
      chat: model,
      confirm: c.confirm,
      confirmTimeoutMs: c.confirmTimeoutMs ?? 30000,
      limits: c.limits || { maxSteps: 5 },
      taskId: `TEST-${c.id}-${Date.now().toString(36)}`
    })
  } catch (e) {
    r = { status: 'exception', steps_used: 0, events: [], errors: [{ code: 'EXCEPTION', note: String(e?.message || e) }], usage: {}, task_id: '-' }
  }
  const v = c.expect(r)
  results.push({
    id: c.id,
    category: c.category,
    name: c.name,
    expected_behavior: c.name,
    status: r.status,
    steps_used: r.steps_used,
    tool_calls: r.tool_calls ?? 0,
    duration_ms: r.duration_ms ?? 0,
    passed: v.ok,
    basis: v.basis,
    task_id: r.task_id,
    events: r.events.map((e) => ({ event: e.event, step: e.step, tool: e.tool, error_code: e.error_code, note: e.note })),
    errors: r.errors || []
  })
  console.log(`  ${v.ok ? '✅ 通过' : '❌ 未通过'}  ${v.basis}\n`)
}

// 恢复初始状态（两条 term 待确认），避免把演示数据留在"已确认"
setFlag(4, 'term', 0)
setFlag(8, 'term', 0)

const passed = results.filter((r) => r.passed).length
console.log('════════ 结果：%d / %d 通过 ════════', passed, results.length)
for (const r of results) console.log(`  ${r.passed ? '✓' : '✗'} ${r.id} ${r.category.padEnd(10)} 状态=${r.status}  依据：${r.basis.slice(0, 60)}`)

fs.writeFileSync(path.join(EVID, '05-测试结果.json'), JSON.stringify({ generated_at: new Date().toISOString(), passed, total: results.length, results }, null, 2), 'utf8')
console.log('\n✓ 已写入 实验6-证据/05-测试结果.json')
if (passed !== results.length) process.exitCode = 1
