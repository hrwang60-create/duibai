/**
 * AI 能力层 · Agent 错误码
 *
 * 与领域层 errors.ts 分开是有意的：那边是"给最终用户看的业务错误"，
 * 这边是"给 Harness 与日志用的运行期错误"。两者的处理方式完全不同 ——
 * 业务错误直接返回给前端；运行期错误要先**回传给模型**让它自我修正，
 * 修正不了才终止任务。混成一套会让"该重试的"和"该报错的"分不清。
 */

export const AGENT_ERROR = {
  /** 模型请求了不在允许清单里的工具（§2.2 的核心约束） */
  TOOL_NOT_ALLOWED: 'TOOL_NOT_ALLOWED',
  /** 参数不合法（缺字段、类型不对、超范围、枚举外） */
  PARAM_INVALID: 'PARAM_INVALID',
  /** 模型给的 arguments 不是合法 JSON */
  ARGS_NOT_JSON: 'ARGS_NOT_JSON',
  /** 需要人工确认但用户拒绝 */
  CONFIRM_REJECTED: 'CONFIRM_REJECTED',
  /** 需要人工确认但等待超时（超时视为不执行） */
  CONFIRM_TIMEOUT: 'CONFIRM_TIMEOUT',
  /** 工具执行超时 */
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  /** 工具内部抛错 */
  TOOL_FAILED: 'TOOL_FAILED',
  /** 工具连续失败次数达到上限 */
  TOOL_RETRY_EXCEEDED: 'TOOL_RETRY_EXCEEDED',
  /** 达到最大步数 */
  STEP_LIMIT: 'STEP_LIMIT',
  /** 超过总运行时限 */
  DEADLINE_EXCEEDED: 'DEADLINE_EXCEEDED',
  /** 模型调用失败 */
  MODEL_FAILED: 'MODEL_FAILED',
  /** 最终回答没能通过程序的成功标准复核 */
  SUCCESS_CHECK_FAILED: 'SUCCESS_CHECK_FAILED'
}

/** 哪些错误属于"可以先回传给模型、让它改一下再试" */
export const RECOVERABLE = new Set([
  AGENT_ERROR.PARAM_INVALID,
  AGENT_ERROR.ARGS_NOT_JSON,
  AGENT_ERROR.TOOL_FAILED,
  AGENT_ERROR.TOOL_TIMEOUT
])

export class AgentError extends Error {
  /**
   * @param {string} code    AGENT_ERROR 之一
   * @param {string} message 具体原因（会原样回传给模型，所以要写清楚"哪个字段不对"）
   * @param {object} [extra] 附加信息，进日志
   */
  constructor(code, message, extra = {}) {
    super(`[${code}] ${message}`)
    this.name = 'AgentError'
    this.code = code
    this.message = message
    this.extra = extra
  }

  get recoverable() {
    return RECOVERABLE.has(this.code)
  }
}

export function isAgentError(e) {
  return e instanceof AgentError
}
