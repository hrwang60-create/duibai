/**
 * 实验6 · §2.2 工具接口直接测试（不经 Agent）
 *
 * 要求原文：「在接入 Agent 前，直接测试至少一次正确参数和一次错误参数。」
 * 所以这个脚本绕开 Harness，直接按"白名单 → 参数校验 → 执行"的同一套函数调用工具，
 * 把正确参数与各类错误参数的返回逐个打出来。
 *
 * 输出：../实验6-证据/02-工具直接测试.json 与 .md
 * 运行：npm run agent:selftest
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { TOOL_MAP, describeTools } from '../src/ai/agent/tools.mjs'
import { describeErrors, validateArgs } from '../src/ai/agent/validate.mjs'
import { openReadonly, openReadWrite } from '../src/ai/agent/db.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_FILE = path.join(ROOT, 'data', 'duibai.db')
const REPORTS = path.join(ROOT, 'data', 'reports')
const EVID = path.resolve(ROOT, '..', '实验6-证据')
fs.mkdirSync(EVID, { recursive: true })
fs.mkdirSync(REPORTS, { recursive: true })

const db = openReadonly(DB_FILE)
const ctx = { db, reportsDir: REPORTS, root: ROOT, taskId: 'SELFTEST' }

/** 与 Harness 完全相同的三步：白名单 → 参数校验 → 执行 */
async function call(name, args) {
  const tool = TOOL_MAP.get(name)
  if (!tool) return { step: 'allowlist', ok: false, error: 'TOOL_NOT_ALLOWED', message: `工具「${name}」不在允许清单` }

  const v = validateArgs(tool.parameters, args)
  if (!v.ok) {
    return { step: 'validate', ok: false, error: 'PARAM_INVALID', message: describeErrors(v.errors), details: v.errors }
  }

  if (tool.writes === 'db' && !ctx.writeDb) {
    ctx.writeDb = openReadWrite(DB_FILE) // 直接测试时手动提供；Agent 流程里要过确认才会打开
  }

  try {
    const started = Date.now()
    const result = await tool.handler(args, ctx)
    return { step: 'execute', ok: true, ms: Date.now() - started, result }
  } catch (e) {
    return { step: 'execute', ok: false, error: e.toolError || 'TOOL_FAILED', message: e.message, hint: e.hint }
  }
}

const CASES = [
  ['list_scripts', {}, '正确：不传参数'],
  ['get_script', { script_id: 1, limit: 3 }, '正确：只取前 3 条'],
  ['get_script', { script_id: 1, limit: 0 }, '错误：limit 小于下界 1'],
  ['get_script', { script_id: '1' }, '错误：script_id 传成字符串'],
  ['get_script', { script_id: 1, unknown: true }, '错误：多传了未定义字段'],
  ['get_script', { script_id: 999999 }, '错误：稿件不存在（工具内部抛错）'],
  ['get_paragraphs', { article_id: 3 }, '正确：读原文段落'],
  ['lint_script', { script_id: 1, rules: ['readable', 'source'] }, '正确：只跑两条规则'],
  ['lint_script', { script_id: 1, rules: ['typo'] }, '错误：规则名不在枚举里'],
  ['write_report', { script_id: 1, filename: '../../evil.md', content: 'x'.repeat(50) }, '错误：试图跳出允许目录'],
  ['write_report', { script_id: 1, filename: 'ok.md', content: 'too short' }, '错误：内容过短（minLength=20）'],
  ['write_report', { script_id: 1, filename: 'selftest-ok.md', content: '# 自测报告\n\n工具直接测试写入的文件。' }, '正确：写入允许目录'],
  ['run_sql', { sql: 'DELETE FROM dialogue_lines' }, '错误：工具不在白名单']
]

const rows = []
console.log('════ 工具清单 ════')
for (const t of describeTools()) {
  console.log(
    `${t.name.padEnd(20)} 写=${String(t.writes).padEnd(4)} 需确认=${t.requiresConfirmation ? '是' : '否'}  超时=${t.timeoutMs}ms  幂等=${t.idempotent ? '是' : '否'}`
  )
}
console.log('\n════ 参数与权限测试 ════')

for (const [name, args, label] of CASES) {
  const r = await call(name, args)
  const brief = r.ok
    ? summarize(r.result)
    : `${r.error}：${String(r.message).slice(0, 70)}`
  console.log(`${r.ok ? '✅' : '⛔'} ${label}`)
  console.log(`   工具=${name}  参数=${JSON.stringify(args).slice(0, 90)}`)
  console.log(`   阶段=${r.step}  结果=${brief}\n`)
  rows.push({
    label,
    tool: name,
    args,
    stage: r.step,
    ok: r.ok,
    error: r.error || null,
    message: r.message || null,
    brief
  })
}

db.close()
ctx.writeDb?.close()

function summarize(r) {
  if (!r || typeof r !== 'object') return String(r)
  const bits = []
  if (r.count !== undefined) bits.push(`count=${r.count}`)
  if (r.total !== undefined) bits.push(`total=${r.total}`)
  if (r.issue_total !== undefined) bits.push(`issue_total=${r.issue_total}`)
  if (r.counts) bits.push(`counts=${JSON.stringify(r.counts)}`)
  if (r.stats) bits.push(`pending=${r.stats.pending_confirm}, 覆盖率=${r.stats.source_coverage}`)
  if (r.lines) bits.push(`lines=${r.lines.length}`)
  if (r.paragraphs) bits.push(`paragraphs=${r.paragraphs.length}`)
  if (r.path) bits.push(`path=${r.path}`)
  if (r.already !== undefined) bits.push(`already=${r.already}`)
  return bits.join('  ') || JSON.stringify(r).slice(0, 100)
}

const passed = rows.filter((r) => r.ok).length
const rejected = rows.filter((r) => !r.ok && (r.stage === 'validate' || r.stage === 'allowlist')).length
const toolErrors = rows.filter((r) => !r.ok && r.stage === 'execute').length

fs.writeFileSync(
  path.join(EVID, '02-工具直接测试.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), tools: describeTools(), cases: rows, passed, rejected, toolErrors }, null, 2),
  'utf8'
)

const md = []
md.push('# 实验6 · §2.2 工具接口直接测试（未经 Agent）\n')
md.push('调用顺序与 Harness 一致：**白名单 → 参数校验 → 执行**。下表把正确参数与各类错误参数的结果并列。\n')
md.push('## 一、工具清单\n')
md.push('| 工具 | 是否写数据 | 需人工确认 | 最长等待 | 幂等 | 重复调用的后果 |')
md.push('| --- | --- | --- | --- | --- | --- |')
for (const t of describeTools()) {
  md.push(`| \`${t.name}\` | ${t.writes} | ${t.requiresConfirmation ? '是' : '否'} | ${t.timeoutMs} ms | ${t.idempotent ? '是' : '否'} | ${t.idempotencyNote} |`)
}
md.push('\n## 二、正确参数与错误参数\n')
md.push('| # | 类型 | 工具 | 参数 | 停在哪一步 | 结果 |')
md.push('| --- | --- | --- | --- | --- | --- |')
rows.forEach((r, i) => {
  md.push(`| ${i + 1} | ${r.ok ? '正确' : '错误'} | \`${r.tool}\` | \`${JSON.stringify(r.args).slice(0, 70)}\` | ${r.stage} | ${r.brief} |`)
})
md.push('')
md.push(`合计 ${rows.length} 项：通过 ${passed} 项；在校验阶段被拒 ${rejected} 项；执行阶段抛错 ${toolErrors} 项。\n`)
md.push('> 注意两种"错误"的处理方式不同：**校验阶段被拒**的不会进入工具实现（程序拦下来的）；')
md.push('> **执行阶段抛错**的（如记录不存在）会带 `hint` 回传给模型，由模型决定改参数还是换做法。\n')

fs.writeFileSync(path.join(EVID, '02-工具直接测试.md'), md.join('\n'), 'utf8')
console.log(`════ 结果：通过 ${passed} / ${rows.length}；校验拒绝 ${rejected}；执行抛错 ${toolErrors} ════`)
console.log('✓ 已写入 实验6-证据/02-工具直接测试.json 与 .md')
