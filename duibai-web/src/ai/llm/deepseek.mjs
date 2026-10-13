/**
 * AI 能力层 · 大模型客户端 · 真实云端实现（DeepSeek）
 *
 * 实验4 阶段本层是确定性本地实现（local.ts），当时在它的注释里写过：
 *   "换真实模型的做法：新建 real.ts … 在这里按环境变量选择，应用服务层一行都不用改。"
 * 实验5 兑现这句话 —— 本文件就是那个实现，**上层没有改一行**。
 *
 * 本文件承担实验5 §2.1 的三件事：
 *   1. 组织输入（messages 分角色）并调用云端接口；
 *   2. **结构化输出校验**：要求 JSON 输出，解析后逐字段校验，不合规即判 MODEL_OUTPUT_INVALID；
 *   3. **调用失败处理**：把网络/超时/HTTP 错误分类，转成本项目既有错误码，
 *      而不是抛一个"fetch failed"给用户看。
 *
 * 为什么用 .mjs 而不是 .ts：本文件必须被三类消费者同时使用 ——
 * Next 服务端（/api/ask）、命令行脚本（rag-ask / exp5-compare）、测试脚本。
 * 本工程已有 `src/infrastructure/schema.mjs` 这一先例，沿用同一约定，
 * 避免为"同一份逻辑写两份实现"而引入漂移。
 */

import fs from 'node:fs'
import path from 'node:path'

export const DEEPSEEK_BASE = 'https://api.deepseek.com'
export const DEEPSEEK_MODEL = 'deepseek-chat'

/* ----------------------------------------------------------- 配置与密钥 */

/**
 * 取 API Key。优先级：进程环境变量 > 工程根目录的 .env.local。
 *
 * 为什么留 .env.local 这条：本工程的本地脚本（npm run …）默认不带 --env-file，
 * 让每个脚本各自处理会写四遍；统一在这里兜底更可靠。
 * .env.local 已在 .gitignore 里，不进版本库，也不会随报告提交。
 */
export function resolveApiKey(root) {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim()
  const cands = []
  if (root) cands.push(path.join(root, '.env.local'))
  cands.push(path.resolve(process.cwd(), '.env.local'))
  for (const f of cands) {
    try {
      if (!fs.existsSync(f)) continue
      const txt = fs.readFileSync(f, 'utf8')
      const m = txt.match(/^\s*DEEPSEEK_API_KEY\s*=\s*(.+?)\s*$/m)
      if (m) return m[1].replace(/^["']|["']$/g, '').trim()
    } catch {
      /* 读不到就继续找下一个 */
    }
  }
  return ''
}

/** 调用参数。集中一处，便于报告如实记录"主要参数"。 */
export const DEFAULT_PARAMS = {
  model: DEEPSEEK_MODEL,
  temperature: 0.3, // 问答任务要稳：偏高会引入原文没有的发挥
  top_p: 1,
  max_tokens: 1200,
  timeout_ms: 60000
}

/* ------------------------------------------------------------- 错误分类 */

export class ModelError extends Error {
  /**
   * @param {'MODEL_TIMEOUT'|'MODEL_CONNECTION'|'MODEL_HTTP_ERROR'|'MODEL_OUTPUT_INVALID'|'MODEL_NOT_CONFIGURED'} code
   */
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'ModelError'
    this.code = code
    Object.assign(this, extra)
  }
}

/** 是否值得重试：连接类与 5xx / 429 值得；超时与 4xx 不值得。 */
function retryable(e) {
  if (!(e instanceof ModelError)) return false
  if (e.code === 'MODEL_CONNECTION') return true
  if (e.code === 'MODEL_HTTP_ERROR' && (e.status >= 500 || e.status === 429)) return true
  return false
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------------------------------------------------------------- 主调用 */

/**
 * 一次 chat 调用（含重试）。
 *
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} messages
 * @param {object} [opts] 覆盖 DEFAULT_PARAMS 的字段；另支持
 *        - apiKey    显式指定密钥
 *        - root      工程根目录（用于定位 .env.local）
 *        - json      true 时要求模型输出 JSON 对象
 *        - retries   连接类失败的重试次数（默认 1）
 *        - quiet     true 时不打印重试日志
 *        - baseUrl   覆盖接口地址（仅用于**故障演练**：指向不可达地址以验证失败分类）
 * @returns {Promise<{ text: string, usage: object, ms: number, model: string,
 *                     attempts: number, request_id: string|null, params: object }>}
 */
export async function chat(messages, opts = {}) {
  const params = { ...DEFAULT_PARAMS, ...(opts.params || {}) }
  const apiKey = opts.apiKey || resolveApiKey(opts.root)
  if (!apiKey) {
    throw new ModelError(
      'MODEL_NOT_CONFIGURED',
      '未配置 DEEPSEEK_API_KEY（可放入环境变量，或写入工程根目录的 .env.local）'
    )
  }

  const body = {
    model: params.model,
    messages,
    temperature: params.temperature,
    top_p: params.top_p,
    max_tokens: params.max_tokens,
    stream: false
  }
  if (opts.json) body.response_format = { type: 'json_object' }

  const retries = opts.retries ?? 1
  let attempt = 0
  let lastErr = null

  while (attempt <= retries) {
    attempt++
    const t0 = Date.now()
    try {
      const res = await fetch(`${opts.baseUrl || DEEPSEEK_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(params.timeout_ms)
      })
      const ms = Date.now() - t0
      const raw = await res.text()

      if (!res.ok) {
        throw new ModelError(
          'MODEL_HTTP_ERROR',
          `接口返回 HTTP ${res.status}：${raw.slice(0, 200)}`,
          { status: res.status, ms }
        )
      }

      let payload
      try {
        payload = JSON.parse(raw)
      } catch {
        throw new ModelError('MODEL_OUTPUT_INVALID', '接口返回的不是合法 JSON', { ms, raw: raw.slice(0, 200) })
      }

      const choice = payload.choices?.[0]
      const text = choice?.message?.content
      if (typeof text !== 'string' || !text.trim()) {
        throw new ModelError('MODEL_OUTPUT_INVALID', '接口返回的内容为空', {
          ms,
          finish_reason: choice?.finish_reason || null
        })
      }

      return {
        text,
        usage: payload.usage || {},
        ms,
        model: payload.model || params.model,
        attempts: attempt,
        request_id: res.headers.get('x-request-id') || payload.id || null,
        params: { ...params, json: Boolean(opts.json) },
        finish_reason: choice?.finish_reason || null
      }
    } catch (e) {
      const ms = Date.now() - t0
      let err = e
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        err = new ModelError('MODEL_TIMEOUT', `模型响应超时（>${params.timeout_ms} ms）`, { ms })
      } else if (e?.name === 'TypeError' || e?.cause) {
        // undici 在连接失败/证书链异常时抛 TypeError，原因藏在 cause 里 —— 必须带出来，
        // 否则日志里只剩"fetch failed"，与本项目 §2.5 的排错要求相冲突。
        err = new ModelError('MODEL_CONNECTION', `无法连接模型服务：${e.message}`, {
          ms,
          cause: e?.cause?.code || e?.cause?.message || null
        })
      }
      lastErr = err
      if (attempt <= retries && retryable(err)) {
        if (!opts.quiet) {
          console.warn(`[deepseek] 第 ${attempt} 次调用失败（${err.code}），${400 * attempt} ms 后重试`)
        }
        await sleep(400 * attempt)
        continue
      }
      break
    }
  }
  throw lastErr
}

/* -------------------------------------------- 结构化输出：对话稿生成实现 */

/**
 * 把模型返回的 JSON 文本解析成台词数组，并逐条校验字段。
 *
 * 实验5 §2.1 要求的"结构化输出校验"就在这里：
 * 不信任模型一定会给对结构 —— 缺字段、类型不对、数组为空，都要能判出来，
 * 并且**给出具体是第几条哪里不对**，否则排错只能靠猜。
 */
export function parseDialogueJSON(text) {
  let obj
  try {
    obj = JSON.parse(text)
  } catch (e) {
    // 模型偶尔会裹一层 ```json 围栏，容错一次
    const m = String(text).match(/```(?:json)?\s*([\s\S]*?)```/)
    if (!m) throw new ModelError('MODEL_OUTPUT_INVALID', `返回内容不是合法 JSON：${e.message}`)
    try {
      obj = JSON.parse(m[1])
    } catch (e2) {
      throw new ModelError('MODEL_OUTPUT_INVALID', `返回内容不是合法 JSON：${e2.message}`)
    }
  }
  const arr = Array.isArray(obj) ? obj : obj.lines
  if (!Array.isArray(arr)) {
    throw new ModelError('MODEL_OUTPUT_INVALID', '返回 JSON 里没有 lines 数组', {
      got_keys: Object.keys(obj || {})
    })
  }
  const out = []
  arr.forEach((it, i) => {
    if (!it || typeof it !== 'object') {
      throw new ModelError('MODEL_OUTPUT_INVALID', `第 ${i + 1} 条不是对象`)
    }
    const text = it.text
    if (typeof text !== 'string' || !text.trim()) {
      throw new ModelError('MODEL_OUTPUT_INVALID', `第 ${i + 1} 条缺少 text 字段或内容为空`)
    }
    const speaker = String(it.speaker ?? '').toUpperCase()
    if (speaker !== 'A' && speaker !== 'B') {
      throw new ModelError('MODEL_OUTPUT_INVALID', `第 ${i + 1} 条 speaker 取值非法：${JSON.stringify(it.speaker)}`)
    }
    const sp = Number(it.source_paragraph ?? 0)
    if (!Number.isFinite(sp)) {
      throw new ModelError('MODEL_OUTPUT_INVALID', `第 ${i + 1} 条 source_paragraph 不是数字`)
    }
    out.push({ speaker, text: text.trim(), source_paragraph: Math.trunc(sp) })
  })
  if (!out.length) throw new ModelError('MODEL_OUTPUT_INVALID', 'lines 数组为空')
  return out
}

/**
 * 供对话生成链路使用的 LlmClient 实现。
 * 接口与 local.ts 完全一致（name / isMock / generate），因此可以整体替换。
 */
export const deepseekLlm = {
  name: `deepseek:${DEEPSEEK_MODEL}`,
  isMock: false,

  /**
   * @param {{title: string, tone: {code: string, name: string, description: string, prompt_template: string},
   *          paragraphs: Array<{seq: number, text: string}>, root?: string, params?: object}} input
   */
  async generate(input) {
    const { buildDialogueMessages } = await import('./prompt.mjs')
    const messages = buildDialogueMessages(input)
    const r = await chat(messages, { json: true, root: input.root, params: input.params })
    const lines = parseDialogueJSON(r.text)
    // 把调用元数据挂在数组上回传（非枚举属性，不破坏 LlmClient 的返回类型）
    Object.defineProperty(lines, 'meta', {
      value: { model: r.model, usage: r.usage, ms: r.ms, attempts: r.attempts, request_id: r.request_id },
      enumerable: false
    })
    return lines
  }
}
