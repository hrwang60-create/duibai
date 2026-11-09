'use client'

/**
 * 表现层 · Agent 运行观测台（实验6 §2.5「可观测性」的界面形态）
 *
 * 这一页不是"聊天窗口"，而是**运行记录查看器**：
 * 工具清单与权限、本次运行的步数与耗时、每一步调了什么工具、
 * 成功标准由程序复核得到的结论，全部都摊开显示。
 *
 * 写操作的确认采用"运行前统一授权"（见 application/agentService.ts 里的说明）：
 * 单次 HTTP 请求内无法等用户点按钮，逐次确认在命令行入口提供。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface ToolRow {
  name: string
  writes: string
  requiresConfirmation: boolean
  timeoutMs: number
  idempotent: boolean
  idempotencyNote: string
}
interface RunRow {
  task_id: string
  status: string
  steps_used: number
  max_steps: number
  tool_calls: number
  duration_ms: number
  usage?: { total?: number }
}
interface Ev {
  ts: string
  event: string
  step?: number
  tool?: string
  error_code?: string
  ok?: boolean
  note?: string
  description?: string
}
interface RunResult {
  task_id: string
  status: string
  steps_used: number
  max_steps: number
  tool_calls: number
  duration_ms: number
  usage: { prompt: number; completion: number; total: number }
  answer: string
  baseline: { total_lines: number; readable: number; source: number; pending_confirm: number }
  check: { ok: boolean; reasons: string[]; details: any } | null
  events: Ev[]
  log_file: string
}

const STATUS_TEXT: Record<string, string> = {
  completed: '完成',
  failed_success_check: '未通过成功复核',
  rejected: '用户拒绝，已终止',
  confirm_timeout: '确认超时，未执行',
  step_limit: '达到步数上限',
  deadline_exceeded: '超过总时限',
  tool_retry_exceeded: '工具连续失败超限',
  model_failed: '模型调用失败'
}

const EV_TEXT: Record<string, string> = {
  model_call: '模型调用',
  tool_result: '工具执行成功',
  tool_error: '工具报错',
  tool_bad_args: '参数被拦',
  tool_denied: '工具被拒（白名单外）',
  confirm_required: '请求人工确认',
  confirm_approved: '已同意',
  confirm_rejected: '已拒绝',
  success_check: '成功标准复核',
  stop: '停止'
}

export default function AgentPage() {
  const [tools, setTools] = useState<ToolRow[]>([])
  const [runs, setRuns] = useState<RunRow[]>([])
  const [scriptId, setScriptId] = useState(1)
  const [policy, setPolicy] = useState<'approve' | 'reject'>('approve')
  const [maxSteps, setMaxSteps] = useState(8)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<RunResult | null>(null)
  const [err, setErr] = useState<{ error: string; reason: string; suggestion: string } | null>(null)

  const load = useCallback(() => {
    fetch('/api/agent/run', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        setTools(j.data?.tools || [])
        setRuns(j.data?.runs || [])
      })
      .catch(() => {
        setTools([])
        setRuns([])
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /**
   * 支持 `?script=1&policy=approve&auto=1`：把一次运行变成可分享的链接，也便于自动截图取证。
   * 用 ref 守卫，避免 React 严格模式下重复触发（每次运行都会真的调模型、真的写数据）。
   */
  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current) return
    const sp = new URLSearchParams(window.location.search)
    const s = Number(sp.get('script') || 0)
    if (s > 0) setScriptId(s)
    if (sp.get('policy') === 'reject') setPolicy('reject')
    if (sp.get('auto') === '1' && s > 0) {
      autoRan.current = true
      void runWith(s, sp.get('policy') === 'reject' ? 'reject' : 'approve')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = useCallback(async () => {
    await runWith(scriptId, policy)
  }, [scriptId, policy])

  const runWith = useCallback(
    async (sid: number, pol: 'approve' | 'reject') => {
      setBusy(true)
      setErr(null)
      setRes(null)
      try {
        const r = await fetch('/api/agent/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptId: sid, confirmPolicy: pol, maxSteps })
        })
        const j = await r.json()
        if (!r.ok) {
          setErr(j)
          return
        }
        setRes(j.data)
        load()
      } catch (e) {
        setErr({ error: 'INTERNAL_ERROR', reason: (e as Error).message, suggestion: '请查看服务端日志' })
      } finally {
        setBusy(false)
      }
    },
    [maxSteps, load]
  )

  return (
    <div className="wrap">
      <div className="topbar">
        <b>「对白」· 质检 Agent</b>
        <span className="hint" style={{ marginLeft: 12 }}>
          工具调用 · Agent 循环 · Harness 运行记录（实验6）
        </span>
        <a className="linkbtn" href="/" style={{ marginLeft: 'auto' }}>
          返回首页
        </a>
        <a className="linkbtn" href="/ask" style={{ marginLeft: 12 }}>
          知识问答
        </a>
      </div>

      <div className="hero">
        <h1>让 Agent 去查数据、跑规则、写报告</h1>
        <p className="hint">
          模型只负责"下一步做什么"，能不能调、参数对不对、要不要人同意，全部由程序判定。
          下面是这一次运行的真实记录。
        </p>
      </div>

      <div className="panel">
        <div className="sec-head">工具清单（允许调用的全部动作，除此之外一律拒绝）</div>
        <div className="kv" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {tools.map((t) => (
            <div key={t.name} className="row">
              <span className="tag">{t.name}</span>
              <span className="mono">
                写={t.writes} · 需确认={t.requiresConfirmation ? '是' : '否'} · 超时 {t.timeoutMs} ms · 幂等=
                {t.idempotent ? '是' : '否'}
              </span>
              <div className="hint" style={{ width: '100%' }}>
                {t.idempotencyNote}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="sec-head">运行</div>
        <div className="field">
          <label className="hint">稿件编号</label>
          <input
            type="number"
            value={scriptId}
            min={1}
            onChange={(e) => setScriptId(Number(e.target.value))}
            style={{ width: 120 }}
          />
          <label className="hint" style={{ marginLeft: 16 }}>
            最大步数
          </label>
          <input
            type="number"
            value={maxSteps}
            min={1}
            max={12}
            onChange={(e) => setMaxSteps(Number(e.target.value))}
            style={{ width: 90 }}
          />
        </div>
        <div className="tones">
          <button className={`tone ${policy === 'approve' ? 'on' : ''}`} onClick={() => setPolicy('approve')}>
            写操作：同意（会改数据）
          </button>
          <button className={`tone ${policy === 'reject' ? 'on' : ''}`} onClick={() => setPolicy('reject')}>
            写操作：拒绝（一律不执行）
          </button>
        </div>
        <button className="btn" disabled={busy} onClick={run}>
          {busy ? '运行中…（真实模型，约 15 秒）' : '开始运行'}
        </button>
        <div className="hint" style={{ marginTop: 8 }}>
          说明：网页端为**运行前统一授权**（单次请求内无法等待点击）；逐次确认请用命令行
          <span className="mono"> npm run agent -- --script {scriptId} </span>
        </div>
      </div>

      {err && (
        <div className="panel">
          <div className="errbox">
            <b>{err.error}</b>
            <div>{err.reason}</div>
            {err.suggestion && <div className="hint">{err.suggestion}</div>}
          </div>
        </div>
      )}

      {res && (
        <>
          <div className="panel">
            <div className="sec-head">
              运行结果（{STATUS_TEXT[res.status] || res.status}；{res.duration_ms} ms；{res.usage?.total ?? '?'} tokens）
            </div>
            <div className="kv" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div className="row">
                <span className="tag">任务编号</span>
                <span className="mono">{res.task_id}</span>
              </div>
              <div className="row">
                <span className="tag">步数</span>
                <span className="mono">
                  {res.steps_used} / {res.max_steps}（一步 = 一次模型调用）
                </span>
                <span className="tag">工具调用</span>
                <span className="mono">{res.tool_calls} 次</span>
              </div>
              <div className="row">
                <span className="tag">基线</span>
                <span className="mono">
                  总句数 {res.baseline.total_lines} · 仅可阅读 {res.baseline.readable} · 出处 {res.baseline.source} · 待确认{' '}
                  {res.baseline.pending_confirm}
                </span>
              </div>
            </div>

            {res.check && (
              <div
                className="errbox"
                style={{
                  background: res.check.ok ? 'var(--ok)' : 'var(--accent-soft)',
                  borderColor: res.check.ok ? 'var(--ok)' : 'var(--accent)',
                  color: res.check.ok ? '#fff' : 'var(--ink)'
                }}
              >
                <b>{res.check.ok ? '成功标准：程序复核通过' : '成功标准：未通过'}</b>
                {!res.check.ok && <div>{(res.check.reasons || []).join('；')}</div>}
                {res.check.details?.numbers_found && (
                  <div className="mono" style={{ marginTop: 6, fontSize: 12.5 }}>
                    报告中的数字 {JSON.stringify(res.check.details.numbers_found)} / 程序重算{' '}
                    {JSON.stringify(res.check.details.expected)}
                  </div>
                )}
              </div>
            )}

            {res.answer && (
              <div className="script" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
                {res.answer}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="sec-head">执行时间线（{res.events.length} 条；完整记录见 {res.log_file}）</div>
            {res.events.map((e, i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="tag">{e.step ? `第 ${e.step} 步` : '—'}</span>
                <span className="mono" style={{ minWidth: 150 }}>
                  {EV_TEXT[e.event] || e.event}
                </span>
                <span className="mono" style={{ minWidth: 150 }}>
                  {e.tool || ''}
                </span>
                <span className="hint" style={{ flex: 1 }}>
                  {e.error_code ? `[${e.error_code}] ` : ''}
                  {e.note || e.description || (e.ok === true ? 'ok' : '')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="panel">
        <div className="sec-head">最近运行（每次运行都有独立任务编号与日志）</div>
        <div className="kv" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {runs.length === 0 && <div className="hint">还没有运行记录</div>}
          {runs.map((r) => (
            <div key={r.task_id} className="row">
              <span className="tag">{STATUS_TEXT[r.status] || r.status}</span>
              <span className="mono">{r.task_id}</span>
              <span className="hint">
                {r.steps_used}/{r.max_steps} 步 · {r.tool_calls} 次工具 · {r.duration_ms} ms · {r.usage?.total ?? '?'} tokens
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
