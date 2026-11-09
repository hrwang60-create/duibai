/**
 * AI 能力层 · 工具清单（Agent 唯一可调用的动作集合）
 *
 * 设计原则（对应实验6 §2.2）：
 *   1. **白名单**：模型只能请求本文件里注册过的名字，名字对不上直接拒绝，
 *      Harness 不会去 eval、不会拼 SQL、不会执行任何模型给出的字符串；
 *   2. **参数由程序校验**：每个工具带一份受控子集 JSON Schema，
 *      Harness 在调用前校验，不通过就把"哪个字段、为什么不对"回传给模型；
 *   3. **访问范围写死在实现里**：查询工具用只读连接；写文件只能进
 *      `data/reports/`（且文件名受正则约束）；写数据库只能改 `confirmed` 这一个字段；
 *   4. **写操作必须人工确认**：`writes !== 'none'` 的工具一律 requiresConfirmation，
 *      确认前不打开可写连接 —— 权限是"没给"，不是"答应了不用"。
 *
 * 每个工具都写明：是否修改数据、重复调用会不会重复修改、最长等待多少。
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  countLines,
  getArticle,
  getLines,
  getParagraphs,
  getScript,
  listScripts,
  setLineConfirmed
} from './db.mjs'
import { lintScript, RULE_DEFS } from './lint.mjs'

const INT_ID = { type: 'integer', minimum: 1, maximum: 999999 }

/* ────────────────────────────── 只读工具 ────────────────────────────── */

const listScriptsTool = {
  name: 'list_scripts',
  title: '列出对谈稿件',
  purpose: '列出库里已有的稿件及其状态、句数、待确认数，用于确定要从哪一份开始质检',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  returns: '{ scripts: [{ id, article_id, article_title, tone_code, status, line_count, pending_confirm }] }',
  writes: 'none',
  requiresConfirmation: false,
  timeoutMs: 5000,
  idempotent: true,
  idempotencyNote: '纯查询，重复调用结果只取决于数据库当前状态',
  describe: () => '查询稿件列表（只读）',
  handler: async (_args, ctx) => {
    const rows = listScripts(ctx.db)
    return {
      count: rows.length,
      scripts: rows.map((r) => ({
        id: r.id,
        article_id: r.article_id,
        article_title: r.article_title,
        tone_code: r.tone_code,
        status: r.status,
        line_count: r.line_count,
        pending_confirm: r.pending_confirm
      }))
    }
  }
}

const getScriptTool = {
  name: 'get_script',
  title: '读取稿件与台词',
  purpose: '按编号读取一份稿件的元信息与前若干条台词（含出处段落号与可疑标记）',
  parameters: {
    type: 'object',
    properties: {
      script_id: { ...INT_ID, description: '稿件编号' },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: '最多返回多少条台词，默认 50' }
    },
    required: ['script_id'],
    additionalProperties: false
  },
  returns: '{ script: { id, article_id, article_title, tone_code, status, line_count, pending_confirm }, lines: [...], truncated: boolean }',
  writes: 'none',
  requiresConfirmation: false,
  timeoutMs: 5000,
  idempotent: true,
  idempotencyNote: '纯查询',
  describe: (a) => `读取稿件 #${a.script_id} 的台词（只读）`,
  handler: async (args, ctx) => {
    const s = getScript(ctx.db, args.script_id)
    if (!s) {
      const e = new Error(`稿件 #${args.script_id} 不存在`)
      e.toolError = 'SCRIPT_NOT_FOUND'
      e.hint = '先用 list_scripts 看看有哪些稿件编号'
      throw e
    }
    const limit = args.limit ?? 50
    const lines = getLines(ctx.db, args.script_id, limit)
    const total = countLines(ctx.db, args.script_id)
    return {
      script: {
        id: s.id,
        article_id: s.article_id,
        article_title: s.article_title,
        tone_code: s.tone_code,
        status: s.status,
        line_count: s.line_count,
        pending_confirm: s.pending_confirm,
        generator: s.generator
      },
      lines,
      line_count_actual: total,
      truncated: lines.length < total
    }
  }
}

const getParagraphsTool = {
  name: 'get_paragraphs',
  title: '读取原文段落',
  purpose: '读取稿件所属文章的全部段落，用于核对出处是否越界、数字是否有原文依据',
  parameters: {
    type: 'object',
    properties: { article_id: { ...INT_ID, description: '文章编号' } },
    required: ['article_id'],
    additionalProperties: false
  },
  returns: '{ article: { id, title, char_count }, paragraphs: [{ seq, text }] }',
  writes: 'none',
  requiresConfirmation: false,
  timeoutMs: 5000,
  idempotent: true,
  idempotencyNote: '纯查询',
  describe: (a) => `读取文章 #${a.article_id} 的原文段落（只读）`,
  handler: async (args, ctx) => {
    const art = getArticle(ctx.db, args.article_id)
    if (!art) {
      const e = new Error(`文章 #${args.article_id} 不存在`)
      e.toolError = 'ARTICLE_NOT_FOUND'
      throw e
    }
    const paragraphs = getParagraphs(ctx.db, args.article_id)
    return { article: art, paragraphs }
  }
}

const lintScriptTool = {
  name: 'lint_script',
  title: '执行稿件质检',
  purpose: '对一份稿件跑三类规则检查（仅可阅读元素、出处、数值一致性），返回问题清单与统计数字',
  parameters: {
    type: 'object',
    properties: {
      script_id: { ...INT_ID, description: '稿件编号' },
      rules: {
        type: 'array',
        description: '要执行的规则，默认全部',
        items: { type: 'string', enum: RULE_DEFS.map((r) => r.id) },
        minItems: 1,
        maxItems: 3
      }
    },
    required: ['script_id'],
    additionalProperties: false
  },
  returns: '{ total, counts: {readable, source, numbers}, issues: [...], stats: {...}, rules_run: [...] }',
  writes: 'none',
  requiresConfirmation: false,
  timeoutMs: 10000,
  idempotent: true,
  idempotencyNote: '纯计算，不改数据',
  describe: (a) => `对稿件 #${a.script_id} 执行质检（只读，不改数据）`,
  handler: async (args, ctx) => {
    const s = getScript(ctx.db, args.script_id)
    if (!s) {
      const e = new Error(`稿件 #${args.script_id} 不存在`)
      e.toolError = 'SCRIPT_NOT_FOUND'
      throw e
    }
    const lines = getLines(ctx.db, args.script_id, 200)
    const paragraphs = getParagraphs(ctx.db, s.article_id)
    const all = lintScript({ lines, paragraphs })
    const rules = args.rules && args.rules.length ? args.rules : RULE_DEFS.map((r) => r.id)

    // 只统计被选中的规则（问题明细也按规则过滤）
    const counts = {
      readable: rules.includes('readable') ? all.counts.readable : 0,
      source: rules.includes('source') ? all.counts.source : 0,
      numbers: rules.includes('numbers') ? all.counts.numbers : 0
    }
    const issues = all.issues.filter((i) => rules.includes(i.type))
    return {
      script_id: args.script_id,
      rules_run: rules,
      total: all.total,
      counts,
      issue_total: issues.length,
      issues,
      stats: all.stats,
      note: '只检测、不改写；如需修正请使用写操作工具（需人工确认）'
    }
  }
}

/* ────────────────────────────── 写工具 ────────────────────────────── */

const writeReportTool = {
  name: 'write_report',
  title: '写入质检报告',
  purpose: '把质检结论写成 Markdown 文件，保存到工程的 data/reports/ 目录',
  parameters: {
    type: 'object',
    properties: {
      script_id: { ...INT_ID, description: '稿件编号（只用于命名建议，不参与写入路径）' },
      filename: {
        type: 'string',
        minLength: 5,
        maxLength: 64,
        pattern: '^[a-z0-9][a-z0-9._-]*\\.md$',
        description: '文件名，只允许小写字母、数字、点、下划线、连字符，且必须以 .md 结尾'
      },
      content: { type: 'string', minLength: 20, maxLength: 8000, description: '报告正文（Markdown）' }
    },
    required: ['script_id', 'filename', 'content'],
    additionalProperties: false
  },
  returns: '{ path, bytes, overwritten }',
  writes: 'file',
  requiresConfirmation: true,
  timeoutMs: 3000,
  idempotent: true,
  idempotencyNote: '同名文件直接覆盖，重复调用不会产生第二份文件（内容不同则以最后一次为准）',
  describe: (a) =>
    `写入文件 data/reports/${a.filename}（${String(a.content || '').length} 字符）` +
    `\n     影响：若同名文件已存在会被覆盖；不会触碰数据库`,
  handler: async (args, ctx) => {
    const dir = ctx.reportsDir
    const target = path.resolve(dir, args.filename)
    // 双保险：schema 已限制文件名，这里再确认解析后的路径没跑出目录
    if (!target.startsWith(path.resolve(dir) + path.sep)) {
      const e = new Error('目标路径不在允许目录 data/reports/ 内')
      e.toolError = 'PATH_NOT_ALLOWED'
      throw e
    }
    fs.mkdirSync(dir, { recursive: true })
    const existed = fs.existsSync(target)
    fs.writeFileSync(target, args.content, 'utf8')
    const stat = fs.statSync(target)
    return {
      path: path.relative(ctx.root, target).replace(/\\/g, '/'),
      bytes: stat.size,
      overwritten: existed
    }
  }
}

const setLineConfirmedTool = {
  name: 'set_line_confirmed',
  title: '设置台词确认状态',
  purpose: '把某条台词标记为已确认（或取消确认）。这是唯一会修改数据库的工具',
  parameters: {
    type: 'object',
    properties: {
      line_id: { ...INT_ID, description: '台词编号' },
      confirmed: { type: 'boolean', description: 'true = 标记为已确认；false = 取消确认' }
    },
    required: ['line_id', 'confirmed'],
    additionalProperties: false
  },
  returns: '{ line_id, before: {flag, confirmed}, after: {flag, confirmed}, already }',
  writes: 'db',
  requiresConfirmation: true,
  timeoutMs: 5000,
  idempotent: true,
  idempotencyNote: '目标值与现值相同时直接跳过（already=true），重复调用不会二次修改',
  describe: (a) =>
    `把台词 #${a.line_id} 的确认状态改为 ${a.confirmed ? '已确认' : '未确认'}` +
    `\n     影响：只改 dialogue_lines.confirmed 一个字段；已确认时同时清空可疑标记 flag`,
  handler: async (args, ctx) => {
    if (!ctx.writeDb) {
      const e = new Error('写连接未打开（写操作必须先通过人工确认）')
      e.toolError = 'WRITE_NOT_ALLOWED'
      throw e
    }
    const r = setLineConfirmed(ctx.writeDb, args.line_id, args.confirmed)
    if (!r.found) {
      const e = new Error(`台词 #${args.line_id} 不存在`)
      e.toolError = 'LINE_NOT_FOUND'
      throw e
    }
    return {
      line_id: args.line_id,
      already: r.already,
      before: { flag: r.before.flag, confirmed: r.before.confirmed },
      after: { flag: r.after.flag, confirmed: r.after.confirmed }
    }
  }
}

/* ────────────────────────────── 注册表 ────────────────────────────── */

export const TOOLS = [
  listScriptsTool,
  getScriptTool,
  getParagraphsTool,
  lintScriptTool,
  writeReportTool,
  setLineConfirmedTool
]

/** 允许清单：Harness 只认这里的名字 */
export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]))

/** 转成模型接口要的 tools 数组 */
export function toModelTools() {
  return TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: `${t.purpose}。返回：${t.returns}`, parameters: t.parameters }
  }))
}

/** 报告里用的一张表：工具名称、是否写、是否需确认、超时、幂等 */
export function describeTools() {
  return TOOLS.map((t) => ({
    name: t.name,
    writes: t.writes,
    requiresConfirmation: t.requiresConfirmation,
    timeoutMs: t.timeoutMs,
    idempotent: t.idempotent,
    idempotencyNote: t.idempotencyNote
  }))
}
