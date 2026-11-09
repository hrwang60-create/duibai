/**
 * 实验6 · Agent 命令行入口
 *
 * 用法：
 *   node scripts/agent-run.mjs --script 1                 # 需要确认时向你提问（交互）
 *   node scripts/agent-run.mjs --script 1 --confirm approve   # 自动同意（演示/测试用）
 *   node scripts/agent-run.mjs --script 1 --confirm reject    # 一律拒绝
 *   node scripts/agent-run.mjs --script 1 --steps 5 --deadline 60000 --verbose
 *   node scripts/agent-run.mjs --script 1 --json          # 输出完整运行记录
 *
 * 三个入口共用同一份 Harness 与工具（另两个是 /api/agent/run 与 /agent 页面）。
 */

import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

import { runAgent } from '../src/ai/agent/harness.mjs'
import { makeQualityTask, recomputeFacts } from '../src/ai/agent/qualityTask.mjs'
import { openReadonly, openReadWrite } from '../src/ai/agent/db.mjs'
import { chat } from '../src/ai/llm/deepseek.mjs'
import { describeTools } from '../src/ai/agent/tools.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const argv = process.argv.slice(2)
const opt = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : def
}
const flag = (name) => argv.includes(name)

const scriptId = Number(opt('--script', 1))
const confirmMode = opt('--confirm', 'ask') // ask | approve | reject
const maxSteps = Number(opt('--steps', 8))
const totalMs = Number(opt('--deadline', 180000))
const verbose = flag('--verbose')
const asJson = flag('--json')

/** 交互式确认：展示"做什么 + 影响什么"，等用户明确同意；超时/EOF 视为拒绝 */
function makeAskConfirm(timeoutMs = 60000) {
  return ({ tool, args, description }) =>
    new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      let settled = false
      const done = (v) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          rl.close()
        } catch {
          /* ignore */
        }
        resolve(v)
      }
      const timer = setTimeout(() => {
        console.log(`\n  ⏱ 等待确认超过 ${timeoutMs} ms，按"不执行"处理`)
        done('reject')
      }, timeoutMs)
      rl.on('close', () => done('reject')) // EOF（非交互环境）自动视为拒绝，绝不默认同意
      console.log('\n───── 需要你确认 ─────')
      console.log(`工具：${tool}`)
      console.log(`内容：${description}`)
      console.log(`参数：${JSON.stringify(args).slice(0, 300)}`)
      rl.question('是否执行？(y/N) ', (a) => done(/^y(es)?$/i.test(a.trim()) ? 'approve' : 'reject'))
    })
}

const confirm =
  confirmMode === 'approve'
    ? async ({ tool, description }) => {
        console.log(`\n[确认] ${tool} —— ${description}\n       → 自动同意（--confirm approve）`)
        return 'approve'
      }
    : confirmMode === 'reject'
      ? async ({ tool, description }) => {
          console.log(`\n[确认] ${tool} —— ${description}\n       → 拒绝（--confirm reject）`)
          return 'reject'
        }
      : makeAskConfirm()

if (!asJson) {
  console.log('工具清单：')
  for (const t of describeTools()) {
    console.log(
      `  ${t.name.padEnd(20)} 写=${String(t.writes).padEnd(4)} 需确认=${t.requiresConfirmation ? '是' : '否'}  超时=${t.timeoutMs}ms  幂等=${t.idempotent ? '是' : '否'}`
    )
  }
  console.log('')
}

const DB_FILE = path.join(ROOT, 'data', 'duibai.db')

// 任务开始前先记基线：报告描述的是"质检时看到的现状"，
// 若等 Agent 确认完再取数，"待确认数"已经变成 0，核对就没有意义了。
const baseline = recomputeFacts({ dbFile: DB_FILE, scriptId })
if (!baseline.ok) {
  console.error(`✗ ${baseline.reason}`)
  process.exit(1)
}
if (!asJson) {
  console.log(`基线（任务开始时）：总句数 ${baseline.total_lines}，仅可阅读 ${baseline.counts.readable}，出处 ${baseline.counts.source}，待确认 ${baseline.stats.pending_confirm}\n`)
}

const result = await runAgent({
  task: makeQualityTask({ scriptId, baseline }),
  root: ROOT,
  dbFile: DB_FILE,
  reportsDir: path.join(ROOT, 'data', 'reports'),
  openReadonly,
  openReadWrite,
  chat,
  confirm,
  limits: { maxSteps, totalMs },
  verbose
})

if (asJson) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log('\n════════════════ 运行结果 ════════════════')
  console.log(`任务编号：${result.task_id}`)
  console.log(`最终状态：${result.status}`)
  console.log(`执行步数：${result.steps_used} / ${result.max_steps}    工具调用：${result.tool_calls} 次    耗时：${result.duration_ms} ms`)
  console.log(`Token：输入 ${result.usage.prompt} / 输出 ${result.usage.completion} / 合计 ${result.usage.total}`)
  console.log(`日志：${result.log_file}    详细记录：data/agent-runs/${result.task_id}.json`)
  const check = result.events.find((e) => e.event === 'success_check')
  if (check) {
    console.log(`成功标准复核：${check.ok ? '✓ 全部通过' : '✗ ' + (check.reasons || []).join('；')}`)
    if (check.details?.recomputed) console.log(`  程序重算：${JSON.stringify(check.details.recomputed)}`)
  }
  if (result.answer) {
    console.log('\n───── 模型最终回答 ─────')
    console.log(result.answer)
  }
  if (result.errors.length) {
    console.log('\n───── 过程中出现的错误 ─────')
    for (const e of result.errors) console.log(`  [${e.code}] ${e.tool || '-'} ${e.note?.slice(0, 100) || ''}`)
  }
}
