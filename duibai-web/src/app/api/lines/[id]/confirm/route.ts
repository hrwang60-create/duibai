import { confirmLine } from '@/application/confirmService'
import { fail, ok, parseId } from '@/infrastructure/http'

/**
 * POST /api/lines/{id}/confirm —— 确认可疑处（AC4 的人工确认点）
 * 失败：404 条目不存在 / 409 该条目本来就不是待确认项
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    return ok(confirmLine(parseId(id)))
  } catch (e) {
    return fail(e, 'api/lines/[id]/confirm')
  }
}
