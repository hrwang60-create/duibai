/**
 * 基础设施层 · HTTP 响应工具
 *
 * 统一"成功/失败"的返回形状，并保证**任何异常都不会让接口返回 200 + 空数据**
 * —— 那是把错误伪装成"没有数据"，用户会以为自己的东西丢了。
 */

import { NextResponse } from 'next/server'
import { AppError, isAppError, toErrorPayload } from '@/domain/errors'
import { logger } from './logger'

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ code: 0, data }, { status })
}

export function fail(e: unknown, scope: string) {
  const { status, body } = toErrorPayload(e)
  const level = status >= 500 ? 'error' : 'warn'
  logger[level](scope, '请求失败', {
    code: body.error,
    status,
    reason: body.reason,
    err: e instanceof Error ? e.message : String(e)
  })
  return NextResponse.json(body, { status })
}

/** 把字符串参数解析成正整数 id；不是合法 id 一律按"记录不存在"处理。 */
export function parseId(raw: string): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError('NOT_FOUND', `「${raw}」不是合法的记录编号`, '请回到列表页重新选择一条记录')
  }
  return n
}

export { AppError, isAppError }
