import { fail, ok } from '@/infrastructure/http'
import { toneRepo } from '@/infrastructure/repository'

/** GET /api/tones —— 口吻列表（对应实验3 图7 的"选择口吻"单选组） */
export async function GET() {
  try {
    return ok({ tones: toneRepo.list() })
  } catch (e) {
    return fail(e, 'api/tones')
  }
}
