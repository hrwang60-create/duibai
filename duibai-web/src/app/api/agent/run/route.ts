/**
 * /api/agent/run —— Agent 运行接口（实验6 §2.6 的"仓库中保存运行说明"之外的可视入口）
 *
 * POST { scriptId, confirmPolicy: 'approve'|'reject', maxSteps?, totalMs? }
 *   → { task_id, status, steps_used, ..., events[], check, log_file }
 * GET  → { tools: [...], runs: [最近若干次运行的摘要] }
 *
 * 失败返回沿用实验3 表12 的错误形状；运行期状态（completed / step_limit / rejected …）
 * 放在 data.status 里，不走 HTTP 错误码 —— 因为"任务没跑完"不是接口失败。
 */

import { getAgentMeta, listRuns, runQualityAgent } from '@/application/agentService'
import { fail, ok } from '@/infrastructure/http'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const data = await runQualityAgent({
      scriptId: Number(body?.scriptId),
      confirmPolicy: body?.confirmPolicy === 'reject' ? 'reject' : 'approve',
      maxSteps: Number(body?.maxSteps) || 8,
      totalMs: Number(body?.totalMs) || 180000
    })
    return ok(data)
  } catch (e) {
    return fail(e, 'api/agent/run')
  }
}

export async function GET() {
  try {
    return ok({ ...getAgentMeta(), runs: listRuns(8) })
  } catch (e) {
    return fail(e, 'api/agent/run')
  }
}
