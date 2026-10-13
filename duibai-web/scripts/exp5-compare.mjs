/**
 * 实验5 · §2.5 对比测试与质量分析
 *
 * 两组使用**相同的问题、相同的模型、相同的主要参数、相同的基本输出格式**：
 *   - 直接模型组：system 与 RAG 组逐条对齐，但不提供检索资料、不要求引用来源；
 *   - RAG 组    ：先检索、再判定、再依据资料作答并要求标注来源编号。
 * 两组各次测试都新建自己的 messages 数组（**独立上下文**），
 * 不存在前一次结果影响后一次的可能 —— 脚本里每题的两次调用各建一次 messages，
 * 且总 system prompt 不含任何历史。
 *
 * 输出：
 *   ../实验5-证据/02-对比测试.json   原始数据（两组的回答、引用、耗时、Token）
 *   ../实验5-证据/02-对比测试.md     报告用表格
 *
 * 运行：npm run exp5:compare
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ask, checkCitations } from '../src/ai/rag/ask.mjs'
import { loadIndex } from '../src/ai/rag/store.mjs'
import { buildQaMessages, composeContext, messagesStat } from '../src/ai/rag/prompt.mjs'
import { DEFAULT_PARAMS } from '../src/ai/llm/deepseek.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EVID = path.resolve(ROOT, '..', '实验5-证据')
fs.mkdirSync(EVID, { recursive: true })

const index = loadIndex(path.join(ROOT, 'data', 'kb', 'index.json'))

/**
 * 8 个固定问题 + 判断规则。
 *   must —— 回答必须覆盖的要点（人工判定时逐条对照）
 *   forbid —— 出现即判为"无依据内容"的客观特征（脚本自动检查）
 *   type —— 单片段可回答 / 多片段综合 / 资料无答案 / 含义不清
 */
export const QUESTIONS = [
  {
    id: 'Q1',
    type: '单片段可回答',
    q: '「对白」一共提供哪几种口吻？分别是什么？',
    must: ['6 种', '师生、抬杠、老少、访谈、播客对谈、睡前'],
    // 口吻数量被说成 6 以外的数字即判为"无依据内容"
    forbid: [/(?:^|[^\d])(?:3|4|5|7|8|9|10)\s*种口吻/]
  },
  {
    id: 'Q2',
    type: '单片段可回答',
    q: '生成结果里的可疑处有哪几种类型？',
    must: ['术语读法不确定', '数字与原文不一致', '无原文依据（找不到对应段落）'],
    forbid: [/音频时长过长/, /标点错误/]
  },
  {
    id: 'Q3',
    type: '单片段可回答',
    q: '如果文章以表格和公式为主，系统会怎么处理？',
    must: ['生成前拒绝', '提示不适合转为音频并说明原因', '不产出音频', '可建议改为文字摘要'],
    forbid: [/仍然正常生成音频/]
  },
  {
    id: 'Q4',
    type: '多片段综合',
    q: '从上传文章到听到音频，中间要经过哪些环节？其中哪几处会打断流程、分别返回什么？',
    must: ['上传→选口吻→生成对话稿→确认可疑处→合成音频→播放回看', '不适合转音频 422', '存在未确认项 409', '语音合成不可用 503 并降级为仅文字稿'],
    forbid: []
  },
  {
    id: 'Q5',
    type: '多片段综合',
    q: '这个项目为什么必须用 AI？用固定规则为什么做不到？',
    must: ['四个无法规则化的判断点', '口吻同时作用于文本层（改写台词）与语音层（情绪指令）'],
    forbid: []
  },
  {
    id: 'Q6',
    type: '多片段综合',
    q: '生成的台词里哪些错误是绝对不允许出现的？由谁负责把这些错误检查出来？',
    must: ['术语读错、数字被改动、出现原文没有依据的陈述', '程序做结构/出处/括号残留等校验', '用户确认可疑处'],
    forbid: []
  },
  {
    id: 'Q7',
    type: '资料无答案',
    q: '「对白」的订阅价格是多少？每月多少钱？',
    must: ['明确说明资料中没有价格信息 / 无法回答', '不得给出任何具体价格'],
    forbid: [/[¥￥]\s*\d/, /\d+\s*元\s*\/?\s*(月|年)/, /每月\s*\d/, /订阅费\s*\d/]
  },
  {
    id: 'Q8',
    type: '含义不清（资料内部不一致）',
    q: '我上传的 PDF 文件能直接识别吗？',
    must: ['指出资料只写了支持 Markdown 与 txt', '或指出示例中出现过 .docx/.pdf 与上述说法不一致'],
    forbid: [/完全支持所有格式的 PDF/, /一定可以/]
  }
]

/* ───────────────────────────── 跑两组 ───────────────────────────── */

const HALF = '─'.repeat(78)
const results = []

console.log('开始对比测试：%d 个问题 × 2 组 = %d 次问答（RAG 组每题另含 1 次判定调用）',
  QUESTIONS.length, QUESTIONS.length * 2)

for (const item of QUESTIONS) {
  console.log(`\n${HALF}\n${item.id}【${item.type}】${item.q}`)

  // —— 直接模型组：不检索、无资料 ——
  const direct = await ask({ question: item.q, mode: 'direct', root: ROOT })

  // —— RAG 组：检索 + 判定 + 依据资料回答 ——
  const rag = await ask({ question: item.q, index, mode: 'rag', version: 'v2', root: ROOT })

  // 客观检查：是否命中"禁止出现的特征"
  const hitForbid = (text) =>
    item.forbid.flatMap((re) => {
      const m = String(text).match(re)
      return m ? [m[0]] : []
    })

  const rec = {
    id: item.id,
    type: item.type,
    question: item.q,
    must: item.must,
    direct: {
      answer: direct.answer,
      model: direct.model,
      ms: direct.ms,
      usage: direct.usage,
      calls: direct.calls,
      input: direct.input,
      forbidden_hits: hitForbid(direct.answer),
      answer_chars: direct.answer.length
    },
    rag: {
      answer: rag.answer,
      model: rag.model,
      ms: rag.ms,
      total_ms: rag.total_ms,
      usage: rag.usage,
      calls: rag.calls,
      insufficient: rag.insufficient,
      insufficient_by: rag.insufficient_by,
      judge: rag.judge,
      retrieval_reason: rag.retrieval.reason,
      topk: rag.retrieval.topk,
      context_chars: rag.context.chars,
      context_ids: rag.context.chunks.map((c) => c.id),
      citations: rag.citations,
      citations_recheck: rag.context.chunks.length ? checkCitations(rag.answer, rag.context.chunks) : null,
      forbidden_hits: hitForbid(rag.answer),
      answer_chars: rag.answer.length,
      input: rag.input,
      input_rendered: rag.input_rendered
    }
  }
  results.push(rec)

  console.log(`直接组（${direct.ms} ms，tokens ${direct.usage?.total_tokens}）：`)
  console.log(direct.answer.replace(/^/gm, '  '))
  console.log(`RAG 组（总 ${rag.total_ms} ms，判定=${rag.judge ? rag.judge.coverage : '未调用'}，引用=${rag.citations?.cited?.join('、') || '无'}）：`)
  console.log(rag.answer.replace(/^/gm, '  '))
  if (rec.direct.forbidden_hits.length) console.log(`  ⚠ 直接组命中禁止特征：${rec.direct.forbidden_hits.join('、')}`)
  if (rec.rag.forbidden_hits.length) console.log(`  ⚠ RAG 组命中禁止特征：${rec.rag.forbidden_hits.join('、')}`)
}

/* ───────────────────────────── 汇总统计 ───────────────────────────── */

const sumTokens = (calls) =>
  calls.reduce(
    (a, c) => ({
      prompt: a.prompt + (c.usage?.prompt_tokens || 0),
      completion: a.completion + (c.usage?.completion_tokens || 0),
      total: a.total + (c.usage?.total_tokens || 0)
    }),
    { prompt: 0, completion: 0, total: 0 }
  )

const agg = {
  direct: { ms: 0, tokens: { prompt: 0, completion: 0, total: 0 }, calls: 0 },
  rag: { ms: 0, tokens: { prompt: 0, completion: 0, total: 0 }, calls: 0 }
}
for (const r of results) {
  const d = sumTokens(r.direct.calls)
  const g = sumTokens(r.rag.calls)
  agg.direct.ms += r.direct.ms
  agg.direct.calls += r.direct.calls.length
  agg.direct.tokens.prompt += d.prompt
  agg.direct.tokens.completion += d.completion
  agg.direct.tokens.total += d.total
  agg.rag.ms += r.rag.total_ms
  agg.rag.calls += r.rag.calls.length
  agg.rag.tokens.prompt += g.prompt
  agg.rag.tokens.completion += g.completion
  agg.rag.tokens.total += g.total
}

// 引用可靠性统计（客观）
const ragAnswered = results.filter((r) => r.rag.insufficient === false)
const citeStat = {
  answered: ragAnswered.length,
  with_invalid_id: ragAnswered.filter((r) => r.rag.citations && !r.rag.citations.ok).length,
  invalid_ids: ragAnswered.flatMap((r) => (r.rag.citations?.invalid || []).map((x) => `${r.id}:${x}`)),
  avg_coverage:
    ragAnswered.length
      ? Number((ragAnswered.reduce((n, r) => n + (r.rag.citations?.coverage || 0), 0) / ragAnswered.length).toFixed(2))
      : 0,
  uncited_chunks: ragAnswered.flatMap((r) => (r.rag.citations?.uncited || []).map((x) => `${r.id}:${x}`))
}

const summary = {
  generated_at: new Date().toISOString(),
  model_params: DEFAULT_PARAMS,
  groups: { direct: '直接模型组（无检索资料）', rag: 'RAG 组（检索 + 模型判定 + 依据资料作答）' },
  aggregate: agg,
  citation_reliability: citeStat,
  insufficient_count: results.filter((r) => r.rag.insufficient).length,
  direct_forbidden_total: results.reduce((n, r) => n + r.direct.forbidden_hits.length, 0),
  rag_forbidden_total: results.reduce((n, r) => n + r.rag.forbidden_hits.length, 0)
}

fs.writeFileSync(
  path.join(EVID, '02-对比测试.json'),
  JSON.stringify({ summary, results }, null, 2),
  'utf8'
)

/* ───────────────────────────── 生成 markdown ───────────────────────────── */

const md = []
md.push('# 实验5 · §2.5 对比测试原始记录\n')
md.push(`采集时间：${summary.generated_at}`)
md.push(`\n共同设置：model=${DEFAULT_PARAMS.model}，temperature=${DEFAULT_PARAMS.temperature}，top_p=${DEFAULT_PARAMS.top_p}，max_tokens=${DEFAULT_PARAMS.max_tokens}，stream=false`)
md.push(`\n两组提示词差异：直接组 system 与 RAG 组逐条对齐，仅把「只依据检索资料、禁止资料外知识」换成「依据你自己的知识」，把「必须标注来源编号」换成「不需要标注来源」，把「资料不足时说明缺什么」换成「不确定就说不确定」。两组回答格式要求（结论 + 依据两段）完全相同。`)
md.push(`\n各次测试均独立构造 messages 数组，无共享历史。\n`)

for (const r of results) {
  md.push(`\n## ${r.id}【${r.type}】${r.question}\n`)
  md.push(`**应覆盖要点**：${r.must.map((m) => `\`${m}\``).join(' ')}\n`)
  md.push(`### 直接模型组（${r.direct.ms} ms；tokens ${r.direct.usage?.total_tokens ?? '-'}）\n`)
  md.push('```\n' + r.direct.answer + '\n```\n')
  if (r.direct.forbidden_hits.length) md.push(`> ⚠ 命中"不应出现"特征：${r.direct.forbidden_hits.join('、')}\n`)
  md.push(`### RAG 组（总 ${r.rag.total_ms} ms；判定 coverage=${r.rag.judge ? r.rag.judge.coverage : '未调用'}；tokens ${r.rag.usage?.total_tokens ?? '-'}）\n`)
  md.push(`- 检索：${r.rag.retrieval_reason}`)
  md.push(`- 进入上下文：${r.rag.context_ids.join('、') || '（无）'}（${r.rag.context_chars} 字符）`)
  if (r.rag.judge) md.push(`- 模型判定：coverage=${r.rag.judge.coverage}；理由：${r.rag.judge.reason}${r.rag.judge.missing ? `；缺口：${r.rag.judge.missing}` : ''}`)
  md.push(`- 引用编号：${r.rag.citations?.cited?.join('、') || '（无）'}；编号有效性：${r.rag.citations?.ok ? '通过' : '失败'}`)
  md.push('')
  md.push('```\n' + r.rag.answer + '\n```\n')
  if (r.rag.forbidden_hits.length) md.push(`> ⚠ 命中"不应出现"特征：${r.rag.forbidden_hits.join('、')}\n`)
}

md.push('\n## 汇总\n')
md.push('| 指标 | 直接模型组 | RAG 组 |')
md.push('| --- | --- | --- |')
md.push(`| 调用次数 | ${agg.direct.calls} | ${agg.rag.calls}（每题含 1 次判定） |`)
md.push(`| 合计耗时 | ${agg.direct.ms} ms | ${agg.rag.ms} ms |`)
md.push(`| 输入 tokens | ${agg.direct.tokens.prompt} | ${agg.rag.tokens.prompt} |`)
md.push(`| 输出 tokens | ${agg.direct.tokens.completion} | ${agg.rag.tokens.completion} |`)
md.push(`| 合计 tokens | ${agg.direct.tokens.total} | ${agg.rag.tokens.total} |`)
md.push(`| 命中"不应出现"特征次数 | ${summary.direct_forbidden_total} | ${summary.rag_forbidden_total} |`)
md.push(`| 判定为资料不足的题数 | — | ${summary.insufficient_count} / ${results.length} |`)
md.push('')
md.push(`引用可靠性：RAG 组有 ${citeStat.answered} 题给出了回答；其中引用编号无效（编造）的有 ${citeStat.with_invalid_id} 题；平均引用覆盖率 ${citeStat.avg_coverage}。`)
if (citeStat.invalid_ids.length) md.push(`\n- 编造的编号：${citeStat.invalid_ids.join('、')}`)
if (citeStat.uncited_chunks.length) md.push(`\n- 给了上下文但未被引用的片段：${citeStat.uncited_chunks.join('、')}`)

fs.writeFileSync(path.join(EVID, '02-对比测试.md'), md.join('\n'), 'utf8')

console.log(`\n${HALF}`)
console.log('汇总：')
console.log(`  直接组：调用 ${agg.direct.calls} 次，耗时 ${agg.direct.ms} ms，tokens ${agg.direct.tokens.total}`)
console.log(`  RAG 组：调用 ${agg.rag.calls} 次，耗时 ${agg.rag.ms} ms，tokens ${agg.rag.tokens.total}`)
console.log(`  引用可靠性：回答 ${citeStat.answered} 题，其中编号无效 ${citeStat.with_invalid_id} 题，平均覆盖率 ${citeStat.avg_coverage}`)
console.log(`  命中"不应出现"特征：直接组 ${summary.direct_forbidden_total} 次，RAG 组 ${summary.rag_forbidden_total} 次`)
console.log(`\n✓ 已写入 实验5-证据/02-对比测试.json 与 .md`)
