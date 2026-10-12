/**
 * AI 能力层 · 大模型客户端接口
 *
 * 这一层是**唯一直接与外部模型交互的地方**（实验3 图2 的约束：
 * "AI 能力层是唯一与模型服务直接交互的层"，因此模型服务可被整体替换，见实验3 表8）。
 *
 * 接口一旦定下，上层（应用服务层）就只认这个接口，不认具体实现。
 * 实验4 阶段不接真实模型 —— 但**接口与真实调用完全一致**，
 * 换成真实模型只需要新增一个实现文件并改这里的 getLlmClient()。
 */

import type { Paragraph, Speaker, Tone } from '@/domain/types'
import { localLlm } from './local'

export interface DialogueDraft {
  speaker: Speaker
  text: string
  source_paragraph: number
}

export interface LlmInput {
  title: string
  tone: Tone
  paragraphs: Paragraph[]
}

export interface LlmClient {
  /** 客户端标识，会写进 dialogue_scripts.generator，用于追溯内容是谁产出的 */
  readonly name: string
  /** 是否为模拟实现（界面上需要如实标注，不能假装是真模型输出） */
  readonly isMock: boolean
  generate(input: LlmInput): Promise<DialogueDraft[]>
}

/**
 * 取当前生效的大模型客户端。
 *
 * 换真实模型（例如 DeepSeek / OpenAI 兼容接口）的做法：
 *   1. 新建 `real.ts`，实现 LlmClient（把 tone.prompt_template 与段落拼成 prompt，
 *      要求返回 JSON 数组，再解析成 DialogueDraft[]）；
 *   2. 在这里按环境变量选择：有 API Key 就用 real，没有就回落到 local。
 * 应用服务层一行都不用改。
 */
export function getLlmClient(): LlmClient {
  return localLlm
}
