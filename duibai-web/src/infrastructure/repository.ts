/**
 * 基础设施层 · 数据访问（Repository）
 *
 * 全部 SQL 集中在这里，应用服务层只调用函数、不写 SQL。
 * 好处：换数据库只改本文件；SQL 不会被散落到各业务文件里（实验3 ADR-3 分层的要求）。
 */

import { getDb } from './db'
import type {
  Article,
  AudioSegment,
  DialogueLine,
  DialogueScript,
  LineFlag,
  Paragraph,
  Speaker,
  Tone
} from '@/domain/types'

/* ------------------------------------------------------------------ 口吻 */
export const toneRepo = {
  list(): Tone[] {
    return getDb()
      .prepare('SELECT code, name, description, prompt_template FROM tones WHERE enabled = 1 ORDER BY rowid')
      .all() as unknown as Tone[]
  },
  get(code: string): Tone | undefined {
    return getDb()
      .prepare('SELECT code, name, description, prompt_template FROM tones WHERE code = ?')
      .get(code) as unknown as Tone | undefined
  },
  upsert(t: Tone & { enabled?: number }): void {
    getDb()
      .prepare(
        `INSERT INTO tones (code, name, description, prompt_template, enabled)
         VALUES (?,?,?,?,?)
         ON CONFLICT(code) DO UPDATE SET name=excluded.name, description=excluded.description,
           prompt_template=excluded.prompt_template, enabled=excluded.enabled`
      )
      .run(t.code, t.name, t.description, t.prompt_template, t.enabled ?? 1)
  }
}

/* ------------------------------------------------------------------ 文章 */
export const articleRepo = {
  insert(a: Omit<Article, 'id'>): number {
    const r = getDb()
      .prepare('INSERT INTO articles (title, content, char_count, created_at) VALUES (?,?,?,?)')
      .run(a.title, a.content, a.char_count, a.created_at)
    return Number(r.lastInsertRowid)
  },
  get(id: number): Article | undefined {
    return getDb().prepare('SELECT * FROM articles WHERE id = ?').get(id) as unknown as
      | Article
      | undefined
  },
  /** 按标题找（用于"同一篇文章重复上传"这种冲突的识别） */
  findByTitle(title: string): Article | undefined {
    return getDb()
      .prepare('SELECT * FROM articles WHERE title = ? ORDER BY id DESC LIMIT 1')
      .get(title) as unknown as Article | undefined
  },
  /** 历史列表：带对谈稿信息，供首页展示 */
  listWithScripts(limit = 20): Array<
    Article & { script_id: number | null; tone_code: string | null; status: string | null }
  > {
    return getDb()
      .prepare(
        `SELECT a.id, a.title, a.content, a.char_count, a.created_at,
                s.id AS script_id, s.tone_code, s.status
         FROM articles a
         LEFT JOIN dialogue_scripts s
           ON s.id = (SELECT id FROM dialogue_scripts WHERE article_id = a.id ORDER BY id DESC LIMIT 1)
         ORDER BY a.id DESC LIMIT ?`
      )
      .all(limit) as unknown as Array<
      Article & { script_id: number | null; tone_code: string | null; status: string | null }
    >
  },
  count(): number {
    const r = getDb().prepare('SELECT COUNT(*) AS n FROM articles').get() as unknown as { n: number }
    return r.n
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM articles WHERE id = ?').run(id)
  }
}

/* ------------------------------------------------------------------ 段落 */
export const paragraphRepo = {
  insertMany(articleId: number, texts: string[]): void {
    const stmt = getDb().prepare('INSERT INTO paragraphs (article_id, seq, text) VALUES (?,?,?)')
    texts.forEach((t, i) => stmt.run(articleId, i + 1, t))
  },
  listByArticle(articleId: number): Paragraph[] {
    return getDb()
      .prepare('SELECT * FROM paragraphs WHERE article_id = ? ORDER BY seq')
      .all(articleId) as unknown as Paragraph[]
  },
  get(id: number): Paragraph | undefined {
    return getDb().prepare('SELECT * FROM paragraphs WHERE id = ?').get(id) as unknown as
      | Paragraph
      | undefined
  },
  getBySeq(articleId: number, seq: number): Paragraph | undefined {
    return getDb()
      .prepare('SELECT * FROM paragraphs WHERE article_id = ? AND seq = ?')
      .get(articleId, seq) as unknown as Paragraph | undefined
  },
  countByArticle(articleId: number): number {
    const r = getDb()
      .prepare('SELECT COUNT(*) AS n FROM paragraphs WHERE article_id = ?')
      .get(articleId) as unknown as { n: number }
    return r.n
  }
}

/* ------------------------------------------------------------- 对谈稿件 */
export const scriptRepo = {
  insert(s: {
    article_id: number
    tone_code: string
    status: string
    line_count: number
    pending_confirm: number
    generator: string
    created_at: string
  }): number {
    const r = getDb()
      .prepare(
        `INSERT INTO dialogue_scripts (article_id, tone_code, status, line_count, pending_confirm, generator, created_at)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(
        s.article_id,
        s.tone_code,
        s.status,
        s.line_count,
        s.pending_confirm,
        s.generator,
        s.created_at
      )
    return Number(r.lastInsertRowid)
  },
  get(id: number): DialogueScript | undefined {
    return getDb().prepare('SELECT * FROM dialogue_scripts WHERE id = ?').get(id) as unknown as
      | DialogueScript
      | undefined
  },
  update(id: number, patch: Partial<DialogueScript>): void {
    const cur = scriptRepo.get(id)
    if (!cur) return
    const next = { ...cur, ...patch }
    getDb()
      .prepare(
        'UPDATE dialogue_scripts SET status=?, line_count=?, pending_confirm=? WHERE id=?'
      )
      .run(next.status, next.line_count, next.pending_confirm, id)
  },
  count(): number {
    const r = getDb().prepare('SELECT COUNT(*) AS n FROM dialogue_scripts').get() as unknown as {
      n: number
    }
    return r.n
  }
}

/* ------------------------------------------------------------- 对话条目 */
export const lineRepo = {
  insertMany(
    scriptId: number,
    lines: Array<{
      seq: number
      speaker: Speaker
      text: string
      source_paragraph: number
      flag: LineFlag
      confirmed: boolean
    }>
  ): void {
    const stmt = getDb().prepare(
      `INSERT INTO dialogue_lines (script_id, seq, speaker, text, source_paragraph, flag, confirmed)
       VALUES (?,?,?,?,?,?,?)`
    )
    for (const l of lines) {
      stmt.run(
        scriptId,
        l.seq,
        l.speaker,
        l.text,
        l.source_paragraph,
        l.flag,
        l.confirmed ? 1 : 0
      )
    }
  },
  listByScript(scriptId: number): DialogueLine[] {
    const rows = getDb()
      .prepare('SELECT * FROM dialogue_lines WHERE script_id = ? ORDER BY seq')
      .all(scriptId) as unknown as Array<Omit<DialogueLine, 'confirmed'> & { confirmed: number }>
    return rows.map((r) => ({ ...r, confirmed: !!r.confirmed }))
  },
  get(id: number): DialogueLine | undefined {
    const r = getDb().prepare('SELECT * FROM dialogue_lines WHERE id = ?').get(id) as unknown as
      | (Omit<DialogueLine, 'confirmed'> & { confirmed: number })
      | undefined
    return r ? { ...r, confirmed: !!r.confirmed } : undefined
  },
  updateText(id: number, text: string): void {
    getDb().prepare('UPDATE dialogue_lines SET text = ? WHERE id = ?').run(text, id)
  },
  /** 同时更新文本与校验结论（单句修正时使用：改完要重新判定还可不可疑） */
  updateTextAndValidation(id: number, text: string, flag: LineFlag, confirmed: boolean): void {
    getDb()
      .prepare('UPDATE dialogue_lines SET text = ?, flag = ?, confirmed = ? WHERE id = ?')
      .run(text, flag, confirmed ? 1 : 0, id)
  },
  setConfirmed(id: number): void {
    getDb().prepare('UPDATE dialogue_lines SET confirmed = 1 WHERE id = ?').run(id)
  },
  count(): number {
    const r = getDb().prepare('SELECT COUNT(*) AS n FROM dialogue_lines').get() as unknown as {
      n: number
    }
    return r.n
  }
}

/* ------------------------------------------------------------- 音频片段 */
export const audioRepo = {
  upsert(seg: Omit<AudioSegment, 'id'>): void {
    getDb()
      .prepare(
        `INSERT INTO audio_segments (line_id, speaker, file_path, duration) VALUES (?,?,?,?)
         ON CONFLICT(line_id) DO UPDATE SET file_path=excluded.file_path, duration=excluded.duration`
      )
      .run(seg.line_id, seg.speaker, seg.file_path, seg.duration)
  },
  listByScript(scriptId: number): AudioSegment[] {
    return getDb()
      .prepare(
        `SELECT g.* FROM audio_segments g
         JOIN dialogue_lines l ON l.id = g.line_id
         WHERE l.script_id = ? ORDER BY l.seq`
      )
      .all(scriptId) as unknown as AudioSegment[]
  },
  count(): number {
    const r = getDb().prepare('SELECT COUNT(*) AS n FROM audio_segments').get() as unknown as {
      n: number
    }
    return r.n
  }
}

/* ------------------------------------------------------------------ 日志 */
export const logRepo = {
  recent(limit = 50): Array<{ id: number; level: string; scope: string; message: string; detail: string; created_at: string }> {
    return getDb()
      .prepare('SELECT * FROM app_logs ORDER BY id DESC LIMIT ?')
      .all(limit) as unknown as Array<{
      id: number
      level: string
      scope: string
      message: string
      detail: string
      created_at: string
    }>
  }
}

/** 统计：给首页与报告里的"数据现状"用 */
export function stats() {
  return {
    articles: articleRepo.count(),
    scripts: scriptRepo.count(),
    lines: lineRepo.count(),
    segments: audioRepo.count()
  }
}
