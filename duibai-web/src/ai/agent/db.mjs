/**
 * AI 能力层 · Agent 工具的数据访问层
 *
 * 为什么要单独一个文件、而不是让每个工具自己写 SQL：
 *   工具里的 SQL 必须**集中在一处**，否则"某个工具偷偷多查了一张表"这种事
 *   在代码审查里看不出来。访问范围是本实验的硬要求（§2.2），集中才可审。
 *
 * 两个连接，权限不同（这是程序化的权限边界，不是提示词里写的约定）：
 *   - 只读连接：openReadonly()，只给查询类工具用。SQLite 层面就写不进去，
 *     即使工具实现里写错了一句 UPDATE 也会直接报错，而不是悄悄改坏数据。
 *   - 可写连接：openReadWrite()，只给需要确认的写工具用，且只在确认通过后才打开。
 *
 * 与 src/infrastructure/repository.ts 的关系：两者面向同一套表。
 * 仓储层服务 Web 请求，这里服务 Agent 工具；都只依赖 schema.mjs 定义的表结构。
 * 测试里有一条"列存在性检查"，用来防两边漂移（见 scripts/agent-test.mjs）。
 */

import { DatabaseSync } from 'node:sqlite'

/** 只读打开。用于全部查询类工具。 */
export function openReadonly(file) {
  try {
    return new DatabaseSync(file, { readOnly: true })
  } catch {
    // 个别构建的 SQLite 绑定不支持 readOnly 选项：退化为普通连接，
    // 但这属于**降级**，会在日志里标出来（不能默认当成有只读保护）。
    const db = new DatabaseSync(file)
    db.__readonlyFallback = true
    return db
  }
}

/** 可写打开。只给需要人工确认的写工具用。 */
export function openReadWrite(file) {
  return new DatabaseSync(file)
}

export function listScripts(db) {
  return db
    .prepare(
      `SELECT s.id, s.article_id, s.tone_code, s.status, s.line_count,
              s.pending_confirm, s.generator, s.created_at,
              a.title AS article_title
         FROM dialogue_scripts s
         LEFT JOIN articles a ON a.id = s.article_id
        ORDER BY s.id DESC`
    )
    .all()
    .map((r) => ({ ...r }))
}

export function getScript(db, scriptId) {
  const row = db
    .prepare(
      `SELECT s.*, a.title AS article_title, a.char_count AS article_chars
         FROM dialogue_scripts s
         LEFT JOIN articles a ON a.id = s.article_id
        WHERE s.id = ?`
    )
    .get(scriptId)
  return row ? { ...row } : null
}

export function getLines(db, scriptId, limit = 50) {
  return db
    .prepare(
      `SELECT id, seq, speaker, text, source_paragraph, flag, confirmed
         FROM dialogue_lines WHERE script_id = ? ORDER BY seq LIMIT ?`
    )
    .all(scriptId, limit)
    .map((r) => ({ ...r }))
}

export function countLines(db, scriptId) {
  const r = db.prepare('SELECT COUNT(*) AS n FROM dialogue_lines WHERE script_id = ?').get(scriptId)
  return r ? r.n : 0
}

export function getParagraphs(db, articleId) {
  return db
    .prepare('SELECT seq, text FROM paragraphs WHERE article_id = ? ORDER BY seq')
    .all(articleId)
    .map((r) => ({ ...r }))
}

export function getArticle(db, articleId) {
  const row = db.prepare('SELECT id, title, char_count FROM articles WHERE id = ?').get(articleId)
  return row ? { ...row } : null
}

/**
 * 设置某条台词的"是否已确认"。
 *
 * 幂等性（§2.2 要求说明"重复调用是否会产生重复修改"）：
 *   这里写成**幂等**语义 —— 目标值与现值相同就直接跳过，返回 already=true。
 *   所以重复调用不会造成二次修改，也不需要调用方自己判断。
 */
export function setLineConfirmed(db, lineId, confirmed) {
  const before = db
    .prepare('SELECT id, script_id, seq, flag, confirmed FROM dialogue_lines WHERE id = ?')
    .get(lineId)
  if (!before) return { found: false }
  const target = confirmed ? 1 : 0
  if (before.confirmed === target) {
    return { found: true, already: true, before: { ...before }, after: { ...before } }
  }
  db.prepare('UPDATE dialogue_lines SET confirmed = ?, flag = CASE WHEN ? = 1 THEN \'\' ELSE flag END WHERE id = ?').run(
    target,
    target,
    lineId
  )
  const after = db
    .prepare('SELECT id, script_id, seq, flag, confirmed FROM dialogue_lines WHERE id = ?')
    .get(lineId)
  return { found: true, already: false, before: { ...before }, after: { ...after } }
}

/** 统计某稿件里 flag 非空、且未确认的条目数（成功复核时用） */
export function countPendingFlags(db, scriptId) {
  const r = db
    .prepare("SELECT COUNT(*) AS n FROM dialogue_lines WHERE script_id = ? AND flag <> '' AND confirmed = 0")
    .get(scriptId)
  return r ? r.n : 0
}
