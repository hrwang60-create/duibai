/**
 * 实验5 · 命令行问答入口（RAG 最小链路的命令行形态）
 *
 * 用法：
 *   node scripts/rag-ask.mjs "「对白」一共提供哪几种口吻？"
 *   node scripts/rag-ask.mjs "..." --direct        直接模型组（不检索，作对照）
 *   node scripts/rag-ask.mjs "..." --v1            用 Prompt 初版（v1）跑，对比修订版
 *   node scripts/rag-ask.mjs "..." --k 6           改 Top-k
 *   node scripts/rag-ask.mjs "..." --show-input    打印实际发送给模型的完整输入
 *   node scripts/rag-ask.mjs "..." --json          以 JSON 输出（便于留证与二次分析）
 *
 * 与页面/接口共用同一个模块 src/ai/rag/ask.mjs —— 三种入口，一套逻辑。
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ask } from '../src/ai/rag/ask.mjs'
import { loadIndex } from '../src/ai/rag/store.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const opt = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : def
}
const question = argv.find((a) => !a.startsWith('--') && !/^\d+$/.test(a))
if (!question) {
  console.error('用法：node scripts/rag-ask.mjs "你的问题" [--direct] [--v1] [--k 4] [--show-input] [--json]')
  process.exit(1)
}

const index = loadIndex(path.join(ROOT, 'data', 'kb', 'index.json'))
const res = await ask({
  question,
  index,
  mode: flag('--direct') ? 'direct' : 'rag',
  version: flag('--v1') ? 'v1' : 'v2',
  k: Number(opt('--k', 4)),
  prune: !flag('--no-prune'),
  judge: !flag('--no-judge'),
  root: ROOT
})

if (flag('--json')) {
  console.log(JSON.stringify(res, null, 2))
  process.exit(0)
}

const HR = '─'.repeat(78)
console.log(HR)
console.log(`问题：${res.question}`)
console.log(`模式：${res.mode}${res.version ? ` / Prompt ${res.version}` : ''}   模型：${res.model || '(未调用)'}   总耗时：${res.total_ms} ms`)

if (res.retrieval) {
  console.log(HR)
  console.log('① 检索')
  console.log(`   判定：${res.retrieval.reason}`)
  console.log(`   k = ${res.retrieval.k}，扫描 ${res.retrieval.stats.scanned} 条，有内容词重合 ${res.retrieval.stats.with_overlap} 条，最大覆盖度 ${res.retrieval.max_coverage}`)
  console.log('   Top-k（按相关性排序，含排序依据）：')
  for (const r of res.retrieval.topk) {
    console.log(
      `     ${r.id}  RRF=${r.rrf}  覆盖度=${r.idfcov}  余弦=${r.vec}  名次(向量/BM25)=${r.rank_vec}/${r.rank_bm25}  ${r.chars}字  ${r.section}`
    )
  }
  if (res.pruned) {
    console.log(`   上下文精简：候选 ${res.pruned.before} 条 → 采用 ${res.pruned.after} 条` +
      (res.pruned.removed.length ? `（移除 ${res.pruned.removed.map((x) => `${x.id}:${x.reason}`).join('、')}）` : ''))
  }
  if (res.context) {
    console.log(`   上下文规模：${res.context.chars} 字符 ≈ ${res.context.est_tokens} tokens`)
  }
}

if (res.judge) {
  console.log(HR)
  console.log('② 模型判定（能否回答）')
  console.log(`   coverage = ${res.judge.coverage}   理由：${res.judge.reason}`)
  if (res.judge.missing) console.log(`   缺少的信息：${res.judge.missing}`)
}

console.log(HR)
console.log(`③ 回答（${res.insufficient ? '资料不足' : '依据资料生成'}${res.insufficient_by ? ` / 由${res.insufficient_by === 'program' ? '程序' : '模型'}判定` : ''}）`)
console.log(res.answer)

if (res.citations) {
  console.log(HR)
  console.log('引用检查')
  console.log(`   引用编号：${res.citations.cited.join('、') || '（无）'}`)
  console.log(`   编号是否有效：${res.citations.ok ? '✓ 全部来自给定片段' : `✗ 编造编号 ${res.citations.invalid.join('、')}`}`)
  console.log(`   给定片段的被引用比例：${(res.citations.coverage * 100).toFixed(0)}%${res.citations.uncited.length ? `（未引用：${res.citations.uncited.join('、')}）` : ''}`)
}

if (res.usage) {
  console.log(HR)
  console.log('调用统计')
  for (const c of res.calls || []) {
    console.log(`   ${c.stage.padEnd(7)} ${c.ms} ms  tokens: in ${c.usage?.prompt_tokens ?? '?'} / out ${c.usage?.completion_tokens ?? '?'} / 合计 ${c.usage?.total_tokens ?? '?'}`)
  }
}

if (flag('--show-input') && res.input_rendered) {
  console.log(HR)
  console.log('实际发送给模型的完整输入')
  console.log(res.input_rendered)
}
