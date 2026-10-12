import { createArticle, listArticles } from '@/application/articleService'
import { AppError, fail, ok } from '@/infrastructure/http'

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
    // 修订版修正：请求体畸形是客户端错误，返回 400 并给出可用提示，
    // 不能落到 INTERNAL_ERROR（500）上去——那会把用户的输入问题记成服务端故障。
    return fail(
      new AppError(
        'BAD_REQUEST',
        '请求体不是合法的 JSON',
        '请检查提交的数据格式（JSON 的键与字符串都要用双引号）'
      ),
      'api/articles'
    )
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
