/**
 * 应用服务层 · 对话生成编排
 *
 * 对应实验3 表12 的 `POST /api/scripts`，也是实验3 图5 顺序图里最长的一段。
 * 它自己不"写"任何一句话 —— 它的职责是**编排与把关**：
 *
 *   读文章 → 形态判断（AC3）→ 调 AI 能力层生成 → **程序三校** → 落库 → 返回待确认项
 *
 * 关键约束（实验3 表3 的边界结论）：AI 产出**必须经过程序校验或用户确认之后才能进入下一步**。
 * 本文件就是那道闸门。
 */

import { getLlmClient } from '@/ai/llm'
import { AppError, isAppError } from '@/domain/errors'
import { UNSUITABLE_THRESHOLD, unsuitableRatio } from '@/domain/paragraph'
import type { DialogueLine, DialogueScript, Tone } from '@/domain/types'
import { validateLines } from '@/domain/validation'
import { getDb } from '@/infrastructure/db'
import { logger } from '@/infrastructure/logger'
import { articleRepo, lineRepo, paragraphRepo, scriptRepo, toneRepo } from '@/infrastructure/repository'

export interface GenerateResult {
  script: DialogueScript
  lines: DialogueLine[]
  pending: number
  /** 是否为模拟实现产出（界面必须如实标注） */
  isMock: boolean
  report: {
    sentences: number
    dropped: number
    out_of_range: number
    cleaned: number
    number_drift: number
    notes: string[]
    ms: number
  }
}

export async function generateScript(input: {
  articleId: number
  toneCode: string
}): Promise<GenerateResult> {
  const t0 = Date.now()

  const article = articleRepo.get(input.articleId)
  if (!article) {
    throw new AppError(
      'NOT_FOUND',
      `文章 #${input.articleId} 不存在`,
      '可能已被删除，请回到首页重新上传'
    )
  }

  const tone: Tone | undefined = toneRepo.get(input.toneCode)
  if (!tone) {
    // 修订版新增的独立错误码：口吻不存在属于输入不合法，不该混进"记录不存在"
    throw new AppError(
      'TONE_NOT_FOUND',
      `口吻「${input.toneCode}」不存在或已下架`,
      '请回到首页重新选择一种口吻'
    )
  }

  const paragraphs = paragraphRepo.listByArticle(article.id)
  if (!paragraphs.length) {
    logger.error('script', '文章没有任何段落，数据不完整', { article_id: article.id })
    throw new AppError(
      'INTERNAL_ERROR',
      '这篇文章没有解析出段落，无法生成',
      '请删除该记录后重新上传这篇文章'
    )
  }

  // —— 内容形态判断（AC3）：表格公式占比过高直接拒绝，不进入生成 ——
  const ratio = unsuitableRatio(article.content)
  if (ratio > UNSUITABLE_THRESHOLD) {
    throw new AppError(
      'NOT_SUITABLE_FOR_AUDIO',
      `表格与公式占比 ${(ratio * 100).toFixed(0)}%，读出来听不出信息`,
      '请改用文字摘要形式，或换一篇以叙述性文字为主的文章',
      { unsuitable_ratio: Number(ratio.toFixed(2)) }
    )
  }

  // —— 调 AI 能力层 ——
  const llm = getLlmClient()
  let drafts
  try {
    drafts = await llm.generate({ title: article.title, tone, paragraphs })
  } catch (e) {
    if (isAppError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    logger.error('script', '模型调用失败', { article_id: article.id, err: msg })
    if (/timeout|ETIMEDOUT|aborted/i.test(msg)) {
      throw new AppError('MODEL_TIMEOUT', '模型响应超时', '请稍后重试；原文与段落已保存，不必重新上传')
    }
    throw new AppError('MODEL_OUTPUT_INVALID', '模型返回的内容无法解析', '请稍后重试')
  }

  if (!Array.isArray(drafts) || !drafts.length) {
    logger.error('script', '模型返回空结果', { article_id: article.id, generator: llm.name })
    throw new AppError('MODEL_OUTPUT_INVALID', '模型没有返回任何台词', '请稍后重试，或换一种口吻')
  }

  // —— 程序三校（听觉可用性 / 出处 / 数值一致性）+ 结构归一化 ——
  const report = validateLines(drafts, paragraphs)
  if (!report.lines.length) {
    throw new AppError(
      'MODEL_OUTPUT_INVALID',
      '生成的台词经清洗后没有剩下有效内容',
      '请换一种口吻重试'
    )
  }

  // —— 落库（一个事务：稿件与台词要么都进，要么都不进）——
  const now = new Date().toISOString()
  const db = getDb()
  let scriptId = 0
  try {
    db.exec('BEGIN')
    scriptId = scriptRepo.insert({
      article_id: article.id,
      tone_code: tone.code,
      status: 'generated',
      line_count: report.lines.length,
      pending_confirm: report.pending,
      generator: llm.name,
      created_at: now
    })
    lineRepo.insertMany(scriptId, report.lines)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    logger.error('script', '生成结果落库失败，已回滚', {
      article_id: article.id,
      err: e instanceof Error ? e.message : String(e)
    })
    throw new AppError('INTERNAL_ERROR', '生成结果保存失败，数据已回滚', '请重试')
  }

  const script = scriptRepo.get(scriptId)!
  const lines = lineRepo.listByScript(scriptId)

  logger.info('script', '生成并校验完成', {
    article_id: article.id,
    script_id: scriptId,
    generator: llm.name,
    is_mock: llm.isMock,
    sentences: report.lines.length,
    dropped: report.dropped,
    out_of_range: report.outOfRange,
    cleaned: report.cleaned,
    number_drift: report.numberDrift,
    pending: report.pending,
    ms: Date.now() - t0
  })
  for (const n of report.notes) logger.info('script', '校验说明 · ' + n, { script_id: scriptId })

  return {
    script,
    lines,
    pending: report.pending,
    isMock: llm.isMock,
    report: {
      sentences: report.lines.length,
      dropped: report.dropped,
      out_of_range: report.outOfRange,
      cleaned: report.cleaned,
      number_drift: report.numberDrift,
      notes: report.notes,
      ms: Date.now() - t0
    }
  }
}

export function getScriptDetail(
  scriptId: number
): { script: DialogueScript; lines: DialogueLine[]; article: { id: number; title: string } } {
  const script = scriptRepo.get(scriptId)
  if (!script) {
    throw new AppError('NOT_FOUND', `对谈稿件 #${scriptId} 不存在`, '请回到首页从历史记录重新打开')
  }
  const article = articleRepo.get(script.article_id)
  if (!article) {
    throw new AppError('NOT_FOUND', '该稿件对应的文章已不存在', '请回到首页重新上传')
  }
  return {
    script,
    lines: lineRepo.listByScript(scriptId),
    article: { id: article.id, title: article.title }
  }
}
