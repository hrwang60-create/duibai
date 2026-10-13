/**
 * AI 能力层 · RAG 环节二之一：向量嵌入与相似度
 *
 * ★ 嵌入模型说明（实验5 §2.4 要求记录模型名称与比较方法）★
 *
 *   模型名称：`char-ngram-hash-v1`（本地确定性嵌入，维度 D = 256）
 *   比较方法：余弦相似度（cosine），对 L2 归一化后的向量取点积
 *
 * 为什么用本地嵌入而不是云端嵌入接口（这是本次实验一个**真实的工程判断**，
 * 不是图省事，必须如实记录）：
 *   1. 本项目已接入的模型服务是 DeepSeek，而 **DeepSeek 官方不提供 embeddings 接口**，
 *      只有 chat 接口；为一次课程实验再引入第二个厂商的密钥，会让"知识库可复现"
 *      这件事依赖一份额外凭证；
 *   2. 本地确定性嵌入**同一输入永远得到同一向量** —— 检索结果可复现、可写进报告核对，
 *      而云端嵌入模型随时可能更新版本、悄悄改变排序；
 *   3. 本知识库是**同一作者、同一术语体系**的中文技术文档，检索时字面重合度很高，
 *      字符 n-gram 嵌入已经能提供"比纯关键词更宽"的召回。
 *
 * 它的局限（必须写在报告里，不能在结论里美化）：
 *   - 它捕捉的是**字面**重叠，不是语义。问"要花钱吗"检索不到"费用/token 计费"，
 *     因为二者没有共同字符 —— 这类问题靠 BM25 的词项重叠同样救不回来，
 *     所以要靠"资料不足"提示而不是硬答。
 *
 * ★ 第二版修正：从 TF 加权改为 **TF-IDF 加权**（这是实测逼出来的改动）★
 *
 *   第一版用 1+log(tf) 加权，校准脚本一跑就发现**余弦根本不可分离**：
 *   无关问题的最高余弦 0.41，而相关问题的 Top-3 最低只有 0.29 —— 阈值画不出来。
 *   根因是中文里"的、是、数据、用户"这类词项几乎每段都有，
 *   它们撑起了一个 0.2–0.35 的"公共相似度地板"，真正的差异被淹没。
 *
 *   改成 TF-IDF：词项权重 = tf 权重 × idf，idf = log(1 + N/(1+df))。
 *   出现在全部片段里的词项 idf ≈ 0，几乎不贡献分数；
 *   只在少数片段出现的词项（"口吻""503""text_only"）权重高得多。
 *   这同时带来一个有用的副作用：**问一个知识库完全没有的话题时**
 *   （如"光合作用的化学方程式"），问题的词项在语料里 df = 0 权重最高，
 *   却与任何片段都没有共同维度，余弦被压得很低 —— 正好落到"资料不足"。
 */

import { tokenize } from './token.mjs'

/** 嵌入维度 */
export const EMBED_DIM = 256
export const EMBED_MODEL = 'char-ngram-hash-v1+idf'

/**
 * 统计语料的词项权重（IDF）。
 *
 * @param {Array<{text:string}>} chunks
 * @returns {{ idf: Map<string, number>, df: Map<string, number>, N: number, defaultIdf: number }}
 */
export function buildIdf(chunks) {
  const df = new Map()
  for (const c of chunks) {
    for (const t of new Set(tokenize(c.text))) df.set(t, (df.get(t) || 0) + 1)
  }
  const N = chunks.length || 1
  const idf = new Map()
  for (const [t, n] of df) idf.set(t, Math.log(1 + N / (1 + n)))
  // 语料里没出现过的词项（问题里的新词）：给最大权重。
  // 它不会抬高与任何片段的相似度（没有共同维度），只会抬高问题向量的范数，
  // 从而**压低**所有相似度 —— 这正是"问了个知识库没有的话题"应有的表现。
  return { idf, df, N, defaultIdf: Math.log(1 + N) }
}

/** FNV-1a 32 位哈希：无依赖、确定性、分布足够均匀 */
function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * 词项 → 维度下标。
 *
 * 除了主下标，再投一个"副下标"（对哈希再散列一次）。
 * 这叫**多哈希**：单哈希时不同词项撞进同一维会造成大量伪相似，
 * 投两维可显著降低碰撞的负面影响，代价只是嵌入更稠密。
 */
function dimsOf(term) {
  const h1 = fnv1a(term)
  const h2 = fnv1a(term + '#2')
  return [h1 % EMBED_DIM, h2 % EMBED_DIM]
}

/**
 * 把一段文本编码成 L2 归一化的稠密向量。
 *
 * 权重 = (1 + log(tf)) × idf。idf 由语料统计得到（buildIdf），
 * 目的见文件头"第二版修正"。不传 idf 时退化为纯 TF 加权（仅用于自测）。
 */
export function embed(text, idfStat) {
  const v = new Float64Array(EMBED_DIM)
  const terms = tokenize(text)
  if (!terms.length) return v
  const tf = new Map()
  for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1)
  for (const [t, n] of tf) {
    const tfw = 1 + Math.log(n)
    const iw = idfStat ? (idfStat.idf.get(t) ?? idfStat.defaultIdf) : 1
    const w = tfw * iw
    for (const d of dimsOf(t)) v[d] += w
  }
  let norm = 0
  for (let i = 0; i < EMBED_DIM; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < EMBED_DIM; i++) v[i] /= norm
  return v
}

/** 余弦相似度。两侧都已 L2 归一化，点积即为余弦值，取值 [0, 1]。 */
export function cosine(a, b) {
  let s = 0
  for (let i = 0; i < EMBED_DIM; i++) s += a[i] * b[i]
  return s
}

/** 供索引落盘：Float64Array → 普通数组（保留 6 位小数，控制文件体积） */
export function vectorToJSON(v) {
  return Array.from(v, (x) => Number(x.toFixed(6)))
}

/** 从索引读回：普通数组 → Float64Array */
export function vectorFromJSON(arr) {
  return Float64Array.from(arr)
}
