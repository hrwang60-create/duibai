/**
 * 实验5 · 知识库索引构建（切分 + 嵌入 + BM25 统计 → data/kb/index.json）
 *
 * 运行：
 *   npm run kb:build              构建索引
 *   npm run kb:build -- --list    构建后列出全部片段（编号与字符数）
 *   npm run kb:build -- --show S1-C03,S2-C07   打印指定片段的完整内容与元数据
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildIndexFromDisk, saveIndex } from '../src/ai/rag/store.mjs'
import { estimateTokens } from '../src/ai/rag/token.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'data', 'kb', 'index.json')

const argv = process.argv.slice(2)
const wantList = argv.includes('--list')
const showIdx = argv.indexOf('--show')
const showIds = showIdx >= 0 ? (argv[showIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : []

const index = buildIndexFromDisk(ROOT)
saveIndex(index, OUT)

console.log('══════ 知识库索引 ══════')
for (const s of index.sources) {
  console.log(
    `${s.id}  ${s.title}  ${s.chars} 字符 → ${s.chunks} 个片段` +
      `（丢弃代码块 ${s.dropped_code_blocks} 个）  sha256=${s.sha256.slice(0, 12)}…`
  )
}
console.log('')
const st = index.stats
console.log(`嵌入模型：${st.embed_model}（维度 256，余弦相似度）`)
console.log(`资料 ${st.sources} 份 / 片段 ${st.chunks} 个 / 正文 ${st.chars} 字符 / 平均 ${st.avg_chars} 字符/片段`)
console.log(`片段长度：最短 ${st.min_chars} / 最长 ${st.max_chars} 字符`)
console.log(`片段类型分布：${Object.entries(st.by_kind).map(([k, v]) => `${k} ${v}`).join('，')}`)
console.log(`片段合计估算 Token：约 ${st.est_tokens}`)
console.log(`丢弃的围栏内容：${st.dropped_code_blocks} 个（${st.dropped_code_chars} 字符，mermaid 图与代码）`)
console.log(`保留的"文字图"：${st.figures_kept} 个（ASCII 原型图，清掉图形符号后仍保留正文）`)
console.log(`\n✓ 索引已写入 ${path.relative(ROOT, OUT)}（${(fs.statSync(OUT).size / 1024).toFixed(1)} KB，不进版本库）`)

if (wantList) {
  console.log('\n──── 全部片段 ────')
  for (const c of index.chunks) {
    console.log(`${c.id}  ${String(c.chars).padStart(4)} 字符  ~${estimateTokens(c.text)} tok  ${c.kind.padEnd(6)}  ${c.section}`)
  }
}

if (showIds.length) {
  for (const id of showIds) {
    const c = index.chunks.find((x) => x.id === id)
    console.log(`\n──── 片段 ${id} ────`)
    if (!c) {
      console.log('未找到该片段')
      continue
    }
    console.log(`source_id      : ${c.source_id}`)
    console.log(`source_title   : ${c.source_title}`)
    console.log(`source_path    : ${c.source_path}`)
    console.log(`section        : ${c.section}`)
    console.log(`kind           : ${c.kind}`)
    console.log(`seq_in_source  : ${c.seq_in_source}`)
    console.log(`chars          : ${c.chars}（估算 ${estimateTokens(c.text)} tokens）`)
    console.log(`向量非零维度   : ${index.vectors[c.seq_in_source - 1].filter((x) => x !== 0).length}`)
    console.log('正文：')
    console.log(c.text)
  }
}
