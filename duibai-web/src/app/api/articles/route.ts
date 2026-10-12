import { createArticle, listArticles } from '@/application/articleService'
import { fail, ok } from '@/infrastructure/http'

/** GET /api/articles —— 历史记录列表 */
export async function GET() {
  try {
    return ok({ articles: listArticles(20) })
  } catch (e) {
    return fail(e, 'api/articles')
  }
}

/**
 * POST /api/articles —— 上传并解析文章
 * 输入：{ title, content }        输出：{ article, paragraphs, unsuitable_ratio }
 * 失败：EMPTY_CONTENT / ENCODING_UNSUPPORTED / FILE_TOO_LARGE（见 domain/errors.ts）
 */
export async function POST(req: Request) {
  let body: { title?: string; content?: string }
  try {
    body = await req.json()
  } catch {
    return fail(new Error('请求体不是合法 JSON'), 'api/articles')
  }

  try {
    const result = createArticle({ title: body.title ?? '', content: body.content ?? '' })
    return ok(
      {
        article: result.article,
        paragraphs: result.paragraphs,
        unsuitable_ratio: result.unsuitable_ratio
      },
      201
    )
  } catch (e) {
    return fail(e, 'api/articles')
  }
}
