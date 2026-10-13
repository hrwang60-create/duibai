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
import { deepseekLlm } from './deepseek.mjs'
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
 * 实验4 阶段返回确定性本地实现；实验5 新增了真实模型实现（./deepseek.mjs），
 * 并按环境变量选择 —— **应用服务层一行都没改**，这正是当初把接口定死的目的。
 *
 * 为什么默认仍是本地实现（而不是"有密钥就用真实模型"）：
 *   实验4 的 18 项基础测试断言的是**确定性输出**。若默认切成真实模型，
 *   测试会随模型波动而失败，"闭环是否跑通"这个判断就不可复现了。
 *   所以真实模型要显式开启：
 *     LLM_PROVIDER=deepseek  （写在 duibai-web/.env.local 里，该文件不进版本库）
 *   以及 DEEPSEEK_API_KEY 已配置。
 */
export function getLlmClient(): LlmClient {
  const useReal = String(process.env.LLM_PROVIDER || '').toLowerCase() === 'deepseek'
  const hasKey = Boolean(process.env.DEEPSEEK_API_KEY)
  if (useReal && hasKey) return deepseekLlm as unknown as LlmClient
  return localLlm
}
