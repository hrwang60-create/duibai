/**
 * AI 能力层 · RAG 环节二之二：关键词检索（BM25）
 *
 * 选择理由（实验5 §2.4 要求说明为什么选这种方法）：
 *   本知识库里有一批**必须精确命中**的词项 —— 接口名 `POST /api/scripts`、
 *   错误码 `503`、状态值 `text_only`、验收编号 `AC3`。这类词项一旦被同义改写
 *   （比如把 503 说成"服务不可用"），用户就找不到自己看到的那条报错。
 *   向量检索对这类符号不敏感，BM25 的词项精确匹配恰好补上这一块。
 *
 * 参数取值：k1 = 1.2、b = 0.75 —— BM25 的常用默认值。
 * 本知识库片段长度集中在 300 字上下、长短差异不大，b（长度归一化强度）
 * 不需要特别调大；k1 保持默认即可，未做网格搜索，这点如实记录为局限。
 */

import { tokenize } from './token.mjs'

export const BM25_K1 = 1.2
export const BM25_B = 0.75

/**
 * 用片段集合建立 BM25 统计量。
 * @param {Array<{id: string, text: string}>} chunks
 */
export function buildBm25(chunks) {
  const docs = chunks.map((c) => tokenize(c.text))
  const df = new Map()                 // 词项 → 出现该词项的片段数
  const lens = []
  for (const terms of docs) {
    lens.push(terms.length)
    for (const t of new Set(terms)) df.set(t, (df.get(t) || 0) + 1)
  }
  const avgdl = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0
  return { docs, df, lens, avgdl, N: docs.length }
}

/** 单个词项的 IDF（带 +1 平滑，避免高频词得负分） */
function idf(term, st) {
  const n = st.df.get(term) || 0
  return Math.log(1 + (st.N - n + 0.5) / (n + 0.5))
}

/**
 * BM25 打分。
 * @returns {number[]} 每个片段的原始分（未归一化）
 */
export function bm25Scores(query, st) {
  const qTerms = [...new Set(tokenize(query))]
  const scores = new Array(st.N).fill(0)
  if (!qTerms.length) return scores

  for (let d = 0; d < st.N; d++) {
    const terms = st.docs[d]
    const dl = st.lens[d] || 1
    if (!dl) continue
    const tf = new Map()
    for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1)
    let s = 0
    for (const t of qTerms) {
      const f = tf.get(t)
      if (!f) continue
      s += idf(t, st) * ((f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / (st.avgdl || 1))))
    }
    scores[d] = s
  }
  return scores
}

/**
 * 关键词匹配率 = 问题词项在片段中出现的比例（0–1）。
 * 这是"返回片段是否真的相关"的一条**可复查规则**：
 * 与问题毫无共同词项的片段，无论向量分多高都不该被引用。
 */
export function keywordHitRatio(query, text) {
  const q = [...new Set(tokenize(query))]
  if (!q.length) return 0
  const inDoc = new Set(tokenize(text))
  let hit = 0
  for (const t of q) if (inDoc.has(t)) hit++
  return hit / q.length
}
