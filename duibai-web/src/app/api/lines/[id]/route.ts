import { updateLine } from '@/application/confirmService'
import { AppError, fail, ok, parseId } from '@/infrastructure/http'

/**
 * PATCH /api/lines/{id} —— 修正单句台词
 * 输入：{ text }
 * 输出：{ line, pending }
 * 失败：404 条目不存在 / 400 内容为空或请求体畸形 / 400 超出单句长度上限
 * 说明：保存后会**重新跑程序校验**，改干净了就不再是待确认项（见 confirmService）
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let body: { text?: string }
  try {
    body = await req.json()
  } catch {
    return fail(
      new AppError('BAD_REQUEST', '请求体不是合法的 JSON', '请检查提交的数据格式'),
      'api/lines/[id]'
    )
  }
  try {
    const { id } = await ctx.params
    return ok(updateLine(parseId(id), body.text ?? ''))
  } catch (e) {
    return fail(e, 'api/lines/[id]')
  }
}

/** GET /api/lines/{id} —— 单条台词（供页面局部刷新） */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const lineId = parseId(id)
    const { lineRepo } = await import('@/infrastructure/repository')
    const line = lineRepo.get(lineId)
    if (!line) {
      throw new AppError('NOT_FOUND', `第 ${lineId} 条台词不存在`, '请刷新页面后重试')
    }
    return ok({ line })
  } catch (e) {
    return fail(e, 'api/lines/[id]')
  }
}
