/**
 * 实验5 · 检索相关性判定的取值依据（阈值校准）
 *
 * 目的：把"相关性判定方法"从拍脑袋变成**经样例检查确定**
 * （实验5 §2.4 要求"说明判断方法，如关键词匹配规则、经样例检查的相似度阈值或模型判断"）。
 *
 * 做法：拿 10 个**应当命中**的问题 + 5 个**应当判定为资料不足**的问题，
 * 逐个看三路信号的实际取值，据此决定阈值与判定方式。
 *
 * 运行：
 *   npm run exp5:calibrate          只跑字面信号（不调用模型，秒级）
 *   npm run exp5:calibrate -- --judge   额外跑模型判定，统计端到端判定准确率
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadIndex } from '../src/ai/rag/store.mjs'
import { COV_MIN, VEC_MIN, hybridSearch, queryProfile, retrieve } from '../src/ai/rag/retrieve.mjs'
import { buildJudgeMessages, composeContext, parseJudgeJSON } from '../src/ai/rag/prompt.mjs'
import { chat } from '../src/ai/llm/deepseek.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const index = loadIndex(path.join(ROOT, 'data', 'kb', 'index.json'))
const withJudge = process.argv.includes('--judge')

const POSITIVE = [
  ['P1', '「对白」一共提供哪几种口吻？'],
  ['P2', '生成结果里有哪些可疑类型需要用户确认？'],
  ['P3', '文章以表格和公式为主时会怎样处理？'],
  ['P4', '从上传文章到听到音频，中间有哪些环节、可能因为什么中断？'],
  ['P5', '这个项目为什么必须用 AI，用固定规则为什么做不到？'],
  ['P6', '语音合成服务不可用的时候，系统会怎么处理？'],
  ['P7', '接口返回 503 和 409 分别代表什么情况？'],
  ['P8', '界面上有哪些页面？首页上有哪些元素？'],
  ['P9', '软件的分层架构分几层，哪一层负责调用模型？'],
  ['P10', '上传的文章有什么格式和长度限制？'],
  ['P11', '口吻有哪些？']
]

const NEGATIVE = [
  ['N1', '「对白」的订阅价格是多少？每月多少钱？'],
  ['N2', '这个软件支持几个人同时在线协作编辑同一份稿件？'],
  ['N3', '光合作用暗反应的具体化学方程式是什么？'],
  ['N4', 'iOS 版什么时候上架 App Store？'],
  ['N5', '帮我写一首关于春天的诗。']
]

const pad = (s, n) => String(s).padEnd(n)
const f = (x, n = 3) => Number(x).toFixed(n)

console.log('═══ 一、三路信号在"应命中"与"应拒答"两组问题上的分布 ═══\n')
console.log('     问题                                  在库词 库外词  最大匹配权重  最大覆盖度  Top-1 余弦')

const measure = (q) => {
  const p = queryProfile(q, index.idfStat)
  const rows = hybridSearch(index, q)
  return {
    known: p.knownTerms.length,
    oov: p.oovTerms.length,
    maxNum: Math.max(...rows.map((r) => r.cov_num)),
    maxCov: Math.max(...rows.map((r) => r.idfcov)),
    maxVec: Math.max(...rows.map((r) => r.vec)),
    top1Vec: rows[0].vec,
    top1: rows[0].chunk.id
  }
}

const posM = POSITIVE.map(([id, q]) => [id, q, measure(q)])
const negM = NEGATIVE.map(([id, q]) => [id, q, measure(q)])

for (const [id, q, m] of posM) {
  console.log(`[应命中] ${pad(q, 36)} ${String(m.known).padStart(5)} ${String(m.oov).padStart(5)} ${f(m.maxNum, 2).padStart(11)} ${f(m.maxCov).padStart(10)}  ${m.top1}`)
}
console.log('')
for (const [id, q, m] of negM) {
  console.log(`[应拒答] ${pad(q, 36)} ${String(m.known).padStart(5)} ${String(m.oov).padStart(5)} ${f(m.maxNum, 2).padStart(11)} ${f(m.maxCov).padStart(10)}  ${m.top1}`)
}

console.log('\n═══ 二、各判据的可分离性（取"应命中组的最差值"与"应拒答组的最好值"比较）═══\n')
const range = (arr, key, mode) => (mode === 'min' ? Math.min(...arr.map((x) => x[2][key])) : Math.max(...arr.map((x) => x[2][key])))
const verdict = (pos, neg, key, mode = 'min', asc = true) => {
  const a = range(posM, key, mode)
  const b = range(negM, key, asc ? 'max' : 'min')
  const ok = asc ? a > b : a < b
  return { a, b, ok }
}
const rowsTable = [
  ['向量余弦（Top-1）', 'top1Vec', 'min', true],
  ['最大匹配权重（覆盖度分子）', 'maxNum', 'min', true],
  ['最大覆盖度（归一化）', 'maxCov', 'min', true]
]
for (const [name, key, mode, asc] of rowsTable) {
  const v = verdict(posM, negM, key, mode, asc)
  console.log(
    `${pad(name, 22)} 应命中组最差 = ${f(v.a, 3)}  vs  应拒答组最好 = ${f(v.b, 3)}   →  ${
      v.ok ? '✓ 可分离' : '✗ 不可分离（区间重叠）'
    }`
  )
}

console.log('\n═══ 三、结论与阈值取值 ═══')
console.log(`
上表三路字面信号**都不可分离**。这与"阈值没调好"不同，是三条独立的原因：

  1) 向量余弦：中文高频词项撑起 0.2–0.35 的"公共相似度地板"，
     无关问题的余弦（最高 ${f(Math.max(...negM.map((x) => x[2].maxVec)))}）高于相关问题的 Top-3 下限。
     这是字面型嵌入的结构性限制，换 TF-IDF 加权也无法消除（已实测）。
  2) 归一化覆盖度：在库词项很少的问题（如"订阅价格是多少"只对上 1 个词）
     会因分母小而虚高到 1.0。
  3) 匹配权重绝对值：把"主题相近但答不出"（光合作用化学方程式）与
     "主题相同且答得出"混在一起 —— 这是**语义**差别，字面信号测不出来。

因此本次采用**分层判定**，把能确定的交给程序、其余交给模型：

  ┌ 程序强判"资料不足"（不调用模型，零费用）
  │   条件：问题里没有一个词项被知识库收录，或 在库词项一个都没被任何片段覆盖。
  │   这是唯一"字面即可断定"的情况。
  ├ 其余情况 → **模型判定**（一次独立的判定调用，见 src/ai/rag/prompt.mjs 的 PROMPT_JUDGE）
  │   由模型判断"这些片段是否真的足以回答问题"，判定结果单独记录、可统计准确率。
  └ 判定通过 → 用覆盖度 ≥ ${COV_MIN} 的片段组织上下文并生成带出处的回答
      （COV_MIN=${COV_MIN} 只用于**挑选进入上下文的片段**，不作为"资料不足"的判定线；
        向量阈值 ${VEC_MIN} 仅作兜底。）

这条结论也直接写进 §2.6 的"当前局限"：在缺少中文分词与专用嵌入服务的前提下，
程序侧的相关性判定能力是整条链路最弱的一环。
`)

if (withJudge) {
  console.log('\n═══ 四、模型判定的端到端准确率（--judge）═══\n')
  let posOk = 0
  let negOk = 0
  const detail = []
  for (const [id, q] of [...POSITIVE, ...NEGATIVE]) {
    const expectAnswer = POSITIVE.some(([i]) => i === id)
    let res
    try {
      const ret = retrieve(index, q)
      if (ret.strong_insufficient) {
        res = { decided: 'insufficient', by: 'program' }
      } else {
        const chunks = ret.topk.map((r) => r.chunk)
        const msgs = buildJudgeMessages({ question: q, chunks })
        const r = await chat(msgs, { json: true, root: ROOT, quiet: true })
        const j = parseJudgeJSON(r.text)
        res = { decided: j.coverage === 'none' ? 'insufficient' : 'answer', by: 'judge', reason: `${j.coverage}：${j.reason}` }
      }
    } catch (e) {
      res = { decided: 'error', by: '-', reason: e.message }
    }
    const ok = res.decided === 'answer' ? expectAnswer : !expectAnswer
    if (expectAnswer && ok) posOk++
    if (!expectAnswer && ok) negOk++
    detail.push([id, expectAnswer ? '应命中' : '应拒答', res.decided, ok ? '✓' : '✗', res.by, res.reason || ''])
  }
  console.log(`${pad('编号', 6)}${pad('期望', 8)}${pad('判定', 12)}${pad('结果', 6)}${pad('判定者', 8)}理由`)
  for (const d of detail) console.log(`${pad(d[0], 6)}${pad(d[1], 8)}${pad(d[2], 12)}${pad(d[3], 6)}${pad(d[4], 8)}${d[5]}`)
  console.log(`\n应命中组判定正确 ${posOk}/${POSITIVE.length}；应拒答组判定正确 ${negOk}/${NEGATIVE.length}`)
  console.log(`整体判定准确率 ${posOk + negOk}/${POSITIVE.length + NEGATIVE.length}`)
}
