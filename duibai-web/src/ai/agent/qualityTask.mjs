/**
 * AI 能力层 · 任务定义与成功标准复核
 *
 * 任务：对一份对谈稿件做质检，产出可复核的报告；如报告里提到"待确认"的可疑处，
 * 再把它们标记为已确认（这一步是写操作，必须走人工确认）。
 *
 * 为什么选这个任务（§2.1）：
 *   - 范围小：只碰一份稿件、一张表、一个规则集，涉及的数据量在几十条量级；
 *   - 结果**可检查**：总句数、问题数、待确认数都能由程序重算，
 *     模型写的数字对不对，一跑就知道，不依赖"看起来像"；
 *   - 与个人软件真实相关：「对白」的生成链路本来就要求"AI 产出必须经过程序校验
 *     或用户确认才能进入下一步"，质检 Agent 正是把这件事从"链路内固定步骤"
 *     扩展成"可以对话着做的巡检任务"。
 *
 * ★ 成功标准为什么由程序复核，而不是看模型怎么说 ★
 *   §2.3 明确要求"不能仅凭模型声称完成就判定成功"。这里的 check() 会：
 *     ① 重新打开数据库、重新跑一遍 lint（完全不看模型的中间输出）；
 *     ② 把重算出的四个数字与报告文件里出现的数字比对；
 *     ③ 若本次运行执行过写操作，再读一次数据库确认状态与工具返回一致。
 *   三步都过才判 completed。
 */

import fs from 'node:fs'
import path from 'node:path'

import { countPendingFlags, getLines, getParagraphs, getScript, openReadonly } from './db.mjs'
import { lintScript } from './lint.mjs'

export const REQUIRED_TOOLS = ['list_scripts', 'get_script', 'get_paragraphs', 'lint_script', 'write_report', 'set_line_confirmed']

export function makeQualityTask({ scriptId, baseline }) {
  return {
    id: 'quality-inspection',
    title: `稿件 #${scriptId} 质检与待确认处理`,
    scriptId,
    allowedTools: REQUIRED_TOOLS,
    goal: [
      `对稿件 #${scriptId} 做一次质检，并交出一份可复核的报告。`,
      '',
      '做法建议（顺序由你决定）：',
      '1) 用 list_scripts 或 get_script 看清这份稿件的文章归属、句数与待确认数；',
      '2) 用 get_paragraphs 拿到原文段落 —— 核对出处是否越界、台词里的数字有没有原文依据，都要用它；',
      '3) 用 lint_script 跑三类检查，拿到问题清单与统计数字；',
      '4) 用 write_report 把结论写成 data/reports/ 下的 Markdown 文件。',
      '   报告里**必须出现**这四个数字：总句数、仅可阅读元素的问题数、出处问题数、待人工确认数。',
      '   数字一律取自工具返回，不许估算。',
      '5) 报告里提到的"待确认"可疑处，请用 set_line_confirmed 把它们标记为已确认（这一步会请求人工确认）。',
      '   如果用户拒绝，就在报告里写明"未确认"，不要换别的方式绕过。'
    ].join('\n'),
    successCriteria: [
      '报告文件写在 data/reports/ 目录下，内容不少于 200 字符',
      '报告中出现的数字与程序重算得到的四个统计值完全一致（总句数 / 仅可阅读元素问题数 / 出处问题数 / 待人工确认数）',
      '若本次运行执行过 set_line_confirmed，数据库中的实际状态必须与该工具返回的结果一致'
    ],
    check: ({ toolResults, root, reportsDir, dbFile }) =>
      checkQuality({ scriptId, toolResults, root, reportsDir, dbFile, baseline })
  }
}

/** 用程序自己的路径重算事实（不看模型的任何中间输出） */
export function recomputeFacts({ dbFile, scriptId }) {
  const db = openReadonly(dbFile)
  try {
    const s = getScript(db, scriptId)
    if (!s) return { ok: false, reason: `稿件 #${scriptId} 不存在` }
    const lines = getLines(db, scriptId, 200)
    const paragraphs = getParagraphs(db, s.article_id)
    const lint = lintScript({ lines, paragraphs })
    return {
      ok: true,
      script: { id: s.id, article_id: s.article_id, line_count: s.line_count },
      total_lines: lint.total,
      issue_total: lint.issues.length,
      counts: lint.counts,
      stats: lint.stats,
      pending_flags: countPendingFlags(db, scriptId),
      issues: lint.issues
    }
  } finally {
    try {
      db.close()
    } catch {
      /* ignore */
    }
  }
}

/**
 * 从报告里取出"某个指标对应的数字"。
 *
 * 为什么不能简单地"抓标签后面 40 个字符里的第一个整数"：
 *   第一次就是这样做的，结果在"待人工确认项……第 8 句（line_id = 8）"这里抓到了 8，
 *   而报告其实写对了。所以现在分两级、并且**限制在同一行内**：
 *     ① 优先找"标签 + 分隔符（: ： | ｜）+ 数字" —— 表格与"指标：值"这类写法；
 *     ② 退一步找"标签 + 同行 ≤10 个非数字字符 + 数字"。
 *   跨行的匹配一律不接受：报告的分点很多，跨行必然误抓。
 */
function extractNumber(text, aliases) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const a of aliases) {
    const m = text.match(new RegExp(`${esc(a)}\\s*[:：|｜]\\s*[^\\d\\n]{0,12}?(\\d+)`))
    if (m) return Number(m[1])
  }
  for (const a of aliases) {
    const m = text.match(new RegExp(`${esc(a)}[^\\d\\n]{1,12}?(\\d+)`))
    if (m) return Number(m[1])
  }
  return null
}

/**
 * 成功标准复核。
 *
 * `baseline` 是**任务开始时**由程序记下的基线（见 scripts/agent-run.mjs）。
 * 为什么必须有基线：「待人工确认数」在 Agent 确认之后会变成 0，
 * 如果拿运行后的状态去核对，模型写"2"反而会被判错。
 * 报告描述的是"质检时看到的现状"，所以基准必须是开始时的快照。
 *
 * @returns {{ ok: boolean, reasons: string[], details: object }}
 */
export function checkQuality({ scriptId, toolResults, root, reportsDir, dbFile, baseline }) {
  const reasons = []
  const details = {}

  /* ① 报告文件必须真的存在 */
  const writes = (toolResults || []).filter((r) => r.tool === 'write_report' && r.result && r.result.path)
  if (!writes.length) {
    return { ok: false, reasons: ['没有调用 write_report 写出报告文件'], details: { writes: 0 } }
  }
  const last = writes[writes.length - 1].result
  const abs = path.resolve(root, last.path)
  const inWhitelist = abs.startsWith(path.resolve(reportsDir) + path.sep)
  details.report_path = last.path
  details.report_in_whitelist = inWhitelist
  if (!fs.existsSync(abs)) {
    return { ok: false, reasons: [`报告文件不存在：${last.path}`], details }
  }
  const text = fs.readFileSync(abs, 'utf8')
  details.report_chars = text.length
  if (!inWhitelist) reasons.push(`报告不在允许目录 data/reports/ 内：${last.path}`)
  if (text.length < 200) reasons.push(`报告内容过短（${text.length} 字符，要求 ≥ 200）`)

  /* ② 数字必须与基线一致，而且是**标签附近**的数字（防止"0"到处都能凑上） */
  const facts = baseline && baseline.ok ? baseline : recomputeFacts({ dbFile, scriptId })
  if (!facts.ok) return { ok: false, reasons: [...reasons, facts.reason], details }

  const expected = [
    ['总句数', ['总句数', '台词总数'], facts.total_lines],
    ['仅可阅读元素问题数', ['仅可阅读元素的问题数', '仅可阅读元素的', '仅可阅读', '可阅读元素'], facts.counts.readable],
    ['出处问题数', ['出处问题数', '出处有问题的', '出处'], facts.counts.source],
    ['待人工确认数', ['待人工确认数', '待人工确认', '待确认数', '待确认'], facts.stats.pending_confirm]
  ]
  details.expected = Object.fromEntries(expected.map(([k, , v]) => [k, v]))
  details.after = recomputeFacts({ dbFile, scriptId })

  const found = {}
  for (const [label, aliases, value] of expected) {
    const got = extractNumber(text, aliases)
    found[label] = got
    if (got === null) {
      reasons.push(`报告里找不到「${label}」这一项（或其同一行里没有数字）`)
    } else if (got !== value) {
      reasons.push(`「${label}」报告写 ${got}，程序重算为 ${value}`)
    }
  }
  details.numbers_found = found

  /* ③ 写操作的实际状态必须与工具返回一致（防"嘴上说改了"） */
  const confirmWrites = (toolResults || []).filter((r) => r.tool === 'set_line_confirmed' && r.result && r.result.after)
  if (confirmWrites.length) {
    const db = openReadonly(dbFile)
    try {
      const mismatches = []
      for (const w of confirmWrites) {
        const row = db.prepare('SELECT id, confirmed, flag FROM dialogue_lines WHERE id = ?').get(w.result.line_id)
        if (!row) {
          mismatches.push(`#${w.result.line_id} 已不存在`)
        } else if (row.confirmed !== w.result.after.confirmed) {
          mismatches.push(`#${w.result.line_id} 工具称 confirmed=${w.result.after.confirmed}，实际 ${row.confirmed}`)
        }
      }
      details.confirm_writes = confirmWrites.length
      if (mismatches.length) reasons.push(`数据库状态与工具返回不一致：${mismatches.join('；')}`)
    } finally {
      try {
        db.close()
      } catch {
        /* ignore */
      }
    }
  } else {
    details.confirm_writes = 0
  }

  return { ok: reasons.length === 0, reasons, details }
}
