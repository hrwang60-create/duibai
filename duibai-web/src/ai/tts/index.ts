/**
 * AI 能力层 · 语音合成客户端接口
 *
 * 与 LLM 同样的处理方式：接口定死，实现可替换。
 * 双音色分配（甲/乙各一个音色）在这一层体现为 voiceOf(speaker)。
 */

import type { Speaker } from '@/domain/types'
import { unavailableTts } from './unavailable'

export interface TtsInput {
  /** 要合成的台词，按句序传入 */
  lines: Array<{ id: number; seq: number; speaker: Speaker; text: string }>
}

export interface TtsSegment {
  line_id: number
  speaker: Speaker
  file_path: string
  duration: number
}

export interface TtsClient {
  readonly name: string
  readonly isMock: boolean
  synthesize(input: TtsInput): Promise<TtsSegment[]>
}

/** 双音色分配：两个角色各用一个音色，这是产品形态的一部分 */
export const VOICES: Record<Speaker, string> = {
  A: '甲·清亮男声',
  B: '乙·温和女声'
}

/**
 * 取当前生效的语音合成客户端。
 *
 * 实验4 阶段返回 `unavailableTts` —— 它**如实抛 TTS_UNAVAILABLE**，
 * 让"语音合成不可用"这条降级路径被真实走到（实验3 表13 的 503 与 AC5）。
 * 这比伪造一段音频出来更符合事实：本阶段的 AI 能力层尚未接入。
 *
 * 接真实服务时：新增 `real.ts`（如火山引擎/腾讯云 TTS，逐句调用 + 拼接 + 响度归一化），
 * 在这里按环境变量切换即可；应用服务层与接口层都不用改。
 */
export function getTtsClient(): TtsClient {
  return unavailableTts
}
