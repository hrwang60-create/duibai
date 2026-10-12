import { getArticleDetail } from '@/application/articleService'
import { fail, ok, parseId } from '@/infrastructure/http'

/** GET /api/articles/{id} —— 文章与段落（供生成前预览、以及结果页的出处回溯） */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    return ok(getArticleDetail(parseId(id)))
  } catch (e) {
    return fail(e, 'api/articles/[id]')
  }
}
