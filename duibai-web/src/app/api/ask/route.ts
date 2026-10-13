/**
 * POST /api/ask —— 知识问答接口（实验5 §2.6 要求的"页面、接口或命令行入口"之接口入口）
 *
 * 输入：{ question: string, mode?: 'rag'|'direct', version?: 'v1'|'v2', k?: number }
 * 输出：{ code: 0, data: { answer, citations, retrieval, context, judge, usage, total_ms } }
 * 失败：BAD_REQUEST(400) / MODEL_TIMEOUT(504) / MODEL_OUTPUT_INVALID(502) / INTERNAL_ERROR(500)
 *
 * 本接口不写数据库 —— 问答是无状态的，不需要落库；
 * 但整条链路（检索片段、上下文、回答、引用）都会写进运行日志，便于复查。
 */

import { answerQuestion, getKbSummary } from '@/application/askService'
import { fail, ok } from '@/infrastructure/http'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const data = await answerQuestion({
      question: body?.question,
      mode: body?.mode === 'direct' ? 'direct' : 'rag',
      version: body?.version === 'v1' ? 'v1' : 'v2',
      k: Number(body?.k) || 4
    })
    return ok(data)
  } catch (e) {
    return fail(e, 'api/ask')
  }
}

/** GET /api/ask —— 知识库概况（用了哪些资料、多少片段），供问答页顶部展示 */
export async function GET() {
  try {
    return ok(getKbSummary())
  } catch (e) {
    return fail(e, 'api/ask')
  }
}
