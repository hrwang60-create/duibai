/**
 * AI 能力层 · RAG 环节零：索引的构建与读取
 *
 * 一个"索引"包含三样东西，缺一不可：
 *   - chunks  切分后的片段（带元数据）；
 *   - vectors 每个片段对应的向量（嵌入结果，落盘复用，不必每次重算）；
 *   - bm25    BM25 统计量（词频、文档频率、平均长度）。
 *
 * 落盘为 data/kb/index.json（gitignore，由 npm run kb:build 生成）。
 *
 * **资料更新方法**（实验5 §2.3 要求说明）：
 *   原始资料改完后，重跑 `npm run kb:import && npm run kb:build` 即可 ——
 *   索引整体重建，不做增量；本知识库规模只有几十个片段，全量重建 < 1 秒，
 *   增量更新带来的"索引与资料不一致"风险远大于它省下的时间。
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { chunkDocument } from './chunk.mjs'
import { buildBm25 } from './bm25.mjs'
import { EMBED_MODEL, buildIdf, embed, vectorToJSON } from './embed.mjs'
import { estimateTokens } from './token.mjs'

export const KB_MANIFEST = 'kb/manifest.json'

export function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * 从 kb/manifest.json + kb/source/*.md 构建索引对象。
 * @param {string} root  duibai-web 工程根目录
 */
export function buildIndexFromDisk(root) {
  const manifestPath = path.join(root, KB_MANIFEST)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

  const chunks = []
  const sources = []
  const droppedCode = []

  for (const s of manifest.sources) {
    const srcPath = path.join(root, s.local_path)
    const raw = fs.readFileSync(srcPath, 'utf8')
    const { chunks: cs, dropped, stats } = chunkDocument(raw, {
      source_id: s.id,
      source_title: s.title,
      source_path: s.origin_path
    })
    chunks.push(...cs)
    droppedCode.push({ source: s.id, code_blocks: dropped.code, code_chars: dropped.code_chars })
    sources.push({
      id: s.id,
      title: s.title,
      origin_path: s.origin_path,
      local_path: s.local_path,
      chars: raw.length,
      sha256: sha256(raw),
      chunks: cs.length,
      dropped_code_blocks: dropped.code,
      figures_kept: stats.figures_kept,
      status: stats
    })
  }

  // 先统计语料 IDF，再用**同一套权重**编码片段 —— 片段与问题的向量必须同源，
  // 否则余弦相似度比较的是两个不同空间里的东西（这是嵌入检索最常见的错法）。
  const idfStat = buildIdf(chunks)
  const vectors = chunks.map((c) => vectorToJSON(embed(c.text, idfStat)))
  const bm25 = buildBm25(chunks)

  const stats = {
    embed_model: EMBED_MODEL,
    sources: sources.length,
    chunks: chunks.length,
    chars: chunks.reduce((n, c) => n + c.chars, 0),
    avg_chars: chunks.length ? Math.round(chunks.reduce((n, c) => n + c.chars, 0) / chunks.length) : 0,
    min_chars: chunks.length ? Math.min(...chunks.map((c) => c.chars)) : 0,
    max_chars: chunks.length ? Math.max(...chunks.map((c) => c.chars)) : 0,
    by_kind: chunks.reduce((m, c) => ({ ...m, [c.kind]: (m[c.kind] || 0) + 1 }), {}),
    est_tokens: chunks.reduce((n, c) => n + estimateTokens(c.text), 0),
    dropped_code_blocks: droppedCode.reduce((n, d) => n + d.code_blocks, 0),
    dropped_code_chars: droppedCode.reduce((n, d) => n + d.code_chars, 0),
    figures_kept: sources.reduce((n, s) => n + (s.figures_kept || 0), 0),
    built_at: new Date().toISOString()
  }

  return { manifest, sources, chunks, vectors, bm25, idfStat, stats }
}

/** 写入磁盘（索引含向量，体积较大，且可从资料完全重建，故不进版本库） */
export function saveIndex(index, outFile) {
  const payload = {
    version: 1,
    stats: index.stats,
    sources: index.sources,
    chunks: index.chunks,
    vectors: index.vectors,
    bm25: {
      df: [...index.bm25.df.entries()],
      lens: index.bm25.lens,
      avgdl: index.bm25.avgdl,
      N: index.bm25.N
    },
    idf: {
      default_idf: index.idfStat.defaultIdf,
      terms: [...index.idfStat.idf.entries()]
    }
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(payload), 'utf8')
  return outFile
}

/**
 * 读回索引，并挂上查询期才需要的能力（embedQuery）。
 * 检索接口因此不需要知道向量是怎么来的 —— 换成云端嵌入模型时只改本文件。
 */
export function loadIndex(indexFile) {
  const payload = JSON.parse(fs.readFileSync(indexFile, 'utf8'))
  const idfStat = {
    idf: new Map(payload.idf.terms),
    defaultIdf: payload.idf.default_idf,
    N: payload.bm25.N,
    df: new Map(payload.bm25.df)
  }
  return {
    stats: payload.stats,
    sources: payload.sources,
    chunks: payload.chunks,
    vectors: payload.vectors,
    idfStat,
    bm25: {
      df: new Map(payload.bm25.df),
      lens: payload.bm25.lens,
      avgdl: payload.bm25.avgdl,
      N: payload.bm25.N,
      // 查询期不再需要逐片段词项：BM25 打分只需要 df / lens / avgdl，
      // 片段词项在 hybridSearch 里按需从 chunk.text 现算，避免索引里重复存一份词
      docs: null
    },
    // 查询必须用与片段同一套 IDF 权重（见 buildIndexFromDisk 的注释）
    embedQuery: (q) => embed(q, idfStat)
  }
}
