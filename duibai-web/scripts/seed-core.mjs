/**
 * 样例数据核心逻辑（供 seed.mjs 与 test.mjs 共用）
 *
 * 为什么单独抽出来：初始化脚本与测试脚本都要"清空 / 灌样例数据"，
 * 如果各写一份，两份迟早会不一致；而测试又**不能靠再起一个 node 进程**去调脚本
 * （有的环境禁止派生进程），所以这里做成可直接 import 的纯函数。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { SCHEMA } from '../src/infrastructure/schema.mjs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_DIR = path.join(ROOT, 'data')
export const DB_FILE = path.join(DATA_DIR, 'duibai.db')

/** 业务数据：可以随便清 */
export const BUSINESS_TABLES = [
  'articles',
  'paragraphs',
  'dialogue_scripts',
  'dialogue_lines',
  'audio_segments',
  'app_logs'
]

/** 全部表（用于统计） */
export const ALL_TABLES = ['tones', ...BUSINESS_TABLES]

/**
 * 口吻（tones）是**预置字典**，不是用户数据 —— 清空业务数据时必须保留。
 * 初版把两者一起删掉，导致清空后首页一个口吻都选不了（实验4 §2.5 用例 T17）。
 */
export function openDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(path.join(DATA_DIR, 'audio'), { recursive: true })
  fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true })
  const db = new DatabaseSync(DB_FILE)
  db.exec('PRAGMA foreign_keys = ON')
  // 多进程同时写库时等待，而不是立刻抛 SQLITE_BUSY
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(SCHEMA)
  return db
}

export function loadSample() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'sample-data.json'), 'utf8'))
}

export function counts(db) {
  const out = {}
  for (const t of ALL_TABLES) out[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n
  return out
}

export function clearBusiness(db) {
  db.exec('PRAGMA foreign_keys = OFF')
  for (const t of BUSINESS_TABLES) db.exec(`DELETE FROM ${t}`)
  db.exec(
    `DELETE FROM sqlite_sequence WHERE name IN (${BUSINESS_TABLES.map((t) => `'${t}'`).join(',')})`
  )
  db.exec('PRAGMA foreign_keys = ON')
}

export function seedTones(db, sample = loadSample()) {
  const stmt = db.prepare(
    `INSERT INTO tones (code, name, description, prompt_template, enabled) VALUES (?,?,?,?,1)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name, description=excluded.description,
       prompt_template=excluded.prompt_template, enabled=1`
  )
  for (const t of sample.tones) stmt.run(t.code, t.name, t.description, t.prompt_template)
  return sample.tones.length
}

/** 幂等：同名文章已存在就跳过 */
export function seedArticle(db, spec) {
  const existing = db.prepare('SELECT id FROM articles WHERE title = ?').get(spec.title)
  if (existing) return { id: existing.id, created: false, paragraphs: spec.paragraphs.length }
  const content = spec.paragraphs.join('\n\n')
  const r = db
    .prepare('INSERT INTO articles (title, content, char_count, created_at) VALUES (?,?,?,?)')
    .run(spec.title, content, content.length, new Date().toISOString())
  const articleId = Number(r.lastInsertRowid)
  const stmt = db.prepare('INSERT INTO paragraphs (article_id, seq, text) VALUES (?,?,?)')
  spec.paragraphs.forEach((p, i) => stmt.run(articleId, i + 1, p))
  return { id: articleId, created: true, paragraphs: spec.paragraphs.length }
}

export function seedAll(db, sample = loadSample()) {
  const tones = seedTones(db, sample)
  const articles = []
  for (const [key, label] of [
    ['sample_article', '正常样例'],
    ['sample_unsuitable_article', '异常样例'],
    ['sample_noisy_article', '书面残留样例']
  ]) {
    if (sample[key]) articles.push({ ...seedArticle(db, sample[key]), label })
  }
  return { tones, articles }
}
