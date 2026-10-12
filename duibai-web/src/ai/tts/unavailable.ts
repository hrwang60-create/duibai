/**
 * AI 能力层 · 语音合成「不可用」实现
 *
 * 它不是一个空壳：它的职责就是**把"依赖不可用"这件事如实上报**，
 * 从而触发实验3 表13 定义的降级路径（503 → 仅保存文字稿 → 状态置 text_only）。
 *
 * 为什么实验4 阶段刻意不接真 TTS：
 *   语音合成是 AI 能力，属于后续实验范围；本实验要证明的是
 *   "依赖不可用时程序不会崩、且能给用户明确的下一步"。
 */

import { AppError } from '@/domain/errors'
import type { TtsClient } from './index'

export const unavailableTts: TtsClient = {
  name: 'tts-not-configured',
  isMock: false,

  async synthesize() {
    throw new AppError(
      'TTS_UNAVAILABLE',
      '语音合成服务尚未接入（本阶段仅打通非AI 业务闭环）',
      '文字稿已完整保存，你可以先阅读；接入语音服务后可直接对同一份稿件合成音频',
      { fallback: 'text_only' }
    )
  }
}
