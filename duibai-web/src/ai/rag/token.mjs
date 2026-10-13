/**
 * AI 能力层 · RAG 共用：词项切分（tokenize）
 *
 * 中文没有空格，英文的分词器直接拿来用会退化成"整句一个词"。
 * 这里用**中文二元组（bigram）+ 英文/数字整词**的方案，理由：
 *   - 中文双字词占绝对多数，"光合作用" → 光合/合作/作用 三个 bigram，
 *     任意两字片段重合即可命中，召回比单字更准、比词典分词更少依赖；
 *   - 双字以下的中文串（如"甲""乙"）单独保留单字，否则短词完全无法匹配；
 *   - 英文与数字（AC1、text_only、503、POST）必须整体保留 —— 它们在本知识库里
 *     是高信息量词项，切碎会让"503 表示什么"这类问题检索不到。
 *
 * 关键词检索（BM25）与向量嵌入（embed.mjs）**共用本文件**，
 * 保证两种检索看到的词项是一致的 —— 否则混合排序的分数没有可比性。
 */

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
const ASCII_WORD = /[A-Za-z0-9_]+/

/** 中文停用词：单字虚词，作词项只会带来噪声 */
const STOP_CHARS = new Set('的了和及或与在是有为对把被这那其也就都而于一每个不我你他'.split(''))
/** 英文停用词 */
const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'is', 'are', 'in', 'on', 'for', 'with', 'by', 'as', 'be', 'it', 'that'])

/**
 * 切成词项数组（保留重复，BM25 需要词频）。
 * @param {string} text
 * @param {{ bigram?: boolean }} [opts] bigram=false 时中文退化为单字（用于短查询兜底）
 * @returns {string[]}
 */
export function tokenize(text, opts = {}) {
  const bigram = opts.bigram !== false
  const s = String(text ?? '').toLowerCase()
  const out = []

  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (CJK.test(ch)) {
      let j = i
      while (j < s.length && CJK.test(s[j])) j++
      const run = s.slice(i, j)
      if (run.length === 1) {
        if (!STOP_CHARS.has(run)) out.push(run)
      } else if (bigram) {
        for (let k = 0; k + 1 < run.length; k++) {
          const g = run.slice(k, k + 2)
          if (!STOP_CHARS.has(g[0]) || !STOP_CHARS.has(g[1])) out.push(g)
        }
      } else {
        for (const c of run) if (!STOP_CHARS.has(c)) out.push(c)
      }
      i = j
      continue
    }
    const m = ASCII_WORD.exec(s.slice(i))
    if (m) {
      const w = m[0]
      if (!STOP_WORDS.has(w)) out.push(w)
      i += w.length
      continue
    }
    i++
  }
  return out
}

/** 去重后的词项集合，用于关键词匹配率计算 */
export function tokenSet(text) {
  return new Set(tokenize(text))
}

/** 估算 Token 数。中文约 0.6 token/字，英文约 0.25 token/字符 —— 仅用于估算，真实值以接口返回为准。 */
export function estimateTokens(text) {
  const s = String(text ?? '')
  let cjk = 0
  let other = 0
  for (const ch of s) (CJK.test(ch) ? (cjk += 1) : (other += 1))
  return Math.round(cjk * 0.6 + other * 0.25)
}
