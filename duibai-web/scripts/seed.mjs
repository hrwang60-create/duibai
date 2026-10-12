/**
 * 样例数据初始化脚本
 *
 * 用法（在 duibai-web 目录下执行）：
 *   node scripts/seed.mjs            初始化／补齐样例数据（幂等，可重复跑）
 *   node scripts/seed.mjs --reset    先清空全部业务数据，再重新初始化
 *   node scripts/seed.mjs --clear    只清空，不初始化
 *   node scripts/seed.mjs --status   只打印各表记录数
 *
 * 对应实验4 §2.2 的要求："提供一组可重复使用的样例数据，并说明如何初始化、清空或恢复"。
 * 它保证任何人 clone 之后都能**一次命令**得到一个可演示的数据库。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { SCHEMA } from '../src/infrastructure/schema.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'data')
const DB_FILE = path.join(DATA_DIR, 'duibai.db')
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'sample-data.json'), 'utf8'))

const TABLES = ['tones', 'articles', 'paragraphs', 'dialogue_scripts', 'dialogue_lines', 'audio_segments', 'app_logs']

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(path.join(DATA_DIR, 'audio'), { recursive: true })
fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true })

const db = new DatabaseSync(DB_FILE)
db.exec('PRAGMA foreign_keys = ON')
db.exec(SCHEMA)

function counts() {
  const out = {}
  for (const t of TABLES) out[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n
  return out
}

function clearAll() {
  db.exec('PRAGMA foreign_keys = OFF')
  for (const t of TABLES) db.exec(`DELETE FROM ${t}`)
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('articles','paragraphs','dialogue_scripts','dialogue_lines','audio_segments','app_logs')")
  db.exec('PRAGMA foreign_keys = ON')
  console.log('已清空全部业务数据')
}

function seedTones() {
  const stmt = db.prepare(
    `INSERT INTO tones (code, name, description, prompt_template, enabled) VALUES (?,?,?,?,1)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name, description=excluded.description,
       prompt_template=excluded.prompt_template, enabled=1`
  )
  for (const t of SAMPLE.tones) stmt.run(t.code, t.name, t.description, t.prompt_template)
  console.log(`口吻：写入 ${SAMPLE.tones.length} 条`)
}

/** 直接落库（不走应用服务层），因为它要能在一个空库上独立跑起来 */
function seedArticle(spec, note) {
  const existing = db.prepare('SELECT id FROM articles WHERE title = ?').get(spec.title)
  if (existing) {
    console.log(`样例文章「${spec.title}」已存在（#${existing.id}），跳过`)
    return existing.id
  }
  const content = spec.paragraphs.join('\n\n')
  const at = new Date().toISOString()
  const r = db
    .prepare('INSERT INTO articles (title, content, char_count, created_at) VALUES (?,?,?,?)')
    .run(spec.title, content, content.length, at)
  const articleId = Number(r.lastInsertRowid)
  const stmt = db.prepare('INSERT INTO paragraphs (article_id, seq, text) VALUES (?,?,?)')
  spec.paragraphs.forEach((p, i) => stmt.run(articleId, i + 1, p))
  console.log(`样例文章：${note}「${spec.title}」→ 文章 #${articleId}，${spec.paragraphs.length} 段`)
  return articleId
}

console.log('数据库文件：' + DB_FILE)

if (has('--clear') || has('--reset')) clearAll()

if (!has('--clear') && !has('--status')) {
  seedTones()
  seedArticle(SAMPLE.sample_article, '正常样例')
  seedArticle(SAMPLE.sample_unsuitable_article, '异常样例')
}

console.log('当前各表记录数：')
const c = counts()
for (const t of TABLES) console.log(`  ${t.padEnd(18)} ${c[t]}`)
db.close()
