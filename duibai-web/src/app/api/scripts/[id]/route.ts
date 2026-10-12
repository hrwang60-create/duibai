import { getScriptDetail } from '@/application/scriptService'
import { voices } from '@/application/audioService'
import { audioRepo, paragraphRepo } from '@/infrastructure/repository'
import { fail, ok, parseId } from '@/infrastructure/http'

/** GET /api/scripts/{id} —— 稿件 + 台词 + 原文段落 + 音频片段 + 双音色分配 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const scriptId = parseId(id)
    const { script, lines, article } = getScriptDetail(scriptId)
    const paragraphs = paragraphRepo.listByArticle(article.id)
    const segments = audioRepo.listByScript(scriptId)
    return ok({
      script,
      lines,
      article,
      paragraphs,
      segments,
      voices: voices()
    })
  } catch (e) {
    return fail(e, 'api/scripts/[id]')
  }
}
