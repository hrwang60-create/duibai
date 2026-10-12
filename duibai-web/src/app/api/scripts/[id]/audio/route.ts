import { synthesizeScript } from '@/application/audioService'
import { fail, ok, parseId } from '@/infrastructure/http'

/**
 * POST /api/scripts/{id}/audio —— 合成双音色音频
 * 失败：404 稿件不存在 / 409 仍有未确认项（返回 pending_line_ids）
 *       / 503 语音合成服务不可用（返回 fallback: text_only，文字稿保留）
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    return ok(await synthesizeScript(parseId(id)))
  } catch (e) {
    return fail(e, 'api/scripts/[id]/audio')
  }
}
