/**
 * 应用服务层 · 文章解析服务
 *
 * 职责：接收上传 → 校验输入 → 切分段落并编号 → 落库 → 返回段落列表。
 * 对应实验3 表12 的 `POST /api/articles`（提供模块：应用服务层）。
 *
 * 本环节**不含任何 AI**（实验3 表3：解析与编号归属"普通程序"），
 * 所以它是实验4"非AI业务闭环"的第一段，也是可以被完全确定地测试的一段。
 */

import { AppError } from '@/domain/errors'
import {
  assertArticleInput,
  normalizeContent,
  splitParagraphs,
  unsuitableRatio
} from '@/domain/paragraph'
import type { Article, Paragraph } from '@/domain/types'
import { getDb } from '@/infrastructure/db'
import { logger } from '@/infrastructure/logger'
import { articleRepo, paragraphRepo } from '@/infrastructure/repository'

export interface CreateArticleResult {
  article: Article
  paragraphs: Paragraph[]
  /** 表格公式占比，供生成环节做 AC3 的"不适合转音频"判断 */
  unsuitable_ratio: number
}

/** 上传并解析一篇文章。失败时抛 AppError，由接口层转成对应状态码。 */
export function createArticle(input: { title: string; content: string }): CreateArticleResult {
  const t0 = Date.now()
  assertArticleInput(input.title, input.content)

  const content = normalizeContent(input.content)
  const blocks = splitParagraphs(content)

  // 切分不可能为空——assertArticleInput 已挡掉空内容；留着是为了让这条不变式显式化
  if (!blocks.length) {
    throw new AppError('EMPTY_CONTENT', '切分后没有任何段落', '请检查文章是否有正文内容')
  }

  const title = (input.title || '').trim() || `未命名文章 ${new Date().toLocaleString('zh-CN')}`
  const ratio = unsuitableRatio(content)
  const now = new Date().toISOString()

  const db = getDb()
  let articleId = 0
  try {
    db.exec('BEGIN')
    articleId = articleRepo.insert({
      title,
      content,
      char_count: content.length,
      created_at: now
    })
    paragraphRepo.insertMany(articleId, blocks)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    logger.error('article', '上传落库失败，已回滚', {
      title,
      chars: content.length,
      err: e instanceof Error ? e.message : String(e)
    })
    throw new AppError('INTERNAL_ERROR', '文章保存失败，数据已回滚', '请重试；若反复失败请查看服务端日志')
  }

  const article = articleRepo.get(articleId)!
  const paragraphs = paragraphRepo.listByArticle(articleId)

  logger.info('article', '上传解析完成', {
    article_id: articleId,
    chars: content.length,
    paragraphs: paragraphs.length,
    unsuitable_ratio: ratio.toFixed(2),
    ms: Date.now() - t0
  })

  return { article, paragraphs, unsuitable_ratio: ratio }
}

export function getArticleDetail(
  articleId: number
): { article: Article; paragraphs: Paragraph[] } {
  const article = articleRepo.get(articleId)
  if (!article) {
    throw new AppError('NOT_FOUND', `文章 #${articleId} 不存在`, '可能已被删除，请回到首页重新上传')
  }
  return { article, paragraphs: paragraphRepo.listByArticle(articleId) }
}

/** 首页历史列表 */
export function listArticles(limit = 20) {
  return articleRepo.listWithScripts(limit)
}
