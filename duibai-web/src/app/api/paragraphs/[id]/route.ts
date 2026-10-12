import { getParagraph } from '@/application/confirmService'
import { fail, ok, parseId } from '@/infrastructure/http'

/** GET /api/paragraphs/{id} —— 出处回溯：取原文段落（US3 / UC4） */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    return ok(getParagraph(parseId(id)))
  } catch (e) {
    return fail(e, 'api/paragraphs/[id]')
  }
}
