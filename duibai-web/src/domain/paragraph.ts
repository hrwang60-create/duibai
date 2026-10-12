/**
 * 领域层 · 文章解析与段落编号
 *
 * 归属：**普通程序**（实验3 表3：切分与编号"结果为确定的编号序列，正则与解析器即可完成"）。
 * 这是整条链路里第一个纯规则环节，也是出处回溯的地基。
 */

import { AppError } from './errors'

/** 单篇上限，对应实验3 图7 的界面约束"单篇不超过 3000 字" */
export const MAX_CHARS = 3000

/** 段落数上限，防止用户粘进来一整本书 */
export const MAX_PARAGRAPHS = 200

const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/

/**
 * 归一化原文。
 * 处理的事：去掉 BOM、统一换行、把 3 个以上连续换行压成 1 个空行、去掉行尾空白。
 * 不做的事：**不动正文里的任何字符**（Markdown 残留交给校验环节处理，不在这里偷偷删）。
 */
export function normalizeContent(raw: string): string {
  let s = raw.replace(/^\uFEFF/, '')
  s = s.replace(/\r\n?/g, '\n')
  s = s.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/** 合并段内的单个换行。中文之间不加空格，中英/英文之间加 1 个空格，否则英文会被粘成一个词。 */
function joinWrappedLines(lines: string[]): string {
  let out = ''
  for (const line of lines) {
    if (!out) {
      out = line
      continue
    }
    const prev = out.slice(-1)
    const next = line.slice(0, 1)
    out += CJK.test(prev) || CJK.test(next) ? '' : ' '
    out += line
  }
  return out.trim()
}

/**
 * 切分段落并编号。
 *
 * 切分规则（按优先级）：
 *   1. 空行 → 分段
 *   2. Markdown 标题行（`#` 开头）→ 独立成段，并剥掉前导 `#`
 *   3. 其余连续行 → 同段，按中英规则合并换行
 *
 * 返回的数组下标 + 1 就是该段的 `seq`（段号从 1 开始，与实验3 图4 的约定一致）。
 */
export function splitParagraphs(raw: string): string[] {
  const content = normalizeContent(raw)
  if (!content) return []

  const blocks: string[] = []
  let buf: string[] = []

  const flush = () => {
    if (buf.length) {
      const merged = joinWrappedLines(buf)
      if (merged) blocks.push(merged)
      buf = []
    }
  }

  for (const line of content.split('\n')) {
    if (!line.trim()) {
      flush()
      continue
    }
    if (/^#{1,6}\s+/.test(line)) {
      flush()
      blocks.push(line.replace(/^#{1,6}\s+/, '').trim())
      continue
    }
    buf.push(line.trim())
  }
  flush()

  return blocks.filter((b) => b.length > 0).slice(0, MAX_PARAGRAPHS)
}

/**
 * 内容形态判断：表格 / 公式占比。
 *
 * 归属：**普通程序**（实验3 表3：占比"可由程序量化"）。
 * 阈值判断之后，由应用服务层决定是否拒绝（AC3：拒绝并提示，不直接生成）。
 */
export function unsuitableRatio(content: string): number {
  const lines = content.split('\n').filter((l) => l.trim())
  if (!lines.length) return 0
  let bad = 0
  for (const l of lines) {
    const t = l.trim()
    const isTable = /^\|.*\|$/.test(t) || /^[-+]{3,}/.test(t) || t.split('|').length >= 3
    const isFormula = /[=≈∑∫√]/.test(t) || /\\[a-zA-Z]+\{/.test(t) || /^[A-Za-z]\s*=\s*/.test(t)
    if (isTable || isFormula) bad++
  }
  return bad / lines.length
}

/** 超阈值即判"不适合转为音频"。0.5 是实验3 表13 举例口径（表格公式占比 83%）留给我们的余量。 */
export const UNSUITABLE_THRESHOLD = 0.5

export function assertArticleInput(title: string, content: string): void {
  const t = (title || '').trim()
  const c = normalizeContent(content || '')

  if (!c) {
    throw new AppError(
      'EMPTY_CONTENT',
      '文章内容是空的，没有可解析的文字',
      '请重新选择文件，或直接把文章正文粘贴进来'
    )
  }
  // 含 NUL 或大量替换字符 —— 典型的二进制/错误编码文件被当文本读进来
  const bad = (c.match(/\u0000|\uFFFD/g) || []).length
  if (bad > 0) {
    throw new AppError(
      'ENCODING_UNSUPPORTED',
      `文件内容包含 ${bad} 个无法识别的字符，可能是二进制文件或使用了不支持的编码`,
      '请另存为 UTF-8 编码的 .md 或 .txt 后再上传'
    )
  }
  if (c.length > MAX_CHARS) {
    throw new AppError(
      'FILE_TOO_LARGE',
      `文章 ${c.length} 字，超过单篇上限 ${MAX_CHARS} 字`,
      `请拆分后分次上传，或删减到 ${MAX_CHARS} 字以内`
    )
  }
  if (t.length > 120) {
    throw new AppError('EMPTY_CONTENT', '标题超过 120 字', '请把标题精简到 120 字以内')
  }
}
