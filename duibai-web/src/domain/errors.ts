/**
 * 领域层 · 错误码与错误类型
 *
 * 错误码直接对应《实验3》表12「主要接口清单」的"失败情况"一列。
 * 每个错误都必须能映射到一个 HTTP 状态码，且必须带"人话原因"与"下一步动作"，
 * 不允许出现"系统错误，请稍后重试"这种没有信息量的提示。
 */

export type ErrorCode =
  // —— 请求本身不合法（修订版新增：初版把这类情况误判成 500）——
  | 'BAD_REQUEST'
  // —— 上传与解析（实验3 表12 第 1 行）——
  | 'EMPTY_CONTENT'
  | 'ENCODING_UNSUPPORTED'
  | 'FILE_TOO_LARGE'
  // —— 生成（表12 第 2 行 + AC3）——
  | 'NOT_SUITABLE_FOR_AUDIO'
  | 'TONE_NOT_FOUND'
  | 'MODEL_TIMEOUT'
  | 'MODEL_OUTPUT_INVALID'
  // —— 记录不存在（表12 第 3、4、8 行）——
  | 'NOT_FOUND'
  | 'LINE_TOO_LONG'
  // —— 确认环节（表12 第 5 行 + AC4）——
  | 'NOT_PENDING_CONFIRMATION'
  | 'PENDING_CONFIRMATION'
  // —— 语音合成（表12 第 6、7 行 + AC5）——
  | 'TTS_UNAVAILABLE'
  | 'AUDIO_MISSING'
  // —— 兜底 ——
  | 'INTERNAL_ERROR'

const HTTP_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  EMPTY_CONTENT: 400,
  ENCODING_UNSUPPORTED: 400,
  FILE_TOO_LARGE: 413,
  NOT_SUITABLE_FOR_AUDIO: 422,
  TONE_NOT_FOUND: 400,
  MODEL_TIMEOUT: 504,
  MODEL_OUTPUT_INVALID: 502,
  NOT_FOUND: 404,
  LINE_TOO_LONG: 400,
  NOT_PENDING_CONFIRMATION: 409,
  PENDING_CONFIRMATION: 409,
  TTS_UNAVAILABLE: 503,
  AUDIO_MISSING: 404,
  INTERNAL_ERROR: 500
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly httpStatus: number
  /** 给用户看的原因，要具体，不能是"出错了" */
  readonly reason: string
  /** 给用户的下一步建议 */
  readonly suggestion: string
  /** 附加数据，例如 PENDING_CONFIRMATION 的待确认条目 id 列表 */
  readonly extra: Record<string, unknown>

  constructor(
    code: ErrorCode,
    reason: string,
    suggestion = '',
    extra: Record<string, unknown> = {}
  ) {
    super(`[${code}] ${reason}`)
    this.name = 'AppError'
    this.code = code
    this.httpStatus = HTTP_STATUS[code] ?? 500
    this.reason = reason
    this.suggestion = suggestion
    this.extra = extra
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}

/**
 * 把任意异常收敛成「可返回给前端的结构」。
 * 未知异常一律降级为 INTERNAL_ERROR，但不吞掉原因 —— 原因进日志。
 */
export function toErrorPayload(e: unknown): {
  status: number
  body: { error: ErrorCode; reason: string; suggestion: string } & Record<string, unknown>
} {
  if (isAppError(e)) {
    return {
      status: e.httpStatus,
      body: { error: e.code, reason: e.reason, suggestion: e.suggestion, ...e.extra }
    }
  }
  return {
    status: 500,
    body: {
      error: 'INTERNAL_ERROR',
      reason: '程序内部出现未预期的异常',
      suggestion: '请查看服务端日志定位；本次操作未产生数据'
    }
  }
}
