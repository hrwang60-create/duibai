/**
 * 基础设施层 · 日志
 *
 * 日志写两处（互为补充，对应实验4 §2.5"说明日志位置和主要内容"）：
 *   1. `data/logs/app-YYYY-MM-DD.log` —— JSON Lines，用于翻看与 grep；
 *   2. SQLite 的 `app_logs` 表 —— 用于在管理端按级别/范围检索。
 *
 * 记录原则：**只记录能帮助定位问题的信息**。用户上传的文章正文不进日志
 * （隐私考虑），只记长度、段数、状态码这类可量化字段。
 */

import fs from 'node:fs'
import path from 'node:path'
import { getDb, LOG_DIR } from './db'

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogFields {
  [k: string]: string | number | boolean | null | undefined
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function serialize(fields: LogFields): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') continue
    parts.push(`${k}=${v}`)
  }
  return parts.join(' ')
}

export function log(level: LogLevel, scope: string, message: string, fields: LogFields = {}): void {
  const at = new Date().toISOString()
  const detail = serialize(fields)
  const line = JSON.stringify({ at, level, scope, message, ...fields })

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(path.join(LOG_DIR, `app-${today()}.log`), line + '\n', 'utf8')
  } catch {
    // 日志写不进去不能把业务打挂
  }

  try {
    getDb()
      .prepare('INSERT INTO app_logs (level, scope, message, detail, created_at) VALUES (?,?,?,?,?)')
      .run(level, scope, message, detail, at)
  } catch {
    // 同上
  }

  const tag = level === 'error' ? '✗' : level === 'warn' ? '!' : '·'
  // eslint-disable-next-line no-console
  console.log(`${tag} [${scope}] ${message}${detail ? '  ' + detail : ''}`)
}

export const logger = {
  info: (scope: string, message: string, fields?: LogFields) => log('info', scope, message, fields),
  warn: (scope: string, message: string, fields?: LogFields) => log('warn', scope, message, fields),
  error: (scope: string, message: string, fields?: LogFields) => log('error', scope, message, fields)
}
