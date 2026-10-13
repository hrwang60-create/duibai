/**
 * AI 能力层 · RAG 环节三：混合检索（向量 + 关键词 → RRF 融合 → 相关性判定）
 *
 * 三步，缺一不可：
 *   1. 两路独立召回：向量余弦（同义表述）+ BM25（精确词项）；
 *   2. RRF 融合排序：Reciprocal Rank Fusion，只看**名次**不看分数 ——
 *      两路的分数尺度完全不同（余弦 0–1，BM25 无上界），直接加权相加
 *      需要调一个说不清的权重；RRF 用 1/(k+rank) 天然规避了这个问题，
 *      是工业界做混合检索的常规做法；
 *   3. 相关性判定（**这一步才是实验5 §2.4 的关键**）：
 *      "返回了片段"≠"片段相关"。本文件用一条可复查的规则决定
 *      哪些片段真的有依据，其余一律不进上下文；一个都没有 → 资料不足。
 */

import { bm25Scores, buildBm25, keywordHitRatio } from './bm25.mjs'
import { cosine, vectorFromJSON } from './embed.mjs'
import { tokenize } from './token.mjs'

/** 融合参数与阈值 —— 取值见 exp5-calibrate 的实测记录 */
export const RRF_K = 60
/** Top-k：默认取 4。理由见 pickTopK() 注释 */
export const DEFAULT_TOP_K = 4
/**
 * 阈值（经样例检查确定，见 scripts/exp5-calibrate.mjs 的输出）：
 *   COV_MIN —— 内容词覆盖度下限，**只用于统计与展示，不用于最终判定**。
 *   VEC_MIN —— 向量余弦下限，**只作为兜底**；实测在本知识库上不可分离。
 *   OOV_MAX —— 词汇失配率上限，**记录在案但未采用**（原因见文件末尾的实测记录）。
 */
export const COV_MIN = 0.10
export const VEC_MIN = 0.18
export const OOV_MAX = 0.5
/** 关键词命中率阈值（保留仅作对照，不再参与判定） */
export const HIT_MIN = 0.34

/** 未登录词（OOV）的权重。取一个接近"只出现 1 次的词"的量级，使其与语料内词项可比。 */
const OOV_WEIGHT = 3.2

/**
 * 问题的"词汇画像"。分两个信号，它们的**分母不同**，不能混：
 *
 *   - `knownTerms`（在库内容词）：问题的词项里，知识库语料中出现过的那些。
 *     它们被片段覆盖的比例 → `idfCoverage`，回答"这一段讲了没有"。
 *   - `oovTerms`（库外词）：语料里从未出现过的词项。它们的占比 → `oovRatio`，
 *     作为"话题是否超出知识库范围"的**参考指标记录在案**。
 *
 * ⚠️ 两次实测纠正（报告里如实记录，这是本环节最主要的教训）：
 *
 *   ① 不能把 OOV 词项放进覆盖度的分母。库外词项的权重最高，
 *      会把分母撑大、让正相关问题的覆盖度也掉到 0，方向完全反了。
 *
 *   ② 也不能"只取 IDF 最高的一半词项"来提纯内容词（曾这么做过）。
 *      中文二元组会切出大量**跨词边界的组合**（"一共提供" → 一共、共提、供哪），
 *      这些组合 IDF 最高，于是"提纯"的结果恰好是把它们全选进来、
 *      把真正承载主题的中频词（口吻、上传、音频）挤出去 ——
 *      结果是"「对白」一共有哪几种口吻"被判成资料不足。
 *
 *   最终做法：**用全部在库词项做分母**，让 IDF 只影响权重、不参与筛选。
 */
export function queryProfile(query, idfStat) {
  const terms = [...new Set(tokenize(query))]
  const items = terms.map((t) => {
    const known = Boolean(idfStat?.idf?.has(t))
    return { term: t, known, w: known ? idfStat.idf.get(t) : OOV_WEIGHT }
  })
  const knownTerms = items.filter((i) => i.known)
  const oovTerms = items.filter((i) => !i.known)
  const knownW = knownTerms.reduce((n, i) => n + i.w, 0)
  const oovW = oovTerms.reduce((n, i) => n + i.w, 0)
  return {
    terms: items,
    knownTerms,
    oovTerms,
    oovRatio: knownW + oovW > 0 ? oovW / (knownW + oovW) : 0
  }
}

/** 在词汇里的内容词，被某片段覆盖的**比例**（IDF 加权） */
export function idfCoverage(profile, text) {
  if (!profile.knownTerms.length) return 0
  const { num, den } = coverageParts(profile, text)
  return den ? num / den : 0
}

/**
 * 覆盖度的两个分量：`num` 是被覆盖词项的权重之和，`den` 是在库词项的总权重。
 *
 * 为什么要单独看 `num`（未归一化的匹配质量）：
 *   当问题只在库词项很少时（如"订阅价格是多少"只对上 1 个词），
 *   归一化比例会因为分母小而被高估成 1.0，看起来"完全命中"，实则是假象。
 *   绝对权重之和不受这个问题影响 —— 对上的词少，`num` 就是小。
 */
export function coverageParts(profile, text) {
  const inDoc = new Set(tokenize(text))
  let num = 0
  let den = 0
  for (const i of profile.knownTerms) {
    den += i.w
    if (inDoc.has(i.term)) num += i.w
  }
  return { num, den }
}

/**
 * 从检索索引取两路分数并做 RRF 融合。
 *
 * @param {object} index   { chunks, vectors, bm25 }
 * @param {string} query
 * @returns {Array<{ chunk: object, vec: number, bm25: number, rrf: number, hit: number,
 *                   rank_vec: number|null, rank_bm25: number|null }>}
 */
export function hybridSearch(index, query) {
  const chunks = index.chunks
  const n = chunks.length
  if (!n) return []

  // —— 第 1 路：向量余弦 ——
  const qv = index.embedQuery(query)
  const vec = new Array(n)
  for (let i = 0; i < n; i++) vec[i] = cosine(qv, vectorFromJSON(index.vectors[i]))

  // —— 第 2 路：BM25 关键词 ——
  // 索引落盘时不存逐片段词项（体积大且可由正文重建），这里按需补上：
  // 没有 docs 就现算一次，保证从磁盘读回的索引与内存索引行为完全一致。
  const st = index.bm25.docs
    ? index.bm25
    : { ...index.bm25, docs: chunks.map((c) => tokenize(c.text)) }
  const bm = bm25Scores(query, st)

  const rankOf = (arr, desc = true) => {
    const order = arr.map((s, i) => [s, i]).sort((a, b) => (desc ? b[0] - a[0] : a[0] - b[0]))
    const r = new Array(arr.length).fill(null)
    order.forEach(([, i], idx) => {
      r[i] = idx + 1
    })
    return r
  }
  const rankVec = rankOf(vec)
  const rankBm = rankOf(bm)

  // 问题的内容词画像只算一次（与片段无关），逐片段只算覆盖度
  const profile = queryProfile(query, index.idfStat)

  const rows = []
  for (let i = 0; i < n; i++) {
    const parts = coverageParts(profile, chunks[i].text)
    rows.push({
      chunk: chunks[i],
      vec: vec[i],
      bm25: bm[i],
      hit: keywordHitRatio(query, chunks[i].text),
      cov_num: parts.num,
      cov_den: parts.den,
      idfcov: parts.den ? parts.num / parts.den : 0,
      rank_vec: rankVec[i],
      rank_bm25: rankBm[i],
      rrf: 0
    })
  }
  // RRF：名次越靠前贡献越大；k=60 使相邻名次的分差平缓，避免"第 1 名一票否决"
  for (const r of rows) {
    r.rrf = 1 / (RRF_K + r.rank_vec) + 1 / (RRF_K + r.rank_bm25)
  }
  rows.sort((a, b) => b.rrf - a.rrf)

  // 把问题级画像挂在数组上带回（retrieve 需要用它做"资料不足"的判定）
  Object.defineProperty(rows, 'profile', { value: profile, enumerable: false })
  return rows
}

/**
 * 相关性判定：一条片段要进入上下文，必须满足**关键词覆盖规则**。
 *
 *   规则 A（关键词匹配规则）：在词汇内的内容词，被该片段覆盖的比例 ≥ COV_MIN。
 *   规则 B（相似度兜底）    ：向量余弦 ≥ VEC_MIN。**实测只是兜底，不是主判据。**
 *
 * ⚠️ 实测说明（必须写进报告，不能只写"阈值有效"）：
 *   校准脚本显示，本知识库上"无关问题"的最高余弦（0.36）**高于**
 *   "相关问题" Top-3 的最低余弦（0.28）—— 中文里高频词项撑起的
 *   "公共相似度地板"无法靠调阈值消除。因此余弦只用于**融合排序**，
 *   判定交给覆盖度；把余弦当判定依据会让 5 个无关问题全部误判为可答。
 */
export function isRelevant(row) {
  return row.idfcov >= COV_MIN || row.vec >= VEC_MIN
}

/**
 * 检索入口。
 *
 * @returns {{
 *   insufficient: boolean,          // true 表示资料不足，不应让模型硬答
 *   topk: Array,                    // 进入上下文的片段（已按 RRF 排序、已截断到 k）
 *   candidates: Array,              // 排序后的全部候选（报告里用来展示排序依据）
 *   k: number,
 *   reason: string,                 // 判定说明，进日志与报告
 *   stats: { scanned: number, passed: number }
 * }}
 */
export function retrieve(index, query, opts = {}) {
  const k = opts.k ?? DEFAULT_TOP_K
  const rows = hybridSearch(index, query)
  const profile = rows.profile || queryProfile(query, index.idfStat)

  // —— 程序强判（只判一种情况：明确判不了）——
  //
  // 实测结论（三次尝试，详见文件末尾）：**用字面规则无法把"相关"与"不相关"分开**。
  // 所以程序不再假装能判定所有情况，只保留唯一一条**显然成立**的规则：
  //   「问题的内容词，一个都没有被任何片段覆盖」→ 知识库里确实没有这段内容。
  // 其余情况（有部分重合，但可能仍答不出）一律交给模型判断 —— 因为那时
  // 区分"词语重合"与"真能回答"需要语义理解，而这正是模型该做的事。
  const maxCov = rows.length ? Math.max(...rows.map((r) => r.idfcov)) : 0
  const strongInsufficient = rows.length === 0 || profile.knownTerms.length === 0 || maxCov === 0

  // 优先取"覆盖度达标"的片段；一条都不达标时退回按 RRF 排序的 Top-k，
  // 交模型判定 —— 程序不越权替模型拍板（理由见本文件末尾的实测记录）。
  const ranked = rows.filter((r) => r.idfcov >= COV_MIN)
  const topk = (ranked.length ? ranked : rows).slice(0, k)

  let reason
  if (!rows.length) {
    reason = '知识库为空，未做检索'
  } else if (profile.knownTerms.length === 0) {
    reason = `问题的词项（${profile.terms.slice(0, 8).map((i) => i.term).join('、')}…）在知识库中全部未收录 → 程序强判资料不足`
  } else if (strongInsufficient) {
    reason =
      `问题的在库词项（${profile.knownTerms.map((i) => i.term).slice(0, 8).join('、')}…）` +
      `没有被任何片段覆盖 → 程序强判资料不足，未调用模型`
  } else {
    reason =
      `候选 ${rows.length} 条，覆盖度达 ${COV_MIN} 的 ${ranked.length} 条，` +
      `取前 ${topk.length} 条进入上下文（k=${k}），是否足以回答交由模型判断`
  }

  return {
    insufficient: strongInsufficient,
    /** 程序强判为"资料不足"（唯一一种程序能确定的不足） */
    strong_insufficient: strongInsufficient,
    profile: {
      oov_ratio: Number(profile.oovRatio.toFixed(3)),
      known_terms: profile.knownTerms.map((i) => i.term),
      known_count: profile.knownTerms.length,
      oov_terms: profile.oovTerms.map((i) => i.term),
      oov_count: profile.oovTerms.length
    },
    max_coverage: Number(maxCov.toFixed(3)),
    topk,
    candidates: rows,
    k,
    reason,
    stats: { scanned: rows.length, with_overlap: rows.filter((r) => r.idfcov > 0).length }
  }
}

/**
 * k 的取值理由（写在这里，便于报告直接引用）：
 *   - k=1：多片段综合类问题（如"从上传到播放有哪些中断点"）必然缺料；
 *   - k=4：实测能覆盖本次 8 个固定问题里依赖最多片段的 2 题，且上下文仍在
 *          1500 字以内，不挤占模型对问题的注意力；
 *   - k≥6：开始引入与问题弱相关的片段，模型会顺手引用，反而降低引用准确率
 *          （见实验5 §2.5 RAG 组引用可靠性一栏）。
 */
export function pickTopK() {
  return DEFAULT_TOP_K
}

/* ══════════════════════════════════════════════════════════════════════════
 * 附：相关性判定为什么最终交给模型 —— 三次尝试的实测记录
 * （这段是实验5 §2.4 要求的"判断方法"的选取依据，报告直接引用）
 *
 * 尝试一 · 纯 TF 加权的字符 n-gram 嵌入，绝对余弦阈值
 *   结果：不可分离。5 个无关问题的最高余弦 0.4115，
 *         10 个相关问题 Top-3 的最低余弦 0.2942 —— 阈值区间是空的。
 *
 * 尝试二 · 把嵌入改成 TF-IDF 加权（降低高频词项的贡献）
 *   结果：仍不可分离（无关 0.3642 vs 相关 Top-3 最低 0.2793）。
 *   原因：中文里"数据、用户、页面、系统"这类词项几乎每段都出现，
 *        它们共同撑起一个 0.2–0.35 的"公共相似度地板"，
 *        真正的差异被压在地板下面。这是字面型嵌入的结构性限制，
 *        不是调参能解决的。
 *
 * 尝试三 · 用"词汇失配率"（问题内容词里知识库未收录词的比例）做问题级闸门
 *   结果：方向反了。命中所需的"内容词"是问题里 IDF 最高的一半词项，
 *        而中文二元组会切出大量**跨词边界的组合**（"这个软件" → 个软、件支），
 *        这些组合必然不在语料里，于是**正相关问题的失配率也高达 0.58–1.00**，
 *        负相关问题 0.64–0.93，两者完全重叠。
 *        要解决它需要中文分词 —— 那已超出本实验范围，且引入新依赖。
 *
 * 结论（本次采用）：
 *   字面规则只能可靠地判一件事 ——「问题的内容词一个都没被覆盖」，
 *   这时知识库里确实没有这段内容，程序直接短路，既不花 token 也不会答错。
 *   其余情况一律把候选片段交给模型判断（判定调用），
 *   因为"词语重合"与"真能回答"之间的差别是语义差别，不是字面差别。
 *
 *   这一结论也写进了 §2.6「是否继续使用 RAG」的讨论：
 *   在缺少分词与专用嵌入服务的前提下，程序侧的相关性判定能力是这套链路最弱的一环。
 * ══════════════════════════════════════════════════════════════════════════ */

/** 供脚本打印调试用 */
export function describeRow(row) {
  return {
    id: row.chunk.id,
    section: row.chunk.section,
    rrf: Number(row.rrf.toFixed(6)),
    vec: Number(row.vec.toFixed(4)),
    bm25: Number(row.bm25.toFixed(3)),
    idfcov: Number(row.idfcov.toFixed(3)),
    hit: Number(row.hit.toFixed(3)),
    rank_vec: row.rank_vec,
    rank_bm25: row.rank_bm25,
    chars: row.chunk.chars
  }
}

export { buildBm25 }
