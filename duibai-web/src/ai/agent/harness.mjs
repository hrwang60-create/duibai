/**
 * AI 能力层 · 运行时 Harness（实验6 §2.4 的核心）
 *
 * 这个文件只做一件事：**把模型和工具围起来跑**。它不关心"任务是什么"，
 * 任务由外部传入（目标、成功标准、复核函数）。各环节的归属：
 *
 *   ┌ 任务输入   task.goal / task.successCriteria / task.check()
 *   ├ 上下文     buildMessages() / appendAssistant() / appendToolResult() / clip()
 *   ├ 执行       dispatch()：名字白名单 → 参数校验 → 人工确认 → 超时执行
 *   ├ 结果检查   task.check()：程序自己重算一遍，不看模型怎么说
 *   ├ 停止控制   shouldStop()：步数 / 总时限 / 重试上限 / 确认被拒
 *   └ 日志       logEvent() / writeRunSummary()：逐事件 JSONL + 每次运行一份摘要
 *
 * **一步怎么计数**：一步 = 一次模型调用。该轮里模型一次请求多个工具，
 * 都算在这一步内（工具执行不单独计步）。这样步数上限约束的是"模型能想几轮"，
 * 而不是"能调几次工具"——后者由每个工具的调用次数与重试上限分别约束。
 *
 * **关键限制都由程序执行，不是写在提示词里**（§2.4 明确要求）：
 *   - 工具名必须在允许清单里：不在就拒绝，绝不 eval / 拼 SQL；
 *   - 参数必须过 schema：不过就回传错误让模型改，改不好就停；
 *   - 写操作先确认：确认前**不打开可写连接**；
 *   - 步数、时限、重试由循环自己计数，模型无从绕过。
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { AGENT_ERROR, AgentError, isAgentError } from './errors.mjs'
import { describeErrors, validateArgs } from './validate.mjs'
import { TOOL_MAP, toModelTools } from './tools.mjs'

export const DEFAULT_LIMITS = {
  /** 最多几步（一步 = 一次模型调用） */
  maxSteps: 8,
  /** 单次模型调用超时 */
  modelTimeoutMs: 60000,
  /** 单个工具最长等待 */
  toolTimeoutMs: 10000,
  /** 整个任务的总时限 */
  totalMs: 180000,
  /** 同一个工具连续失败几次就终止 */
  maxToolRetries: 2,
  /** 单条工具结果回传进上下文的最大字符数（超出截断并注明） */
  maxResultChars: 4000
}

const SYSTEM_PROMPT = [
  '你是「对白」项目的质检 Agent，可以调用工具来查数据、跑规则检查、写报告。',
  '',
  '工作方式：',
  '1. 需要事实时必须调用工具获取，不要凭猜测填写数字；',
  '2. 每个数字都要来自工具返回的结果；',
  '3. 任务完成时，给出简短的最终回答（不要粘贴整篇报告）。',
  '',
  '约束：',
  '- 只能调用给定的工具；工具名与参数必须严格符合定义；',
  '- 写操作会请求人工确认，被拒绝时不得改用其他方式绕过；',
  '- 工具返回错误时，读懂错误信息再决定是改参数重试还是换一种做法；同一个错误不要重复三次。'
].join('\n')

/* ─────────────────────────── 工具函数 ─────────────────────────── */

const nowIso = () => new Date().toISOString()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 生成任务编号：时间 + 短随机，日志里能直接看出是哪一次运行 */
export function newTaskId(prefix = 'T') {
  const d = new Date()
  const p = (n, w = 2) => String(n).padStart(w, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `${prefix}${stamp}-${crypto.randomBytes(2).toString('hex')}`
}

/**
 * 参数摘要：进日志用。
 * 长文本只留长度与前 40 字，避免把整篇报告写进日志；
 * 形如 sk-xxxx 的密钥一律打码（§2.5 要求密钥与个人信息遮挡）。
 */
export function maskArgs(args) {
  const out = {}
  for (const [k, v] of Object.entries(args || {})) {
    if (typeof v === 'string') {
      const masked = v.replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-***')
      out[k] = masked.length > 40 ? `${masked.slice(0, 40)}…(共 ${masked.length} 字)` : masked
    } else if (Array.isArray(v)) {
      out[k] = v.length > 8 ? [...v.slice(0, 8), `…共 ${v.length} 项`] : v
    } else {
      out[k] = v
    }
  }
  return out
}

/** 工具结果进上下文前截断（否则一次 get_script 200 条就能把上下文塞满） */
function clip(text, max) {
  const s = String(text)
  if (s.length <= max) return s
  return `${s.slice(0, max)}\n…（结果过长，已截断；原长 ${s.length} 字符。需要更细的数据请减小 limit 或分次查询）`
}

/** 带超时的执行。注意：超时只是**停止等待**，并不保证底层已取消（见 §2.5 的说明） */
async function withTimeout(promise, ms, onTimeout) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      // onTimeout 会 throw，必须在这里接住并转成 reject ——
      // 直接在 setTimeout 回调里 throw 是**异步抛错**，不会被下面的 await 捕获，
      // 会变成进程级未捕获异常（第一次跑 T8 时就是这样把进程打崩的）。
      let err
      try {
        onTimeout()
        err = new Error(`操作超时（>${ms} ms）`)
      } catch (e) {
        err = e
      }
      reject(err)
    }, ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/* ─────────────────────────── Harness 主体 ─────────────────────────── */

/**
 * @param {object} input
 * @param {object} input.task           { id, title, goal, successCriteria[], check(ctx) }
 * @param {string} input.root           工程根目录（duibai-web）
 * @param {string} input.dbFile         SQLite 文件
 * @param {string} input.reportsDir     报告写入目录（工具白名单目录）
 * @param {Function} input.openReadonly 打开只读连接（便于测试注入）
 * @param {Function} input.openReadWrite
 * @param {Function} input.chat         模型调用函数（用 deepseek.mjs 的 chat）
 * @param {Function} [input.confirm]    人工确认回调：async ({tool, args, description}) => 'approve'|'reject'
 * @param {number}  [input.confirmTimeoutMs] 等待确认的超时（超时视为不执行）
 * @param {object}  [input.limits]
 * @param {string}  [input.logDir]
 * @param {string}  [input.taskId]
 * @param {boolean} [input.verbose]   为真时把事件逐条打到控制台（命令行用）
 */
export async function runAgent(input) {
  const t0 = Date.now()
  const taskId = input.taskId || newTaskId()
  const limits = { ...DEFAULT_LIMITS, ...(input.limits || {}) }
  const task = input.task
  const root = input.root
  const reportsDir = input.reportsDir
  const confirmTimeoutMs = input.confirmTimeoutMs ?? 30000
  const logDir = input.logDir || path.join(root, 'data', 'logs')
  const runDir = path.join(root, 'data', 'agent-runs')
  fs.mkdirSync(logDir, { recursive: true })
  fs.mkdirSync(runDir, { recursive: true })

  const events = []
  const usage = { prompt: 0, completion: 0, total: 0 }
  const logFile = path.join(logDir, `agent-${nowIso().slice(0, 10)}.jsonl`)

  const logEvent = (event, data = {}) => {
    const rec = { ts: nowIso(), task_id: taskId, event, ...data }
    events.push(rec)
    try {
      fs.appendFileSync(logFile, JSON.stringify(rec) + '\n', 'utf8')
    } catch {
      /* 日志写不进去不能影响主流程 */
    }
    if (input.verbose) {
      const bits = [event]
      if (data.step) bits.push(`step=${data.step}`)
      if (data.tool) bits.push(data.tool)
      if (data.status) bits.push(`status=${data.status}`)
      if (data.error_code) bits.push(`error=${data.error_code}`)
      if (data.note) bits.push(data.note)
      console.log('  · ' + bits.join('  '))
    }
    return rec
  }

  /* —— ① 任务输入 —— */
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `【任务】${task.title}`,
        '',
        task.goal,
        '',
        '【成功标准】',
        ...task.successCriteria.map((s, i) => `${i + 1}. ${s}`),
        '',
        '请开始。先看数据，再决定怎么做；做完给出简短最终回答。'
      ].join('\n')
    }
  ]

  logEvent('task_start', {
    task: task.title,
    goal: task.goal,
    success_criteria: task.successCriteria,
    limits,
    tools: toModelTools().map((t) => t.function.name)
  })

  const readDb = input.openReadonly(input.dbFile)
  let writeDb = null
  const ctx = { db: readDb, reportsDir, root, taskId }
  if (readDb.__readonlyFallback) logEvent('warn', { note: '只读连接降级：当前 SQLite 绑定不支持 readOnly 选项' })

  let status = 'running'
  let answer = ''
  let step = 0
  let toolCallCount = 0
  const failureStreak = new Map() // 工具名 → 连续失败次数
  const toolResults = []          // 成功执行的关键结果（供复核用）

  const finish = (st, note) => {
    status = st
    if (note) logEvent('stop', { status: st, note })
    else logEvent('stop', { status: st })
  }

  try {
    while (step < limits.maxSteps) {
      /* —— ② 上下文：每轮都从当前 messages 重新发起 —— */
      if (Date.now() - t0 > limits.totalMs) {
        finish('deadline_exceeded', `总运行时限 ${limits.totalMs} ms 已到`)
        break
      }

      step++
      const tModel = Date.now()
      let res
      try {
        res = await withTimeout(
          input.chat(messages, { root, tools: toModelTools(), quiet: true, params: { timeout_ms: limits.modelTimeoutMs } }),
          limits.modelTimeoutMs + 5000,
          () => {
            const e = new AgentError(AGENT_ERROR.MODEL_FAILED, `模型调用超时（>${limits.modelTimeoutMs} ms）`)
            throw e
          }
        )
      } catch (e) {
        const code = isAgentError(e) ? e.code : e?.code === 'MODEL_TIMEOUT' ? AGENT_ERROR.MODEL_FAILED : AGENT_ERROR.MODEL_FAILED
        logEvent('model_error', { step, error_code: code, note: e?.message })
        finish('model_failed', `模型调用失败：${e?.message || e}`)
        break
      }

      usage.prompt += res.usage?.prompt_tokens || 0
      usage.completion += res.usage?.completion_tokens || 0
      usage.total += res.usage?.total_tokens || 0
      logEvent('model_call', {
        step,
        ms: Date.now() - tModel,
        tokens: res.usage?.total_tokens ?? null,
        finish_reason: res.finish_reason,
        tool_calls: (res.tool_calls || []).map((c) => c.function?.name)
      })

      /* —— 模型给出最终回答 —— */
      if (!res.tool_calls || res.tool_calls.length === 0) {
        answer = String(res.text || '').trim()
        logEvent('final_answer', { step, chars: answer.length, excerpt: answer.slice(0, 200) })
        break
      }

      /* —— 模型请求工具：把这些请求按接口要求放回上下文 —— */
      messages.push({
        role: 'assistant',
        content: res.text || '',
        tool_calls: res.tool_calls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.function.name, arguments: c.function.arguments }
        }))
      })

      for (const call of res.tool_calls) {
        toolCallCount++
        const name = call.function?.name
        const rawArgs = call.function?.arguments ?? '{}'
        const reply = (obj) => messages.push({ role: 'tool', tool_call_id: call.id, content: clip(JSON.stringify(obj), limits.maxResultChars) })

        /* ① 名字白名单 */
        const tool = TOOL_MAP.get(name)
        if (!tool || (task.allowedTools && !task.allowedTools.includes(name))) {
          const err = new AgentError(AGENT_ERROR.TOOL_NOT_ALLOWED, `工具「${name}」不在允许清单里，可用的只有：${[...TOOL_MAP.keys()].join('、')}`)
          logEvent('tool_denied', { step, tool: name, error_code: err.code, note: err.message })
          reply({ ok: false, error: err.code, message: err.message })
          continue
        }

        /* ② arguments 必须是合法 JSON */
        let args
        try {
          args = rawArgs.trim() ? JSON.parse(rawArgs) : {}
        } catch (e) {
          const err = new AgentError(AGENT_ERROR.ARGS_NOT_JSON, `arguments 不是合法 JSON：${e.message}。请传一个 JSON 对象，例如 {"script_id": 1}`)
          logEvent('tool_bad_args', { step, tool: name, error_code: err.code, note: err.message })
          reply({ ok: false, error: err.code, message: err.message, received: String(rawArgs).slice(0, 160) })
          continue
        }

        /* ③ 参数 schema 校验 */
        const v = validateArgs(tool.parameters, args)
        if (!v.ok) {
          const err = new AgentError(AGENT_ERROR.PARAM_INVALID, `参数不合法 —— ${describeErrors(v.errors)}`)
          logEvent('tool_bad_args', {
            step,
            tool: name,
            error_code: err.code,
            args: maskArgs(args),
            note: describeErrors(v.errors)
          })
          reply({ ok: false, error: err.code, message: err.message, schema: tool.parameters })
          continue
        }

        /* ④ 人工确认（写操作） */
        if (tool.requiresConfirmation) {
          const description = tool.describe ? tool.describe(args) : `${name}(${rawArgs})`
          logEvent('confirm_required', { step, tool: name, args: maskArgs(args), description })
          let decision = 'reject'
          try {
            decision = await withTimeout(
              Promise.resolve(
                input.confirm
                  ? input.confirm({ tool: name, args, description, taskId, step })
                  : 'reject'
              ),
              confirmTimeoutMs,
              () => {
                throw new AgentError(AGENT_ERROR.CONFIRM_TIMEOUT, `等待确认超过 ${confirmTimeoutMs} ms，按不执行处理`)
              }
            )
          } catch (e) {
            const err = isAgentError(e) ? e : new AgentError(AGENT_ERROR.CONFIRM_TIMEOUT, String(e?.message || e))
            logEvent('confirm_timeout', { step, tool: name, error_code: err.code, note: err.message })
            finish('confirm_timeout', `${name} 的确认等待超时，未执行`)
            break
          }

          if (String(decision) !== 'approve') {
            logEvent('confirm_rejected', { step, tool: name, note: String(decision) })
            finish('rejected', `用户拒绝执行 ${name}`)
            break
          }
          logEvent('confirm_approved', { step, tool: name })

          // 确认通过后才打开可写连接 —— 权限是"没给"，不是"答应了不用"
          if (tool.writes === 'db' && !writeDb) {
            writeDb = input.openReadWrite(input.dbFile)
            ctx.writeDb = writeDb
          }
        }

        /* ⑤ 执行（带超时） */
        const tTool = Date.now()
        let result
        try {
          result = await withTimeout(
            Promise.resolve(tool.handler(args, ctx)),
            tool.timeoutMs || limits.toolTimeoutMs,
            () => new AgentError(AGENT_ERROR.TOOL_TIMEOUT, `工具执行超时（>${tool.timeoutMs || limits.toolTimeoutMs} ms）`)
          )
          failureStreak.set(name, 0)
          toolResults.push({ tool: name, args: maskArgs(args), result })
          logEvent('tool_result', {
            step,
            tool: name,
            args: maskArgs(args),
            ms: Date.now() - tTool,
            writes: tool.writes,
            ok: true,
            // 结果摘要：只记结构与关键数字，别把整份数据写进日志
            digest: digestResult(result)
          })
          reply({ ok: true, tool: name, result })
        } catch (e) {
          const code = isAgentError(e)
            ? e.code
            : e?.toolError === 'SCRIPT_NOT_FOUND' || e?.toolError === 'ARTICLE_NOT_FOUND' || e?.toolError === 'LINE_NOT_FOUND'
              ? 'NOT_FOUND'
              : e?.toolError === 'PATH_NOT_ALLOWED'
                ? 'PATH_NOT_ALLOWED'
                : AGENT_ERROR.TOOL_FAILED
          const streak = (failureStreak.get(name) || 0) + 1
          failureStreak.set(name, streak)
          logEvent('tool_error', {
            step,
            tool: name,
            error_code: code,
            args: maskArgs(args),
            ms: Date.now() - tTool,
            retry: streak,
            note: e?.message || String(e)
          })
          reply({
            ok: false,
            error: code,
            message: e?.message || String(e),
            hint: e?.hint || undefined,
            retry_count: streak
          })

          if (streak > limits.maxToolRetries) {
            finish('tool_retry_exceeded', `${name} 连续失败 ${streak} 次，超过上限 ${limits.maxToolRetries}`)
            break
          }
        }
        if (status !== 'running') break
      }
      if (status !== 'running') break
    }

    if (status === 'running') {
      if (step >= limits.maxSteps && !answer) {
        finish('step_limit', `已达到最大步数 ${limits.maxSteps}，任务未完成`)
      } else if (answer) {
        /* —— ④ 结果检查：程序自己核对，不信模型的说法 —— */
        const check = await Promise.resolve(
          task.check({ answer, events, toolResults, scriptId: task.scriptId, reportsDir, root, dbFile: input.dbFile })
        )
        logEvent('success_check', { ok: check.ok, reasons: check.reasons, details: check.details })
        if (check.ok) finish('completed', '成功标准全部通过')
        else finish('failed_success_check', check.reasons.join('；'))
      }
    }
  } finally {
    try {
      readDb.close()
    } catch {
      /* ignore */
    }
    try {
      writeDb?.close()
    } catch {
      /* ignore */
    }
  }

  const summary = {
    task_id: taskId,
    task: task.title,
    status,
    steps_used: step,
    max_steps: limits.maxSteps,
    tool_calls: toolCallCount,
    duration_ms: Date.now() - t0,
    usage,
    answer,
    events_count: events.length,
    errors: events.filter((e) => e.error_code).map((e) => ({ event: e.event, tool: e.tool, code: e.error_code, note: e.note }))
  }
  fs.writeFileSync(path.join(runDir, `${taskId}.json`), JSON.stringify({ summary, events }, null, 2), 'utf8')
  logEvent('task_end', { status, steps: step, duration_ms: summary.duration_ms, tool_calls: toolCallCount })
  fs.writeFileSync(path.join(runDir, `${taskId}.json`), JSON.stringify({ summary, events }, null, 2), 'utf8')

  return { ...summary, events, log_file: path.relative(root, logFile).replace(/\\/g, '/') }
}

/** 结果摘要：只留"形状 + 关键数字"，供日志审阅 */
function digestResult(r) {
  if (!r || typeof r !== 'object') return r
  if (Array.isArray(r)) return { array: r.length }
  const keys = Object.keys(r)
  const d = { keys }
  for (const k of ['count', 'total', 'issue_total', 'path', 'bytes', 'already', 'line_id', 'script_id', 'line_count_actual']) {
    if (r[k] !== undefined) d[k] = r[k]
  }
  if (r.counts) d.counts = r.counts
  if (r.stats) d.stats = { total_lines: r.stats.total_lines, pending_confirm: r.stats.pending_confirm, source_coverage: r.stats.source_coverage }
  if (Array.isArray(r.lines)) d.lines = r.lines.length
  if (Array.isArray(r.issues)) d.issues = r.issues.length
  return d
}

export { sleep }
