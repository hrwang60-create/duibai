/**
 * 基础设施层 · 建表语句（单独放一个纯 ESM 文件）
 *
 * 为什么要单独一个文件：**Next.js 与 Node 脚本共用同一份 Schema**。
 * 如果初始化脚本自己抄一份建表语句，两份迟早会漂移 —— 那种 bug 很难查。
 */

export const SCHEMA = `
-- 口吻（实验3 图4 的 TONE；6 条预置）
CREATE TABLE IF NOT EXISTS tones (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  prompt_template TEXT NOT NULL DEFAULT '',
  enabled         INTEGER NOT NULL DEFAULT 1
);

-- 文章（ARTICLE）
CREATE TABLE IF NOT EXISTS articles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  char_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 段落（PARAGRAPH）：seq 在文章内唯一且连续
CREATE TABLE IF NOT EXISTS paragraphs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  text       TEXT NOT NULL,
  UNIQUE (article_id, seq)
);

-- 对谈稿件（DIALOGUE_SCRIPT）：一篇文章可生成多份（"换一种口吻重听"）
CREATE TABLE IF NOT EXISTS dialogue_scripts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id      INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tone_code       TEXT NOT NULL REFERENCES tones(code),
  status          TEXT NOT NULL DEFAULT 'generated',
  line_count      INTEGER NOT NULL DEFAULT 0,
  pending_confirm INTEGER NOT NULL DEFAULT 0,
  generator       TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL
);

-- 对话条目（DIALOGUE_LINE）
CREATE TABLE IF NOT EXISTS dialogue_lines (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id        INTEGER NOT NULL REFERENCES dialogue_scripts(id) ON DELETE CASCADE,
  seq              INTEGER NOT NULL,
  speaker          TEXT NOT NULL CHECK (speaker IN ('A','B')),
  text             TEXT NOT NULL,
  source_paragraph INTEGER NOT NULL DEFAULT 0,
  flag             TEXT NOT NULL DEFAULT '',
  confirmed        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (script_id, seq)
);

-- 音频片段（AUDIO_SEGMENT）：与 DialogueLine 一对一，支持"仅重做该句"
CREATE TABLE IF NOT EXISTS audio_segments (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  line_id   INTEGER NOT NULL REFERENCES dialogue_lines(id) ON DELETE CASCADE,
  speaker   TEXT NOT NULL,
  file_path TEXT NOT NULL,
  duration  REAL NOT NULL DEFAULT 0,
  UNIQUE (line_id)
);

-- 运行日志（实验3 图2 基础设施层的"日志与错误记录"）
CREATE TABLE IF NOT EXISTS app_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  level      TEXT NOT NULL,
  scope      TEXT NOT NULL,
  message    TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paragraphs_article ON paragraphs(article_id, seq);
CREATE INDEX IF NOT EXISTS idx_lines_script       ON dialogue_lines(script_id, seq);
CREATE INDEX IF NOT EXISTS idx_scripts_article    ON dialogue_scripts(article_id, id DESC);
`
