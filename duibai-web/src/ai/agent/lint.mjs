/**
 * AI 能力层 · 稿件质检规则（Agent 工具 `lint_script` 的实现）
 *
 * 与 src/domain/validation.ts 的分工要说清楚，否则会被当成"同一套规则写了两遍"：
 *   - `domain/validation.ts`：**生成时**执行，边检测边**改写**（清除括号、补出处、
 *     重算数值一致性），产出可以直接落库的台词；
 *   - `agent/lint.mjs`：**质检时**执行，**只检测、绝不改写**。
 *     它的职责是给出"问题清单 + 统计数字"，让 Agent 和用户判断要不要动数据。
 *
 * 两者规则相近但目的相反，所以没有合并。质检结果里的每个数字都是**可复核**的：
 * 成功标准复核时会重跑一次本文件，和模型写的报告对数（见 checks.mjs）。
 */

/** 仅可阅读的元素：括号补充、编号列表、图表/章节引用 */
const BRACKET = /[（(【\[][^）)】\]]*[）)】\]]/
const NUMBERING = /^\s*(?:\d+[.、)]|[一二三四五六七八九十]+[、.])\s*/
const FIGURE_REF = /(?:如图|见图|参见|如前所述|见下文|表\s*\d+|图\s*\d+|第\s*\d+(?:\.\d+)*\s*节)/

export const RULE_DEFS = [
  {
    id: 'readable',
    label: '仅可阅读的元素',
    desc: '括号补充、编号列表、"如图 / 见表 / 第 X 节"这类念出来听不懂的内容'
  },
  {
    id: 'source',
    label: '出处缺失或越界',
    desc: 'source_paragraph 为 0（无出处）或超出该文章的段落号范围'
  },
  {
    id: 'numbers',
    label: '数值无原文依据',
    desc: '台词里出现的数字，在其对应段落中找不到（可能是改写时引入的）'
  }
]

const nums = (s) => (String(s).match(/\d+(?:\.\d+)?/g) || []).map(String)

/**
 * 执行质检。
 *
 * @param {{lines: Array, paragraphs: Array}} input
 * @returns {{ total, counts, issues, stats }}
 *   counts —— 三类问题的条数（同一句可能同时命中多类，故各计各的）
 *   stats  —— 报告里必须出现的统计数字
 */
export function lintScript({ lines, paragraphs }) {
  const maxSeq = paragraphs.length ? Math.max(...paragraphs.map((p) => p.seq)) : 0
  const bySeq = new Map(paragraphs.map((p) => [p.seq, p.text]))

  const issues = []
  const counts = { readable: 0, source: 0, numbers: 0 }

  for (const ln of lines) {
    const text = String(ln.text || '')

    // ① 仅可阅读的元素
    const hits = []
    if (BRACKET.test(text)) hits.push('括号补充')
    if (NUMBERING.test(text)) hits.push('编号列表')
    const fig = text.match(FIGURE_REF)
    if (fig) hits.push(`图表/章节引用「${fig[0]}」`)
    if (hits.length) {
      counts.readable++
      issues.push({ line_id: ln.id, seq: ln.seq, type: 'readable', detail: hits.join('、') })
    }

    // ② 出处
    const sp = Number(ln.source_paragraph || 0)
    const badSource = sp <= 0 || sp > maxSeq
    if (badSource) {
      counts.source++
      issues.push({
        line_id: ln.id,
        seq: ln.seq,
        type: 'source',
        detail: sp <= 0 ? '没有标注出处（source_paragraph = 0）' : `出处 P${sp} 超出段落范围（共 ${maxSeq} 段）`
      })
    }

    // ③ 数值一致性：只对"有出处"的句子做，否则会把"无出处"重复计一遍
    if (!badSource) {
      const src = nums(bySeq.get(sp) || '')
      const mine = nums(text)
      const missing = mine.filter((n) => !src.includes(n))
      if (missing.length) {
        counts.numbers++
        issues.push({
          line_id: ln.id,
          seq: ln.seq,
          type: 'numbers',
          detail: `数字 ${missing.join('、')} 在 P${sp} 中找不到`
        })
      }
    }
  }

  const withSource = lines.filter((l) => {
    const sp = Number(l.source_paragraph || 0)
    return sp > 0 && sp <= maxSeq
  }).length

  const flagged = lines.filter((l) => String(l.flag || '') !== '')
  const pending = flagged.filter((l) => !l.confirmed).length

  return {
    total: lines.length,
    counts,
    issues,
    stats: {
      total_lines: lines.length,
      speaker_a: lines.filter((l) => l.speaker === 'A').length,
      speaker_b: lines.filter((l) => l.speaker === 'B').length,
      avg_chars: lines.length ? Math.round(lines.reduce((n, l) => n + String(l.text).length, 0) / lines.length) : 0,
      paragraphs: maxSeq,
      source_coverage: lines.length ? Number((withSource / lines.length).toFixed(2)) : 0,
      flagged: flagged.length,
      pending_confirm: pending
    }
  }
}
