/**
 * 应用服务层 · 确认与修订服务
 *
 * 对应实验3 表12 的 `POST /api/lines/{id}/confirm` 与 `PATCH /api/lines/{id}`。
 * 这个服务是实验3 一致性检查（表15 的 P1）专门补上的那一个环节 ——
 * 没有它，模型把术语读错就只能在音频里错下去。
 *
 * 两条规则：
 *   1. 只有被标记为可疑的句子才需要确认，确认一个非法目标要报 409 而不是默默通过；
 *   2. 单句修正后必须**重新跑一遍程序校验**，不能因为"用户改过了"就默认可信。
 */

import { AppError } from '@/domain/errors'
import type { DialogueLine } from '@/domain/types'
import { MAX_LINE_CHARS, cleanForAudio, validateLines } from '@/domain/validation'
import { logger } from '@/infrastructure/logger'
import { articleRepo, audioRepo, lineRepo, paragraphRepo, scriptRepo } from '@/infrastructure/repository'

/** 稿件状态由"待确认项数量 + 是否已有音频"共同决定，任何改动后都要重算 */
export function recomputeScript(scriptId: number): void {
  const script = scriptRepo.get(scriptId)
  if (!script) return
  const lines = lineRepo.listByScript(scriptId)
  const pending = lines.filter((l) => l.flag !== '' && !l.confirmed).length
  const hasAudio = audioRepo.listByScript(scriptId).length > 0

  let status = script.status
  if (pending > 0) status = 'generated'
  else if (hasAudio) status = 'audio_ready'
  else if (script.status === 'text_only') status = 'text_only'
  else status = 'confirmed'

  scriptRepo.update(scriptId, { pending_confirm: pending, line_count: lines.length, status })
}

export function confirmLine(lineId: number): { line: DialogueLine; pending: number } {
  const line = lineRepo.get(lineId)
  if (!line) {
    throw new AppError('NOT_FOUND', `第 ${lineId} 条台词不存在`, '请刷新页面后重试')
  }
  if (!line.flag) {
    // 不该被点到的操作要点出来，而不是静默成功 —— 否则"待确认数"会莫名减少
    throw new AppError(
      'NOT_PENDING_CONFIRMATION',
      '这条台词并没有被标记为可疑，不需要确认',
      '如果你改过内容，请点「重做这一句」重新校验'
    )
  }
  lineRepo.setConfirmed(lineId)
  recomputeScript(line.script_id)
  const updated = lineRepo.get(lineId)!
  const pending = scriptRepo.get(line.script_id)?.pending_confirm ?? 0
  logger.info('confirm', '用户确认了可疑项', {
    line_id: lineId,
    script_id: line.script_id,
    flag: line.flag,
    pending_after: pending
  })
  return { line: updated, pending }
}

export function updateLine(lineId: number, rawText: string): { line: DialogueLine; pending: number } {
  const line = lineRepo.get(lineId)
  if (!line) {
    throw new AppError('NOT_FOUND', `第 ${lineId} 条台词不存在`, '请刷新页面后重试')
  }

  const text = String(rawText ?? '').trim()
  if (!text) {
    throw new AppError('BAD_REQUEST', '修改后的台词是空的', '请填写内容，或直接确认原来的写法')
  }
  // 按**清洗前**的长度判断，避免用户用一堆括号把上限撑过去
  if (text.length > MAX_LINE_CHARS) {
    throw new AppError(
      'LINE_TOO_LONG',
      `这条台词 ${text.length} 字，超过单句上限 ${MAX_LINE_CHARS} 字`,
      '请拆成两句，或精简到上限以内'
    )
  }

  // 用与生成时**同一套**校验规则重新判定，保证口径一致
  const script = scriptRepo.get(line.script_id)
  const paragraphs = script ? paragraphRepo.listByArticle(script.article_id) : []
  const revalidated = validateLines(
    [{ speaker: line.speaker, text, source_paragraph: line.source_paragraph }],
    paragraphs
  )
  const v = revalidated.lines[0]
  if (!v) {
    throw new AppError(
      'BAD_REQUEST',
      '修改后的台词经清洗后为空',
      '请改写为可以朗读的完整句子'
    )
  }

  lineRepo.updateTextAndValidation(lineId, v.text, v.flag, v.flag === '')
  recomputeScript(line.script_id)
  const pending = scriptRepo.get(line.script_id)?.pending_confirm ?? 0
  logger.info('confirm', '单句修正已保存并重新校验', {
    line_id: lineId,
    script_id: line.script_id,
    before_flag: line.flag || '（无）',
    after_flag: v.flag || '（无）',
    cleaned: cleanForAudio(text).hits.join('、') || '无',
    pending_after: pending
  })
  return { line: lineRepo.get(lineId)!, pending }
}

/** 出处回溯：按段落 id 取原文（实验3 表12 的 GET /api/paragraphs/{id}） */
export function getParagraph(paragraphId: number) {
  const p = paragraphRepo.get(paragraphId)
  if (!p) {
    throw new AppError('NOT_FOUND', `原文段落 #${paragraphId} 不存在`, '可能已被删除')
  }
  const article = articleRepo.get(p.article_id)
  return { ...p, article_title: article?.title ?? '' }
}
