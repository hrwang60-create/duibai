/**
 * 基础设施层 · SQLite 连接与建表
 *
 * 数据访问技术选型：**Node.js 内置的 node:sqlite**（即 SQLite 3）。
 * 选择理由（对应实验4 §2.2"给出选择理由"）：
 *   1. 实验3 的 ADR-2 已定为 SQLite（单人项目、数据量小、零运维、符合"数据默认保存在本地"）；
 *   2. node:sqlite 是 Node 22 内置模块，**不需要任何原生编译或二进制下载**，
 *      在没有外网构建环境的机器上也能一次装好 —— 这直接消掉了本项目最大的一类环境风险；
 *   3. 若后续要换 PostgreSQL，只需改本文件与 repository.ts，上层无感（实验3 表8："切换代价低"）。
 */

import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
// 建表语句与初始化脚本共用同一份，避免两处漂移
import { SCHEMA } from './schema.mjs'

export const DATA_DIR = path.join(process.cwd(), 'data')
export const DB_FILE = path.join(DATA_DIR, 'duibai.db')
export const AUDIO_DIR = path.join(DATA_DIR, 'audio')
export const LOG_DIR = path.join(DATA_DIR, 'logs')

let db: DatabaseSync | null = null

/** 取数据库单例。首次调用时建目录、开会话、建表。 */
export function getDb(): DatabaseSync {
  if (db) return db
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(AUDIO_DIR, { recursive: true })
  fs.mkdirSync(LOG_DIR, { recursive: true })
  db = new DatabaseSync(DB_FILE)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

/** 仅测试与初始化脚本使用：关掉连接，让文件可以被删除。 */
export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function dbExists(): boolean {
  return fs.existsSync(DB_FILE)
}
