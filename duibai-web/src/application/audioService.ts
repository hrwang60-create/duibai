/**
 * 应用服务层 · 音频合成调度
 *
 * 对应实验3 表12 的 `POST /api/scripts/{id}/audio`，图5 顺序图里的最后一个分支组。
 *
 * 这里的价值不在于"能不能合成"，而在于**合成之前的前置校验**与**合成失败之后的降级**：
 *   · 存在未确认的可疑项 → 409，并且把到底哪几句没确认列出来（表13）
 *   · 语音服务不可用     → 503，但文字稿完整保留，状态置 text_only（AC5）
 * 两条路径都不会让已经产出的内容丢失。
 */

import { getTtsClient, VOICES } from '@/ai/tts'
import { AppError, isAppError } from '@/domain/errors'
import { logger } from '@/infrastructure/logger'
import { audioRepo, lineRepo, scriptRepo } from '@/infrastructure/repository'
import { recomputeScript } from './confirmService'

export interface SynthesizeResult {
  mode: 'audio'
  count: number
  segments: Array<{ line_id: number; seq: number; speaker: string; file_path: string }>
}

export async function synthesizeScript(scriptId: number): Promise<SynthesizeResult> {
  const t0 = Date.now()
  const script = scriptRepo.get(scriptId)
  if (!script) {
    throw new AppError('NOT_FOUND', `对谈稿件 #${scriptId} 不存在`, '请回到首页从历史记录重新打开')
  }
  const lines = lineRepo.listByScript(scriptId)
  if (!lines.length) {
    throw new AppError('INTERNAL_ERROR', '这份稿件没有任何台词，无法合成', '请重新生成一次')
  }

  // —— 人工确认点（AC4）：有未确认的可疑项就拒绝合成 ——
  const pending = lines.filter((l) => l.flag !== '' && !l.confirmed)
  if (pending.length) {
    logger.warn('audio', '存在未确认项，拒绝合成', {
      script_id: scriptId,
      pending: pending.length
    })
    throw new AppError(
      'PENDING_CONFIRMATION',
      `还有 ${pending.length} 处可疑内容没有确认，确认后才能合成音频`,
      '回到确认页逐条处理这 ' + pending.length + ' 处',
      { pending_line_ids: pending.map((l) => l.id) }
    )
  }

  // —— 调 AI 能力层的语音合成 ——
  const tts = getTtsClient()
  try {
    const segments = await tts.synthesize({
      lines: lines.map((l) => ({ id: l.id, seq: l.seq, speaker: l.speaker, text: l.text }))
    })
    for (const s of segments) audioRepo.upsert(s)
    recomputeScript(scriptId)
    logger.info('audio', '语音合成完成', {
      script_id: scriptId,
      provider: tts.name,
      count: segments.length,
      ms: Date.now() - t0
    })
    const seqOf = new Map(lines.map((l) => [l.id, l.seq]))
    return {
      mode: 'audio',
      count: segments.length,
      segments: segments.map((s) => ({
        line_id: s.line_id,
        seq: seqOf.get(s.line_id) ?? 0,
        speaker: s.speaker,
        file_path: s.file_path
      }))
    }
  } catch (e) {
    if (!isAppError(e) || e.code !== 'TTS_UNAVAILABLE') {
      logger.error('audio', '语音合成出现未预期异常', {
        script_id: scriptId,
        err: e instanceof Error ? e.message : String(e)
      })
      throw new AppError('TTS_UNAVAILABLE', '语音合成服务返回了异常', '请稍后重试；文字稿不受影响')
    }

    // —— 降级路径（AC5）：按实验3 表13 的规定返回 503 + fallback，
    //    并**把文字稿原样留在库里**（状态置 text_only），已经产出的内容不因为依赖故障而丢失。
    scriptRepo.update(scriptId, { status: 'text_only' })
    logger.warn('audio', '语音合成不可用，降级为仅文字稿', {
      script_id: scriptId,
      provider: tts.name,
      reason: e.reason,
      lines: lines.length,
      ms: Date.now() - t0
    })
    throw new AppError(
      'TTS_UNAVAILABLE',
      e.reason,
      '文字稿已完整保存 —— 可以点「仅保存文字稿」继续阅读；语音服务恢复后对同一份稿件重新合成即可',
      { fallback: 'text_only', line_count: lines.length }
    )
  }
}

/** 结果页要展示的双音色分配 */
export function voices() {
  return VOICES
}
