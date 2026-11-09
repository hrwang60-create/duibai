/**
 * 实验5 · §2.2 Prompt 与上下文组织 —— 证据采集
 *
 * 采集五组证据：
 *   1. v1 与 v2 的 system prompt 全文与逐条差异（改了哪几条、为什么改）
 *   2. 同一问题用 v1 / v2 各跑一次，比较结果变化（格式、引用、资料不足处理）
 *   3. 一个"资料不足"型问题用 v1 / v2 各跑一次，看两版对"答不了"的处理差别
 *   4. 多轮对话：第二轮带上历史消息，验证按需加入历史
 *   5. 上下文精简：同一问题在"精简开/关"两种设置下的长度与回答变化
 *
 * 输出：../实验5-证据/03-prompt与上下文.json 与 .md
 * 运行：npm run exp5:prompt
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ask } from '../src/ai/rag/ask.mjs'
import { loadIndex } from '../src/ai/rag/store.mjs'
import {
  PROMPT_V1,
  PROMPT_V2,
  buildQaMessages,
  messagesStat,

  renderInput
} from '../src/ai/rag/prompt.mjs'
import { retrieve } from '../src/ai/rag/retrieve.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EVID = path.resolve(ROOT, '..', '实验5-证据')
fs.mkdirSync(EVID, { recursive: true })

const index = loadIndex(path.join(ROOT, 'data', 'kb', 'index.json'))
const out = { generated_at: new Date().toISOString(), sections: {} }
const line = (s = '') => console.log(s)
const rule = (t) => console.log(`\n${'═'.repeat(4)} ${t} ${'═'.repeat(4)}`)

/* ─────────────── 1. 两版 Prompt 全文与差异 ─────────────── */

rule('1. Prompt 两版差异')
line('\n【v1 system（初版）】')
line(PROMPT_V1.system)
line('\n【v2 system（修订版）】')
line(PROMPT_V2.system)

const DIFF = [
  ['① 任务要求与用户问题分离', 'v1 把资料与问题合成一段 user 文本；v2 把任务要求全部放进 system，user 只放【检索资料】与【用户问题】两节',
    'v1 的"不要编造"等约束和每次都在变的资料混在一起，模型对约束的注意力被稀释'],
  ['② 固定回答格式', 'v1 只说"回答尽量简洁"；v2 固定为「结论 1–3 句」+「依据逐条列出」两段',
    'v1 的输出长度随机、要点散落，人工比对困难'],
  ['③ 明确"资料不足"处理', 'v1 未提；v2 要求直接回答"现有资料中没有相关信息"并说明缺哪类信息，且禁止用资料外知识补充',
    'v1 面对资料答不了的问题会用自己的知识补答 —— 在实验5 §2.5 的 Q7 上是明确的失败模式'],
  ['④ 明确"资料之间不一致"处理', 'v1 未提；v2 要求并列两边说法并各标来源，不替用户选择',
    '本知识库确实存在内部不一致（Q8：MVP 范围写"支持 Markdown 与 txt"，界面原型示例却出现 .docx/.pdf）'],
  ['⑤ 明确"问题缺少必要信息"处理', 'v1 未提；v2 要求先指出需要补充什么，再就现有信息给出可能的情况',
    '实验5 §2.1 的 B2 用例（"为什么我生成不了音频"）需要这一条'],
  ['⑥ 明确"超出范围"处理', 'v1 未提；v2 要求回答"这不在我能回答的范围内"，并说明本助手只回答本软件使用问题',
    '实验5 §2.1 的 B3 用例（"帮我写一首诗"）需要这一条']
]
for (const [a, b, c] of DIFF) line(`\n${a}\n  改动：${b}\n  原因：${c}`)
out.sections.diff = DIFF.map(([item, change, reason]) => ({ item, change, reason }))
out.sections.v1_system = PROMPT_V1.system
out.sections.v2_system = PROMPT_V2.system

/* ────────── 2 & 3. 同一问题跑 v1 / v2，比较结果变化 ────────── */

const CASES = [
  ['C1', '可回答问题', '语音合成服务不可用的时候，系统会怎么处理？'],
  ['C2', '资料不足问题', '「对白」的订阅价格是多少？每月多少钱？']
]

rule('2 & 3. v1 与 v2 的结果对比')
line('说明：为了让两版 Prompt 面对**完全相同**的输入，本节关闭模型判定环节（judge=false）——')
line('      否则"资料不足"会在判定环节就被拦下，两版的差异根本走不到回答这一步，比较不出结果。')
out.sections.version_compare = []
for (const [id, type, q] of CASES) {
  line(`\n${'─'.repeat(76)}\n${id}【${type}】${q}`)
  const r1 = await ask({ question: q, index, version: 'v1', judge: false, root: ROOT })
  await new Promise((r) => setTimeout(r, 300))     // 拉开间隔，避免连接复用干扰
  const r2 = await ask({ question: q, index, version: 'v2', judge: false, root: ROOT })

  const rec = {
    id,
    type,
    question: q,
    v1: {
      answer: r1.answer,
      chars: r1.answer.length,
      citations: r1.citations,
      insufficient: r1.insufficient,
      usage: r1.usage,
      input_chars: r1.input?.chars
    },
    v2: {
      answer: r2.answer,
      chars: r2.answer.length,
      citations: r2.citations,
      insufficient: r2.insufficient,
      usage: r2.usage,
      input_chars: r2.input?.chars
    }
  }
  out.sections.version_compare.push(rec)

  line(`v1 回答（${r1.answer.length} 字符，引用 ${r1.citations?.cited?.join('、') || '无'}，判定不足=${r1.insufficient}）：`)
  line(r1.answer.replace(/^/gm, '  '))
  line(`v2 回答（${r2.answer.length} 字符，引用 ${r2.citations?.cited?.join('、') || '无'}，判定不足=${r2.insufficient}）：`)
  line(r2.answer.replace(/^/gm, '  '))
}

/* ───────────────── 4. 多轮对话：按需加入历史消息 ───────────────── */

rule('4. 多轮对话（第二轮带上历史）')
line('说明：本节关闭判定环节（judge=false），目的是隔离"历史消息有没有真的进模型输入"这一件事；')
line('      开着判定时，只要判定为资料不足就会提前返回，看不到回答环节的 messages 组成。')
const t1 = await ask({ question: '「对白」一共提供哪几种口吻？', index, root: ROOT, judge: false })
const history = [
  { role: 'user', content: '「对白」一共提供哪几种口吻？' },
  { role: 'assistant', content: t1.answer }
]
const t2 = await ask({ question: '那这几种里，哪一种适合睡前听？', index, root: ROOT, judge: false, history })
line(`\n第 1 轮：${t1.question}`)
line(t1.answer.replace(/^/gm, '  '))
line(`\n第 2 轮：${t2.question}`)
line(`   实际 messages 条数：${t2.input?.count}（system 1 + 历史 ${history.length} + 本轮 user 1）`)
line(`   输入规模：${t2.input?.chars} 字符 ≈ ${t2.input?.est_tokens} tokens`)
line(t2.answer.replace(/^/gm, '  '))
out.sections.multiturn = {
  turn1: { question: t1.question, answer: t1.answer, citations: t1.citations },
  history,
  turn2: {
    question: t2.question,
    answer: t2.answer,
    citations: t2.citations,
    messages: t2.input?.count,
    input_rendered: t2.input_rendered
  }
}

/* ───────────── 5. 上下文精简：人工检查 Top-k 后下调 k ───────────── */

rule('5. 上下文检查与精简（检查无关/重复信息 → 下调 Top-k → 比较长度与回答）')
const PQ = '从上传文章到听到音频，中间要经过哪些环节？其中哪几处会打断流程、分别返回什么？'

const ret8 = retrieve(index, PQ, { k: 8 })
const chunks8 = ret8.topk.map((r) => ({ ...r.chunk, cov: r.idfcov }))

/**
 * 人工检查表：逐条判断 Top-8 是否与问题相关。
 * 判断依据 = 片段与问题的字面重合度（脚本给出的数值）+ 人工阅读（机器给不出这个结论，
 * 这也是本实验 §2.4 得到的结论之一：相关性最终要靠判断而非阈值）。
 */
const INSPECT = {
  'S1-C12': ['相关', '包含核心用户流程与"可疑处确认是唯一人工确认点"，直接回答问题前半段'],
  'S1-C17': ['相关', '复述核心流程全链路，与问题前半段直接对应'],
  'S3-C01': ['相关', '页面结构与导航，含两条异常路径，回答问题后半段'],
  'S4-C10': ['相关', '含 422/409/503 三种失败情况与响应体，是问题后半段的答案来源'],
  'S3-C05': ['弱相关', '结果页原型的文字，只讲播放与回看，不含中断点'],
  'S1-C15': ['弱相关', '第 2—17 周周计划表，与"环节/中断"无直接关系'],
  'S2-C07': ['无关', '"AI 为何难以用固定规则替代"——主题不同，靠"文章/内容/处理"等常见词混入'],
  'S1-C06': ['无关', '用户画像卡，讲的是用户是谁，不涉及流程环节'],
  'S2-C01': ['无关', '仅文档标题与来源行，没有正文信息，属于重复占位']
}
const withJudgement = chunks8.map((c) => ({
  id: c.id,
  chars: c.chars,
  cov: Number(c.cov.toFixed(3)),
  section: c.section,
  verdict: INSPECT[c.id] ? INSPECT[c.id][0] : '未检查',
  why: INSPECT[c.id] ? INSPECT[c.id][1] : ''
}))
const keepIds = withJudgement.filter((x) => x.verdict === '相关').map((x) => x.id)
const kept4 = chunks8.filter((c) => keepIds.includes(c.id))

const ctx8 = chunks8.map((c) => `[${c.id}]（来源：${c.source_title} › ${c.section}）\n${c.text}`).join('\n\n')
const ctx4 = kept4.map((c) => `[${c.id}]（来源：${c.source_title} › ${c.section}）\n${c.text}`).join('\n\n')

const big = await ask({ question: PQ, index, k: 8, prune: false, judge: false, root: ROOT })
await new Promise((r) => setTimeout(r, 300))
const small = await ask({ question: PQ, index, k: 4, prune: true, judge: false, root: ROOT })

line(`\n问题：${PQ}`)
line(`\n① 检查 Top-8（逐条判断是否与问题相关）：`)
for (const x of withJudgement) {
  line(`   ${x.id}  ${String(x.chars).padStart(4)} 字符  覆盖度=${String(x.cov).padStart(5)}  ${x.verdict}  —— ${x.why}`)
}
line(`\n② 检查结论：8 条中相关 ${withJudgement.filter((x) => x.verdict === '相关').length} 条、弱相关 ${withJudgement.filter((x) => x.verdict === '弱相关').length} 条、无关 ${withJudgement.filter((x) => x.verdict === '无关').length} 条`)
line(`   无关片段的共同特征：覆盖度并不低（S1-C06 达 0.358），但主题不对 ——`)
line(`   再次印证 §2.4 的结论：字面分数高 ≠ 内容相关。`)
line(`\n③ 精简：只保留"相关"的 ${kept4.length} 条`)
line(`   上下文：${ctx8.length} → ${ctx4.length} 字符（减少 ${(((ctx8.length - ctx4.length) / ctx8.length) * 100).toFixed(1)}%）`)
line(`   发送给模型的输入：${big.input?.chars} → ${small.input?.chars} 字符`)
line(`      （估算 ${big.input?.est_tokens} → ${small.input?.est_tokens} tokens）`)
line(`\n④ k=8 的回答（${big.answer.length} 字符，引用 ${big.citations?.cited?.join('、') || '无'}）：`)
line(big.answer.replace(/^/gm, '  '))
line(`\n⑤ k=4 的回答（${small.answer.length} 字符，引用 ${small.citations?.cited?.join('、') || '无'}）：`)
line(small.answer.replace(/^/gm, '  '))

out.sections.prune = {
  question: PQ,
  inspection: withJudgement,
  before: { k: 8, chunks: chunks8.length, context_chars: ctx8.length, input_chars: big.input?.chars, est_tokens: big.input?.est_tokens },
  after: { k: 4, chunks: kept4.length, context_chars: ctx4.length, input_chars: small.input?.chars, est_tokens: small.input?.est_tokens },
  answer: {
    k8: big.answer,
    k4: small.answer,
    k8_citations: big.citations,
    k4_citations: small.citations
  },
  note:
    '自动精简规则（pruneChunks）在本知识库上几乎不触发：中文二元组使任意两段中文至少共享若干词项，' +
    '"零重合"条件不成立；覆盖度下限也很少触发，因为检索阶段已按覆盖度筛过。' +
    '因此本例采用"人工检查后下调 Top-k"的方式，这是本次真正有效的上下文精简手段。'
}

/* ───────── 附：一份实际发送给模型的完整输入（含检索资料与来源） ───────── */

rule('附. 一份实际发送的完整输入')
const sampleMsgs = buildQaMessages({
  question: CASES[0][2],
  chunks: retrieve(index, CASES[0][2], { k: 3 }).topk.map((r) => r.chunk),
  version: 'v2'
})
const st = messagesStat(sampleMsgs)
line(`\nmessages：${st.count} 条；合计 ${st.chars} 字符 ≈ ${st.est_tokens} tokens`)
line(`（实际调用时的完整输入见 01-llm调用证据.md 的 A 段；此处为同构样例，用于展示检索资料与来源如何进入上下文）`)
line('\n' + renderInput(sampleMsgs).slice(0, 2000))
out.sections.sample_input = { stat: st, rendered: renderInput(sampleMsgs), messages: sampleMsgs }

fs.writeFileSync(path.join(EVID, '03-prompt与上下文.json'), JSON.stringify(out, null, 2), 'utf8')

const md = []
md.push('# 实验5 · §2.2 Prompt 与上下文组织 —— 原始证据\n')
md.push(`采集时间：${out.generated_at}\n`)
md.push('## 一、两版 Prompt 的差异\n')
md.push('| 改动 | 内容 | 原因 |\n| --- | --- | --- |')
for (const d of out.sections.diff) md.push(`| ${d.item} | ${d.change} | ${d.reason} |`)
md.push('\n### v1 · system（初版，逐字）\n\n```\n' + PROMPT_V1.system + '\n```\n')
md.push('### v2 · system（修订版，逐字）\n\n```\n' + PROMPT_V2.system + '\n```\n')
md.push('## 二、同一问题在 v1 / v2 下的结果\n')
for (const c of out.sections.version_compare) {
  md.push(`\n### ${c.id}【${c.type}】${c.question}\n`)
  md.push(`- v1：${c.v1.chars} 字符，引用 ${c.v1.citations?.cited?.join('、') || '无'}，判定资料不足=${c.v1.insufficient}，输入 ${c.v1.input_chars} 字符`)
  md.push(`- v2：${c.v2.chars} 字符，引用 ${c.v2.citations?.cited?.join('、') || '无'}，判定资料不足=${c.v2.insufficient}，输入 ${c.v2.input_chars} 字符\n`)
  md.push('**v1 回答**\n\n```\n' + c.v1.answer + '\n```\n')
  md.push('**v2 回答**\n\n```\n' + c.v2.answer + '\n```\n')
}
md.push('## 三、多轮对话\n')
md.push(`第 1 轮：${out.sections.multiturn.turn1.question}\n\n\`\`\`\n${out.sections.multiturn.turn1.answer}\n\`\`\`\n`)
md.push(`第 2 轮：${out.sections.multiturn.turn2.question}\n\n已带入 1 轮历史（2 条消息），实际 messages 共 ${out.sections.multiturn.turn2.messages} 条。\n\n\`\`\`\n${out.sections.multiturn.turn2.answer}\n\`\`\`\n`)
md.push('## 四、上下文检查与精简\n')
md.push(`问题：${out.sections.prune.question}\n`)
md.push('### ① 逐条检查 Top-8\n')
md.push('| 片段 | 字符 | 覆盖度 | 人工判断 | 依据 |')
md.push('| --- | --- | --- | --- | --- |')
for (const x of out.sections.prune.inspection) {
  md.push(`| ${x.id} | ${x.chars} | ${x.cov} | ${x.verdict} | ${x.why} |`)
}
md.push('')
md.push('### ② 精简前后\n')
md.push('| | Top-k | 片段数 | 上下文长度 | 发送给模型的输入 |')
md.push('| --- | --- | --- | --- | --- |')
md.push(`| 精简前 | ${out.sections.prune.before.k} | ${out.sections.prune.before.chunks} | ${out.sections.prune.before.context_chars} 字符 | ${out.sections.prune.before.input_chars} 字符 ≈ ${out.sections.prune.before.est_tokens} tokens |`)
md.push(`| 精简后 | ${out.sections.prune.after.k} | ${out.sections.prune.after.chunks} | ${out.sections.prune.after.context_chars} 字符 | ${out.sections.prune.after.input_chars} 字符 ≈ ${out.sections.prune.after.est_tokens} tokens |`)
md.push('')
md.push(`> ${out.sections.prune.note}\n`)
md.push('### ③ 回答变化\n')
md.push(`**k=8 的回答**（引用 ${out.sections.prune.answer.k8_citations?.cited?.join('、') || '无'}）\n\n\`\`\`\n${out.sections.prune.answer.k8}\n\`\`\`\n`)
md.push(`**k=4 的回答**（引用 ${out.sections.prune.answer.k4_citations?.cited?.join('、') || '无'}）\n\n\`\`\`\n${out.sections.prune.answer.k4}\n\`\`\`\n`)
fs.writeFileSync(path.join(EVID, '03-prompt与上下文.md'), md.join('\n'), 'utf8')

line(`\n✓ 已写入 实验5-证据/03-prompt与上下文.json 与 .md`)
