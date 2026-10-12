import { generateScript } from '@/application/scriptService'
import { AppError, fail, ok } from '@/infrastructure/http'

/**
 * POST /api/scripts —— 生成对谈稿件
 * 输入：{ article_id, tone_code }
 * 输出：{ script, lines, pending, is_mock, report }
 * 失败：404 文章不存在 / 400 口吻不存在 / 422 内容形态不适合转音频（AC3）
 *       / 504 模型超时 / 502 模型输出不合规
 */
export async function POST(req: Request) {
  let body: { article_id?: number | string; tone_code?: string }
  try {
    body = await req.json()
  } catch {
    // 修订版修正：请求体畸形属于**客户端**错误，必须返回 400 而不是 500
    return fail(
      new AppError('BAD_REQUEST', '请求体不是合法的 JSON', '请检查提交的数据格式'),
      'api/scripts'
    )
  }

  const articleId = Number(body.article_id)
  if (!Number.isInteger(articleId) || articleId <= 0) {
    return fail(
      new AppError('BAD_REQUEST', 'article_id 缺失或不是正整数', '请先在首页上传文章'),
      'api/scripts'
    )
  }
  if (!body.tone_code) {
    return fail(new AppError('BAD_REQUEST', 'tone_code 缺失', '请选择一种口吻'), 'api/scripts')
  }

  try {
    const result = await generateScript({ articleId, toneCode: body.tone_code })
    return ok(
      {
        script: result.script,
        lines: result.lines,
        pending: result.pending,
        is_mock: result.isMock,
        report: result.report
      },
      201
    )
  } catch (e) {
    return fail(e, 'api/scripts')
  }
}
