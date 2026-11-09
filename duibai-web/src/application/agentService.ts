/**
 * 应用服务层 · Agent 运行
 *
 * 职责：把 AI 能力层的 Harness 包装成应用服务 —— 加载运行参数、决定确认策略、
 * 把运行期错误翻译成业务错误码、并把整次运行写进日志。
 *
 * ⚠️ 关于"人工确认"在 Web 端的实际能力（局限，报告里要如实写）：
 *   HTTP 一次请求内没法停下来等用户点按钮。本接口的做法是**运行前统一授权**：
 *   前端先问"本次运行可能包含写操作，是否同意"，把结果作为 confirmPolicy 传进来。
 *   真正的"逐个操作确认"由命令行入口 scripts/agent-run.mjs 提供（交互式 y/N），
 *   Harness 本身的确认闸门在两条路径上完全一致（tests 里的 T6/T7/T8 验证的就是它）。
 *   要做到网页端逐次确认，需要把 Harness 改成可挂起/可恢复的两段式接口 —— 已列入改进计划。
 */

import fs from 'node:fs'
import path from 'node:path'

import { runAgent } from '@/ai/agent/harness.mjs'
import { makeQualityTask, recomputeFacts } from '@/ai/agent/qualityTask.mjs'
import { openReadonly, openReadWrite } from '@/ai/agent/db.mjs'
import { describeTools } from '@/ai/agent/tools.mjs'
import { chat } from '@/ai/llm/deepseek.mjs'
import { AppError } from '@/domain/errors'
import { logger } from '@/infrastructure/logger'

const DB_FILE = () => path.join(process.cwd(), 'data', 'duibai.db')
const REPORTS = () => path.join(process.cwd(), 'data', 'reports')
const RUNS = () => path.join(process.cwd(), 'data', 'agent-runs')

export interface AgentRunSummary {
  task_id: string
  status: string
  steps_used: number
  max_steps: number
  tool_calls: number
  duration_ms: number
  usage: { prompt: number; completion: number; total: number }
  answer: string
  errors: { code: string; tool?: string; note?: string }[]
}

/** 工具清单（给页面展示用，不涉及运行） */
export function getAgentMeta() {
  return { tools: describeTools(), limits: { max_steps_default: 8, total_ms_default: 180000 } }
}

/** 最近若干次运行（读 data/agent-runs/*.json 的摘要部分） */
export function listRuns(limit = 10) {
  const dir = RUNS()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
        return { ...j.summary, file: f }
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => String(b.task_id).localeCompare(String(a.task_id)))
    .slice(0, limit)
}

export async function runQualityAgent(input: {
  scriptId: number
  confirmPolicy?: 'approve' | 'reject'
  maxSteps?: number
  totalMs?: number
}) {
  const scriptId = Number(input.scriptId)
  if (!Number.isInteger(scriptId) || scriptId <= 0) {
    throw new AppError('BAD_REQUEST', 'scriptId 必须是正整数', '请从稿件列表里选一份')
  }
  const policy = input.confirmPolicy === 'reject' ? 'reject' : 'approve'

  const baseline = recomputeFacts({ dbFile: DB_FILE(), scriptId })
  if (!baseline.ok) {
    throw new AppError('NOT_FOUND', baseline.reason || `稿件 #${scriptId} 不存在`, '请先回到首页生成一份稿件')
  }

  try {
    const r: any = await runAgent({
      task: makeQualityTask({ scriptId, baseline }),
      root: process.cwd(),
      dbFile: DB_FILE(),
      reportsDir: REPORTS(),
      openReadonly,
      openReadWrite,
      chat,
      // 网页端为"运行前统一授权"：同意则本轮所有写操作放行，拒绝则一律不执行
      confirm: async () => policy,
      limits: {
        maxSteps: Math.min(Math.max(Number(input.maxSteps) || 8, 1), 12),
        totalMs: Math.min(Math.max(Number(input.totalMs) || 180000, 10000), 300000)
      },
      verbose: false
    })

    logger.info('agent', 'Agent 运行结束', {
      task_id: r.task_id,
      script_id: scriptId,
      status: r.status,
      steps: r.steps_used,
      tool_calls: r.tool_calls,
      duration_ms: r.duration_ms,
      tokens: r.usage?.total ?? null,
      confirm_policy: policy
    })

    return {
      task_id: r.task_id,
      status: r.status,
      steps_used: r.steps_used,
      max_steps: r.max_steps,
      tool_calls: r.tool_calls,
      duration_ms: r.duration_ms,
      usage: r.usage,
      answer: r.answer,
      baseline: {
        total_lines: baseline.total_lines,
        readable: baseline.counts.readable,
        source: baseline.counts.source,
        pending_confirm: baseline.stats.pending_confirm
      },
      check: (() => {
        const e = (r.events || []).find((x: any) => x.event === 'success_check')
        return e ? { ok: e.ok, reasons: e.reasons || [], details: e.details || {} } : null
      })(),
      // 只把关键事件回给前端（完整记录在 data/agent-runs/<task_id>.json）
      events: (r.events || [])
        .filter((e: any) => ['model_call', 'confirm_required', 'confirm_approved', 'confirm_rejected', 'tool_result', 'tool_error', 'tool_bad_args', 'tool_denied', 'success_check', 'stop'].includes(e.event))
        .map((e: any) => ({ ts: e.ts, event: e.event, step: e.step, tool: e.tool, error_code: e.error_code, ok: e.ok, note: e.note, description: e.description })),
      log_file: r.log_file
    }
  } catch (e: any) {
    logger.error('agent', 'Agent 运行失败', { script_id: scriptId, err: e?.message })
    if (e?.code === 'MODEL_NOT_CONFIGURED') {
      throw new AppError('INTERNAL_ERROR', '未配置 DEEPSEEK_API_KEY', '请在 duibai-web/.env.local 中填写后重启服务')
    }
    throw new AppError('INTERNAL_ERROR', `Agent 运行异常：${e?.message || e}`, '请查看服务端日志与 data/agent-runs/')
  }
}
