/**
 * 领域层 · 程序校验规则
 *
 * 这是整条链路里**取代不了的那一段普通程序**。
 * 按实验3 表3 的分工，以下四件事全部由程序完成，不允许交给模型判断：
 *
 *   1. 听觉可用性校验 —— 括号、编号、图表引用、Markdown 残留必须清掉（AC1：文本中无括号、编号、图表引用）
 *   2. 出处校验       —— source_paragraph 必须指向本文已有段落，越界一律归零并标记
 *   3. 数值一致性校验 —— 台词里的数字必须能在对应原文段落里找到（防止模型把数值改掉）
 *   4. 结构归一化     —— 句序重排为连续、角色收敛为 A/B、清空后无内容的句子丢弃
 *
 * 设计原则：**能精确判定的都不交给模型**。模型只负责"说什么"，程序负责"说得对不对"。
 */

import type { DialogueLine, LineFlag, Speaker } from './types'

/** 单句台词长度上限。超过就不再是"一句台词"，听感上也不成立。 */
export const MAX_LINE_CHARS = 120

/* ------------------------------------------------------------ 1. 听觉清洗 */

interface CleanRule {
  name: string
  re: RegExp
  to: string
}

/**
 * 清洗规则表。顺序有意义：先去括号（括号里常有编号与图表引用），再处理外层残留。
 */
const CLEAN_RULES: CleanRule[] = [
  // 括号补充说明：中文/英文圆括号、方括号里的短补充
  { name: '括号补充', re: /[（(【\[]([^（()）【】\[\]]{0,80})[）)】\]]/g, to: '' },
  // 引文编号 [1] [12]
  { name: '引文编号', re: /\[\s*\d+\s*\]/g, to: '' },
  // "如图 1 所示" "见表2" "式 3.1" —— 前面不能紧跟汉字，否则会把"形式2"这种词切坏
  {
    name: '图表引用',
    re: /(?<![\u4e00-\u9fff])(?:如|见|参见|详见|参考|根据)?\s*(?:图|表|式|附录|图表)\s*\d+(?:[.\-]\d+)*\s*(?:所示|中|里|所示内容)?/g,
    to: ''
  },
  { name: '图表引用（无编号）', re: /(?:如|见|参见|详见)\s*(?:图|表|下图|上图|下表|上表)\s*(?:所示|中|里)?/g, to: '' },
  // "参见第 3.2 节"
  { name: '章节引用', re: /(?:参见|见|详见|参考)\s*第\s*[\d.]+\s*[节章部分]?/g, to: '' },
  // Markdown 残留
  { name: 'Markdown 强调', re: /\*{1,3}|_{2,}|`{1,3}/g, to: '' },
  { name: 'Markdown 标题', re: /^\s*#{1,6}\s*/gm, to: '' },
  { name: 'Markdown 单元格', re: /^\s*\|.*\|\s*$/gm, to: '' },
  { name: 'Markdown 分隔行', re: /^\s*[-+|:\s]{4,}\s*$/gm, to: '' },
  // 链接与 URL
  { name: '链接', re: /https?:\/\/\S+/g, to: '' },
  // 收尾：空白与孤立标点归一
  { name: '空白归一', re: /[ \t]{2,}/g, to: ' ' },
  { name: '孤立标点', re: /^[，。、；：,;:]+/, to: '' }
]

export interface CleanResult {
  text: string
  /** 实际命中的规则名（去重），用于给用户解释"这句话为什么可疑" */
  hits: string[]
}

/** 清掉"听不出来"的书面残留。返回清洗后的文本与命中的规则名。 */
export function cleanForAudio(raw: string): CleanResult {
  let text = String(raw ?? '')
  const hits: string[] = []
  for (const r of CLEAN_RULES) {
    const before = text
    // 全局正则每轮重置 lastIndex，避免复用导致漏匹配
    r.re.lastIndex = 0
    text = text.replace(r.re, r.to)
    if (text !== before && !hits.includes(r.name)) hits.push(r.name)
  }
  return { text: text.trim(), hits }
}

export function auditoryIssues(text: string): string[] {
  return cleanForAudio(text).hits
}

/* ------------------------------------------------------- 3. 数值一致性 */

/** 抽出文本里的阿拉伯数字（含小数与百分号）。中文数字（三、两）不参与比对，误报多。 */
export function extractNumbers(text: string): string[] {
  const out: string[] = []
  const re = /\d+(?:\.\d+)?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push(m[0])
  return out
}

/**
 * 台词里出现的数字必须能在对应原文段落里找到。
 * 找不到 → 判定模型改动了数值（这是最危险的一类错误：读者无法察觉）。
 */
export function hasNumberDrift(line: string, sourceText: string): boolean {
  const nums = extractNumbers(line)
  if (!nums.length) return false
  return nums.some((n) => !sourceText.includes(n))
}

/* ----------------------------------------------------- 4. 结构归一化 */

export interface LineDraft {
  seq?: number
  speaker?: string
  text: string
  source_paragraph?: number
}

export interface ValidatedLine {
  seq: number
  speaker: Speaker
  text: string
  source_paragraph: number
  flag: LineFlag
  confirmed: boolean
}

export interface ValidateReport {
  lines: ValidatedLine[]
  /** 待确认项数量 */
  pending: number
  /** 丢弃的句子（清洗后为空） */
  dropped: number
  /** 出处被归零的句子数 */
  outOfRange: number
  /** 命中听觉清洗的句子数 */
  cleaned: number
  /** 命中数值漂移的句子数 */
  numberDrift: number
  /** 逐句的处理说明，进日志 */
  notes: string[]
}

/** 可疑类型的严重度：出处问题 > 数值问题 > 术语/表达问题 */
const SEVERITY: Record<LineFlag, number> = { '': 0, no_source: 3, number: 2, term: 1 }

function pickFlag(a: LineFlag, b: LineFlag): LineFlag {
  return SEVERITY[a] >= SEVERITY[b] ? a : b
}

/**
 * 校验并归一化一批台词。
 *
 * @param drafts          待校验台词（来自 AI 能力层，或来自用户对单句的修改）
 * @param paragraphs      该文章的段落（用于出处与数值比对）
 * @param opts.keepConfirmed  已有确认记录的行（单句修正时用），用于保持"已确认"状态
 */
export function validateLines(
  drafts: LineDraft[],
  paragraphs: Array<{ seq: number; text: string }>,
  opts: { keepConfirmedSeq?: Set<number> } = {}
): ValidateReport {
  const bySeq = new Map<number, string>()
  for (const p of paragraphs) bySeq.set(p.seq, p.text)
  const maxSeq = paragraphs.reduce((m, p) => Math.max(m, p.seq), 0)

  const lines: ValidatedLine[] = []
  const notes: string[] = []
  let dropped = 0
  let outOfRange = 0
  let cleaned = 0
  let numberDrift = 0

  drafts.forEach((d, i) => {
    const raw = String(d.text ?? '')
    const { text, hits } = cleanForAudio(raw)
    if (!text) {
      dropped++
      notes.push(`第 ${i + 1} 条：清洗后为空，已丢弃（命中 ${hits.join('、') || '空白'}）`)
      return
    }

    const seq = lines.length + 1
    // 角色收敛：只有 A / B 两个合法取值，其余按出现顺序交替
    const up = String(d.speaker ?? '').toUpperCase()
    const speaker: Speaker = up === 'A' || up === 'B' ? (up as Speaker) : seq % 2 === 1 ? 'A' : 'B'

    // 出处校验
    let source = Number(d.source_paragraph ?? 0)
    let flag: LineFlag = ''
    if (!Number.isInteger(source) || source < 1 || source > maxSeq) {
      if (source !== 0) {
        outOfRange++
        notes.push(`第 ${seq} 条：出处 ${d.source_paragraph} 越界（本文共 ${maxSeq} 段），已归零`)
      }
      source = 0
      flag = pickFlag(flag, 'no_source')
    }

    // 数值一致性
    if (source > 0) {
      const srcText = bySeq.get(source) ?? ''
      if (hasNumberDrift(text, srcText)) {
        numberDrift++
        flag = pickFlag(flag, 'number')
        notes.push(`第 ${seq} 条：出现原文段落中找不到的数字，已标记待确认`)
      }
    }

    // 听觉可用性：清洗确实删掉了东西 → 记为术语/表达待确认
    if (hits.filter((h) => h !== '空白归一' && h !== '孤立标点').length) {
      cleaned++
      flag = pickFlag(flag, 'term')
      notes.push(`第 ${seq} 条：清除书面残留「${hits.join('、')}」`)
    }

    const alreadyConfirmed = Boolean(opts.keepConfirmedSeq?.has(seq)) && flag === ''
    lines.push({
      seq,
      speaker,
      text,
      source_paragraph: source,
      flag,
      confirmed: alreadyConfirmed
    })
  })

  const pending = lines.filter((l) => l.flag !== '' && !l.confirmed).length
  return { lines, pending, dropped, outOfRange, cleaned, numberDrift, notes }
}

/* --------------------------------------------------------- 5. 待确认描述 */

/** 把机器判据翻译成用户能看懂的一句话。 */
export function explainFlag(flag: LineFlag, line: Pick<DialogueLine, 'source_paragraph'>): string {
  switch (flag) {
    case 'no_source':
      return '这句话在原文里找不到对应段落 —— 可能是模型自己补的'
    case 'number':
      return '这句话里的数字和原文对不上 —— 读出来会被直接记住'
    case 'term':
      return '这句话里有书面残留（编号、图表引用或括号补充），已经按听觉需要去掉了'
    default:
      return ''
  }
}
