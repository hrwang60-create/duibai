/**
 * AI 能力层 · RAG 环节一：资料切分
 *
 * 职责：把一份 Markdown 资料切成**带元数据的片段（chunk）**，供后续检索使用。
 * 本文件只做切分，不做检索、不碰网络、不依赖任何框架 —— 这样它可以被
 * Next 服务端、命令行脚本、测试脚本同时复用（实验5 §2.6 要求的"可调用模块"）。
 *
 * 切分策略（三档，对应实验5 §2.3 "按段落、标题或长度切分"）：
 *   1. 先按**标题**成块 —— 标题是资料自身的语义边界，优先级最高；
 *   2. 标题内部按**空行段落**成块 —— 段落是作者的完整论述单元；
 *   3. 段落仍超长时按**长度**再切，并在相邻片段间**重叠一句**（最多 60 字），
 *      避免答案正好被切在边界上而两边都检索不到。
 *
 * 两个经过实测修正的决定（第一版做错、改掉了，报告里如实记录）：
 *
 *   ① **原型图不能整块丢弃。**
 *      第一版把 ``` 围栏内的内容一律丢弃，结果 S3《界面原型》5336 字只剩 931 字 ——
 *      因为该文档的正文主要写在 ASCII 原型图里（"未选择文件时开始生成按钮置灰"
 *      这类关键信息就在图中）。现在改为：**图形符号清除、图里的文字保留**。
 *
 *      判据经过一次修正：一开始用"围栏内 CJK 字符占比 ≥ 20%"，实测失败 ——
 *      ASCII 原型图里制表符与空格占比极高，"│ 「对白」把文章，聊给你听 │" 这种
 *      一行的 CJK 占比只有一成多，好内容反被判成噪声。
 *      现在改成**结果导向**的判据：不是 mermaid 类图形语言，且
 *      **清掉图形符号后仍剩 ≥ 60 个字符的文字** → 判为"文字图"，保留。
 *      这直接度量了我们真正在意的东西 —— 图里有没有可读的文字。
 *
 *   ② **表格不能被拦腰切断。**
 *      表格按行累积成一个块，只有超过上限才分行；分行时**每片都补上表头行**，
 *      否则第二片有数据没列名，"这一列是什么"就说不清了。
 */

/** 片段目标长度（字符）。中文一段完整论述约 200–400 字。 */
export const CHUNK_TARGET = 320
/** 片段长度上限。超过就切，避免单片段占满上下文。 */
export const CHUNK_MAX = 520
/** 相邻片段重叠的字符数上限（按句边界对齐，最多这么多）。 */
export const CHUNK_OVERLAP = 60
/** 片段最小长度。低于此值的碎片不单独成片，并入前一片。 */
export const CHUNK_MIN = 60
/** 围栏内容清掉图形符号后，至少剩这么多文字才值得保留（否则认定为纯图形/代码）。 */
export const MIN_FIGURE_TEXT = 60

const CODE_FENCE = /^\s*(```|~~~)\s*([A-Za-z0-9_+-]*)\s*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_SEP = /^\s*\|?[\s:|-]+\|[\s:|-]*$/
const LIST_ITEM = /^\s*([-*+]|\d+[.、)])\s+/
const QUOTE = /^\s*>\s?/
/** 水平分隔线：不是内容，是排版符号 */
const HR = /^\s*([-*_])\s*(\1\s*){2,}$/
/** mermaid / 图形语言的关键字 —— 这类围栏一律丢弃 */
const DIAGRAM_LANG = /^(mermaid|dot|graphviz|plantuml)$/i
const MERMAID_KEYWORD = /^\s*(flowchart|graph|erDiagram|sequenceDiagram|classDiagram|stateDiagram|journey|gantt)\b/

/** 清理不能作为检索依据的字符：BOM、零宽字符、行尾空白、全角空格 */
export function normalizeText(raw) {
  return String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+$/gm, '')
}

/** CJK 字符占比，用于判断一段围栏内容是不是"写字写出来的" */
export function cjkRatio(text) {
  const s = String(text ?? '')
  if (!s.length) return 0
  let cjk = 0
  for (const ch of s) if (/[\u3400-\u4dbf\u4e00-\u9fff]/.test(ch)) cjk++
  return cjk / s.length
}

/**
 * 把 ASCII 原型图里的**文字**留下、**图形符号**去掉。
 *
 * 去掉的字符：制表与方框绘制符（│┌─┐└┘├┤┬┴┼━┃）、几何图形符（▶●○▮◆■）、
 * 箭头（←→↑↓）、以及成串的点线（……、----）。
 * 保留的：文字、方括号按钮、圆括号单选框 —— 它们是真正的页面元素信息。
 */
export function stripFigureChars(raw) {
  const lines = normalizeText(raw).split('\n')
  const out = []
  for (let line of lines) {
    line = line
      .replace(/[\u2190-\u21FF]/g, '')          // 箭头
      .replace(/[\u2500-\u25FF]/g, ' ')         // 制表符/方框/几何图形
      .replace(/\u2026{2,}/g, '')               // ……
      .replace(/[-=_.]{3,}/g, ' ')              // 长横线/下划线填充
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
    if (!line) continue
    // 只剩标点或只剩三两个字的分隔行，不是内容
    if (!/[\u4e00-\u9fffA-Za-z0-9\u3040-\u30ff]/.test(line)) continue
    out.push(line)
  }
  // 去掉连续重复行（原型图里同一行会被边框包围重复出现）
  return out.filter((l, i) => l !== out[i - 1]).join('；')
}

/** 把 Markdown 表格的行转成可检索的句子：去掉竖线，单元格用「；」连接。 */
export function tableRowToText(line) {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  if (!cells.length) return ''
  if (cells.every((c) => !c || /^[-: ]+$/.test(c))) return ''
  return cells.filter(Boolean).join('；')
}

/**
 * 把 Markdown 拆成有序的「块」，并保留所在标题路径。
 *
 * 返回 [{ kind, text, headingPath, rows? }]，
 * kind ∈ heading|para|table|list|quote|figure|code。
 * `code` 表示被丢弃的围栏内容（mermaid / 代码 / 命令行），仍会出现在返回里，
 * 由调用方计数 —— 丢弃也要留证据，不能悄悄消失。
 */
export function parseBlocks(md) {
  const lines = normalizeText(md).split('\n')
  const blocks = []
  const dropped = { code: 0, code_chars: 0, hr: 0 }
  const headings = []            // 当前标题路径栈：[{level, text}]
  const headingPath = () => headings.map((h) => h.text).join(' › ')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fence = line.match(CODE_FENCE)
    if (fence) {
      const lang = (fence[2] || '').toLowerCase()
      let j = i + 1
      while (j < lines.length && !CODE_FENCE.test(lines[j])) j++
      const body = lines.slice(i + 1, j).join('\n')
      i = j

      const isDiagram = DIAGRAM_LANG.test(lang) || MERMAID_KEYWORD.test(body)
      const text = isDiagram ? '' : stripFigureChars(body)
      // 判据：不是图形语言，且清掉图形符号后仍剩 ≥ MIN_FIGURE_TEXT 个字符的文字
      if (text.length >= MIN_FIGURE_TEXT) {
        blocks.push({ kind: 'figure', text, headingPath: headingPath(), figure_lang: lang || '(none)' })
        continue
      }
      dropped.code++
      dropped.code_chars += body.length
      blocks.push({ kind: 'code', text: body, headingPath: headingPath(), reason: isDiagram ? 'diagram' : 'not_text' })
      continue
    }

    const h = line.match(HEADING)
    if (h) {
      const level = h[1].length
      while (headings.length && headings[headings.length - 1].level >= level) headings.pop()
      headings.push({ level, text: h[2].trim() })
      blocks.push({ kind: 'heading', text: h[2].trim(), headingPath: headingPath() })
      continue
    }

    if (!line.trim()) continue

    if (HR.test(line)) {
      dropped.hr++
      continue
    }

    // 表格：连续行累积成一个块，并记下表头行（首行），供分行时重复使用
    if (TABLE_ROW.test(line)) {
      const rows = []
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        const raw = lines[i]
        if (!TABLE_SEP.test(raw)) {
          const t = tableRowToText(raw)
          if (t) rows.push(t)
        }
        i++
      }
      i--
      if (rows.length) {
        blocks.push({
          kind: 'table',
          text: rows.join('\n'),
          rows,
          header: rows[0],
          headingPath: headingPath()
        })
      }
      continue
    }

    // 列表项 / 引用：连续同类行合并成一个块，避免把一条要点切成碎片
    if (LIST_ITEM.test(line) || QUOTE.test(line)) {
      const kind = LIST_ITEM.test(line) ? 'list' : 'quote'
      const buf = [line.replace(LIST_ITEM, '').replace(QUOTE, '').trim()]
      while (i + 1 < lines.length && LIST_ITEM.test(lines[i + 1]) && kind === 'list') {
        buf.push(lines[++i].replace(LIST_ITEM, '').trim())
      }
      const text = buf.filter(Boolean).join('；')
      if (text) blocks.push({ kind, text, headingPath: headingPath() })
      continue
    }

    // 普通段落：连续非空、非特殊行合并
    const buf = [line.trim()]
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() &&
      !HEADING.test(lines[i + 1]) &&
      !TABLE_ROW.test(lines[i + 1]) &&
      !CODE_FENCE.test(lines[i + 1]) &&
      !LIST_ITEM.test(lines[i + 1]) &&
      !QUOTE.test(lines[i + 1]) &&
      !HR.test(lines[i + 1])
    ) {
      buf.push(lines[++i].trim())
    }
    blocks.push({ kind: 'para', text: buf.join(''), headingPath: headingPath() })
  }

  return { blocks, dropped }
}

/** 按句末标点切句，保留标点。用于重叠与超长再切。 */
export function splitSentences(text) {
  const out = []
  let buf = ''
  for (const ch of text) {
    buf += ch
    if ('。！？；!?;'.includes(ch)) {
      const s = buf.trim()
      if (s) out.push(s)
      buf = ''
    }
  }
  const rest = buf.trim()
  if (rest) out.push(rest)
  return out
}

/** 取上一片段的末尾若干句（总长不超过 CHUNK_OVERLAP）作为重叠前缀。 */
function tailForOverlap(text) {
  const sents = splitSentences(text)
  const out = []
  let len = 0
  for (let i = sents.length - 1; i >= 0; i--) {
    if (len + sents[i].length > CHUNK_OVERLAP) break
    out.unshift(sents[i])
    len += sents[i].length
  }
  return out.join('')
}

/**
 * 切分一份资料。
 *
 * @param {string} md         Markdown 原文
 * @param {object} meta       { source_id, source_title, source_path }
 * @returns {{ chunks: Array, dropped: object, stats: object }}
 */
export function chunkDocument(md, meta) {
  const { blocks, dropped } = parseBlocks(md)
  const raw = []          // 切分结果（尚未合并碎片）
  let buf = []
  let bufLen = 0
  let lastHeadingKey = ''

  const flush = () => {
    const text = buf.map((b) => b.text).join('\n')
    if (!text.trim()) {
      buf = []
      bufLen = 0
      return
    }
    const kinds = [...new Set(buf.map((b) => b.kind))]
    raw.push({
      section: (buf.find((b) => b.kind !== 'overlap') || buf[0]).headingPath || meta.source_title,
      kind: kinds.length === 1 ? kinds[0] : 'mixed',
      text
    })
    buf = []
    bufLen = 0
  }

  for (const b of blocks) {
    // 被丢弃的围栏内容（mermaid / 代码）：不进知识库，但已计数
    if (b.kind === 'code') continue

    // 标题本身太短，单独成片段没有意义 —— 随其后第一个正文块一起走
    if (b.kind === 'heading') {
      if (bufLen >= CHUNK_TARGET) flush()
      lastHeadingKey = b.headingPath
      buf.push(b)
      bufLen += b.text.length
      continue
    }

    // 跨节 → 强制断开
    if (lastHeadingKey && b.headingPath !== lastHeadingKey) {
      flush()
      lastHeadingKey = b.headingPath
    }

    // 超长表格：按行分片，**每片补表头**，避免第二片有数据没列名
    if (b.kind === 'table' && b.text.length > CHUNK_MAX) {
      flush()
      const rows = b.rows
      let group = []
      let glen = 0
      const pushGroup = () => {
        if (!group.length) return
        raw.push({
          section: b.headingPath || meta.source_title,
          kind: 'table',
          text: `（表头：${b.header}）\n${group.join('\n')}`
        })
        group = []
        glen = 0
      }
      for (const r of rows) {
        if (glen && glen + r.length > CHUNK_TARGET) pushGroup()
        group.push(r)
        glen += r.length
      }
      pushGroup()
      buf.push({ kind: 'heading', text: '', headingPath: b.headingPath })  // 占位，保持节标记
      continue
    }

    // 加上这一块会超上限，且已有内容 → 先落一片，并带上前片尾句作重叠
    if (bufLen && bufLen + b.text.length > CHUNK_MAX) {
      const prevText = buf.map((x) => x.text).join('\n')
      flush()
      const overlap = tailForOverlap(prevText)
      if (overlap) {
        buf.push({ kind: 'overlap', text: overlap, headingPath: b.headingPath })
        bufLen = overlap.length
      }
    }

    // 单块本身就超长（长段落 / 长图块）→ 按句切成多片
    if (b.kind !== 'table' && b.text.length > CHUNK_MAX) {
      const sents = splitSentences(b.text)
      let piece = ''
      for (const s of sents) {
        if (piece && piece.length + s.length > CHUNK_TARGET) {
          const overlap = tailForOverlap(piece)
          if (piece.trim()) {
            raw.push({ section: b.headingPath || meta.source_title, kind: b.kind, text: piece.trim() })
          }
          piece = overlap + s
        } else {
          piece += s
        }
      }
      if (piece.trim()) {
        raw.push({ section: b.headingPath || meta.source_title, kind: b.kind, text: piece.trim() })
      }
      continue
    }

    buf.push(b)
    bufLen += b.text.length
    if (bufLen >= CHUNK_TARGET) flush()
  }
  flush()

  // —— 后处理：并把过短的碎片并入前一片，最后重新编号 ——
  const merged = []
  for (const c of raw) {
    const bare = c.text.replace(/[\s；|]+/g, '')
    if (bare.length < 6) continue                                   // 只剩标点/分隔符
    if (c.text.length < CHUNK_MIN && merged.length) {
      const prev = merged[merged.length - 1]
      // 碎片本身就是上一片的尾部（重叠段）时不重复追加
      if (!prev.text.includes(c.text.trim())) prev.text += '\n' + c.text
      continue
    }
    merged.push({ ...c })
  }

  const chunks = merged.map((c, i) => ({
    id: `${meta.source_id}-C${String(i + 1).padStart(2, '0')}`,
    source_id: meta.source_id,
    source_title: meta.source_title,
    source_path: meta.source_path,
    section: c.section,
    kind: c.kind,
    seq_in_source: i + 1,
    chars: c.text.length,
    text: c.text
  }))

  const chars = chunks.reduce((n, c) => n + c.chars, 0)
  const byKind = {}
  for (const c of chunks) byKind[c.kind] = (byKind[c.kind] || 0) + 1

  return {
    chunks,
    dropped,
    stats: {
      blocks: blocks.length,
      dropped_code_blocks: dropped.code,
      dropped_code_chars: dropped.code_chars,
      figures_kept: blocks.filter((b) => b.kind === 'figure').length,
      chunks: chunks.length,
      chars,
      avg_chars: chunks.length ? Math.round(chars / chunks.length) : 0,
      min_chars: chunks.length ? Math.min(...chunks.map((c) => c.chars)) : 0,
      max_chars: chunks.length ? Math.max(...chunks.map((c) => c.chars)) : 0,
      by_kind: byKind
    }
  }
}
