/**
 * AI 能力层 · 确定性本地实现（实验4 阶段）
 *
 * 为什么需要它：实验4 考核的是**非AI 业务闭环**，而真实模型需要 API Key、有网络波动、
 * 输出还不稳定 —— 这三件事都会让"闭环是否跑通"这个判断变得不可复现。
 * 所以本阶段用一个**确定性实现**顶替，把接口与数据结构先跑通。
 *
 * 它为什么不算"造假"：
 *   - 它明确标记 isMock = true，并把 generator 名字写进数据库，界面上如实标注；
 *   - 它产出的内容**逐句引用原文**，因此可以被程序的出处校验和数值校验真实地检查；
 *   - 它**故意保留原文里听不出来的书面残留**（编号、图表引用、括号补充）——
 *     这正是真实模型最典型的输出缺陷。所以校验链路不是"演"的，
 *     它是真的在这批数据上抓到了问题。
 *
 * 换成真实模型时本文件可整体替换，接口不变（见 ./index.ts）。
 */

import type { Paragraph } from '@/domain/types'
import { cleanForAudio } from '@/domain/validation'
import type { DialogueDraft, LlmClient, LlmInput } from './index'

/** 单句台词目标长度：超过就断开，避免"一口气念不完" */
const SOFT_LIMIT = 90

/** 各口吻的提问句式。换成真实模型后，这些会变成 prompt 的一部分。 */
const ASK: Record<string, (topic: string) => string> = {
  teacher_student: (t) => `${t}——这个怎么理解？`,
  bicker: (t) => `等等，${t}？这不对吧。`,
  elder_kid: (t) => `${t}，这个我小时候可没听过。`,
  interview: (t) => `我们先说${t}，你是怎么看的？`,
  podcast: (t) => `${t}这事儿，其实挺有意思的。`,
  bedtime: (t) => `${t}，我们慢慢说。`
}

/** 按句号、问号、叹号、分号切句，保留句末标点 */
function splitSentences(text: string): string[] {
  const out: string[] = []
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

/** 太长的句子再按逗号切一刀；仍然超长就硬切，保证台词长度可控 */
function chunk(sentence: string): string[] {
  if (sentence.length <= SOFT_LIMIT) return [sentence]
  const parts = sentence.split(/(?<=[，,、])/)
  const out: string[] = []
  let buf = ''
  for (const p of parts) {
    if ((buf + p).length > SOFT_LIMIT && buf) {
      out.push(buf.trim())
      buf = p
    } else {
      buf += p
    }
  }
  if (buf.trim()) out.push(buf.trim())

  // 硬切兜底：中文单句没有逗号的极端情况
  return out.flatMap((s) => {
    if (s.length <= SOFT_LIMIT * 1.5) return [s]
    const arr: string[] = []
    for (let i = 0; i < s.length; i += SOFT_LIMIT) arr.push(s.slice(i, i + SOFT_LIMIT))
    return arr
  })
}

/**
 * 从原文句子取一个"话题短语"做提问。
 *
 * 两件事很关键：
 *   1. **先清洗再去数字** —— 否则问题里会带上"图 1"这类残留，或引入原文没有的裸数字；
 *   2. **按分句逐个挑**，跳过清洗后变空的分句。
 *      否则"如图 1 所示，帧由帧头…"这种句子会被清成空，问题就退化成"这一段"这种废话。
 */
function topicOf(sentence: string): string {
  const clauses = sentence.split(/[，,。！？；]/).filter((c) => c.trim())
  for (const c of clauses) {
    const cleaned = cleanForAudio(c).text
    const t = cleaned.replace(/[A-Za-z0-9.]*\d[A-Za-z0-9.]*/g, '').replace(/\s+/g, '').trim()
    if (t.length >= 2) return t.length > 16 ? t.slice(0, 16) + '…' : t
  }
  return '这一段'
}

export const localLlm: LlmClient = {
  name: 'local-rule-based-v1',
  isMock: true,

  async generate({ tone, paragraphs }: LlmInput): Promise<DialogueDraft[]> {
    const ask = ASK[tone.code] ?? ASK.teacher_student
    // 睡前口吻语速慢、句子少：每段只取一句
    const perPara = tone.code === 'bedtime' ? 1 : 2

    const drafts: DialogueDraft[] = []
    for (const p of paragraphs) {
      const chunks = splitSentences(p.text).flatMap(chunk).slice(0, perPara)
      for (const s of chunks) {
        // 固定「甲问、乙答」：对话结构最清楚，也不会出现"同一句既问又答"
        drafts.push({ speaker: 'A', text: ask(topicOf(s)), source_paragraph: p.seq })
        // 回答方**逐字引用原文**：书面残留因此被带出来，交给程序校验去发现
        drafts.push({ speaker: 'B', text: s, source_paragraph: p.seq })
      }
    }
    return drafts
  }
}
