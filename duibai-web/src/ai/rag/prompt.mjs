/**
 * AI 能力层 · RAG 环节四：Prompt 与上下文组织（实验5 §2.2 的核心）
 *
 * 本文件做四件事，对应 §2.2 的四条要求：
 *   1. 区分**任务要求**（system，常量）与**用户问题**（user，变量）；
 *   2. 固定**回答格式**，并明确**信息不足时怎么处理**；
 *   3. 把**检索资料与来源编号**插进上下文（RAG 之后才有的部分），
 *      多轮对话按需把历史消息加入；
 *   4. 保留 **v1 → v2 两个版本**，让"改了什么、结果怎么变"可以被对照（§2.2 第二条）。
 *
 * 一条设计原则贯穿全文：**格式要求写进 system，资料写进 user**。
 * 把资料混进 system 会让"任务要求"随资料一起变长，模型对约束的注意力被稀释，
 * 实测 v1 就是这么把"不要编造"这条挤没的（见 §2.2 的修改记录）。
 */

import { estimateTokens } from './token.mjs'

/* ------------------------------------------------------- 检索资料的编号化 */

/**
 * 片段的"节路径"用于展示。切分时 section 是以文档标题开头的完整路径，
 * 而展示时前面已经写了「来源：<文档标题>」，直接拼接会出现
 * "「对白」数据与接口设计 › 「对白」数据与接口设计 › 2.4 …" 这种重复。
 */
export function shortSection(c) {
  let s = String(c.section || '')
  if (c.source_title && s.startsWith(c.source_title)) {
    s = s.slice(c.source_title.length).replace(/^\s*›\s*/, '')
  }
  return s || c.source_title || ''
}

/**
 * 把检索片段渲染成带编号的上下文。
 *
 * 编号格式 `[S1-C03]`：S 编号对应资料文件，C 编号对应片段序号。
 * 用户看到回答里的 `[S1-C03]` 就能反查到"这是哪份资料的哪一段"（实验5 §2.4
 * 要求的"检查引用是否对应原片段"）。
 */
export function composeContext(chunks) {
  return chunks
    .map((c) => `[${c.id}]（来源：${c.source_title}${shortSection(c) ? ' › ' + shortSection(c) : ''}）\n${c.text}`)
    .join('\n\n')
}

/** 上下文里每条的来源清单，随回答一起返回，供界面"查看出处"使用 */
export function contextSources(chunks) {
  return chunks.map((c) => ({
    id: c.id,
    source_id: c.source_id,
    source_title: c.source_title,
    section: c.section,
    section_short: shortSection(c),
    chars: c.chars,
    text: c.text
  }))
}

/* --------------------------------------------------- 上下文精简（§2.2 第三、四条） */

/**
 * 精简进入模型的检索片段：去重 + 去掉覆盖度过低的片段。
 *
 * ⚠️ 实测结论（如实记录）：**在本知识库上这一步几乎不会删掉东西。**
 *   最初写的是"剔除与问题零词项重合的片段"，但实测在 5 个问题上、
 *   k=6 与 k=8 两种设置下**每次都剔掉 0 条** —— 原因是中文二元组会让
 *   任意两段中文文本至少共享若干常见二元组，"零重合"这个条件几乎不可能成立。
 *   改成"覆盖度低于下限"后仍然很少触发，因为检索阶段已经用覆盖度筛过一遍。
 *
 *   所以本次真正有效的"上下文精简"是**人工检查后下调 Top-k**
 *   （见实验5 §2.2 的证据：k=8 → k=4，输入减少约 40%），
 *   本函数只承担"自动能做的部分"，不夸大它的作用。
 *
 * @returns {{ kept: Array, removed: Array }}
 */
export const PRUNE_COV_FLOOR = 0.05

export function pruneChunks(chunks, question, opts = {}) {
  const floor = opts.floor ?? PRUNE_COV_FLOOR
  const seen = new Set()
  const kept = []
  const removed = []

  for (const c of chunks) {
    if (seen.has(c.id)) {
      removed.push({ ...c, reason: 'duplicate', detail: `编号 ${c.id} 已在上下文里` })
      continue
    }
    // 覆盖度由调用方（retrieve）挂在片段上；没有这个字段时不做覆盖度判断
    const cov = typeof c.cov === 'number' ? c.cov : null
    if (cov !== null && cov < floor && chunks.length > 1) {
      removed.push({ ...c, reason: 'low_coverage', detail: `内容词覆盖度 ${cov.toFixed(3)} 低于 ${floor}` })
      continue
    }
    seen.add(c.id)
    kept.push(c)
  }
  // 全被剔掉时回退（宁可多给一段，也不要让模型手上没有资料）
  if (!kept.length) return { kept: chunks.slice(), removed: [] }
  return { kept, removed }
}

/* -------------------------------------------------------------- Prompt 版本 */

/**
 * v1 —— 初版：把资料和问题一起塞给模型，没提引用，也没说"资料不足怎么办"。
 * 保留它的意义：它是被实测否掉的版本，写进报告才有说服力。
 */
export const PROMPT_V1 = {
  id: 'v1',
  label: '初版',
  system: ['你是「对白」软件的使用助手，请根据资料回答用户的问题。回答尽量简洁。'].join('\n'),
  user: ({ context, question }) => `资料：\n${context}\n\n问题：${question}`
}

/**
 * v2 —— 修订版：四组改动，全部针对 v1 实测暴露的问题
 *   ① 任务要求与用户问题分离（要求进 system，资料进 user）；
 *   ② 固定回答格式：先结论、后依据，逐条列出来源编号；
 *   ③ 明确"资料不足"处理：直说资料里没有，并指出缺什么，不得用资料外的知识补；
 *   ④ 明确"资料之间冲突"处理：并列两边说法并标出各自来源，不替用户选一个。
 */
export const PROMPT_V2 = {
  id: 'v2',
  label: '修订版',
  system: [
    '你是「对白」软件的使用助手。',
    '',
    '任务要求：',
    '1. 只依据【检索资料】回答，禁止使用资料之外的知识、常识或推测；',
    '2. 回答格式固定为两段：',
    '   第一段「结论」——直接回答问题，1–3 句；',
    '   第二段「依据」——逐条列出支撑结论的资料编号，每条一行，格式 `- [S1-C03] 该条说了什么`；',
    '3. 每一个事实性表述后面必须紧跟其来源编号，编号必须**原文照抄**自检索资料，不得自己编造；',
    '4. 若检索资料不足以回答问题，直接回答「现有资料中没有相关信息」，并说明还缺哪一类信息；',
    '   不要用资料之外的知识补充，也不要猜测；',
    '5. 若资料之间说法不一致，把两种说法并列写出并各自标注来源，不要替用户选择一个；',
    '6. 若用户的问题缺少必要信息（例如没有说明是哪个页面、哪条报错、哪种操作），',
    '   先指出需要补充什么，再就现有信息给出可能的几种情况；',
    '7. 与本软件使用无关的请求（写作、翻译、闲聊等），回答「这不在我能回答的范围内」，并说明本助手只回答本软件的使用问题。'
  ].join('\n'),
  user: ({ context, question }) =>
    ['【检索资料】', context, '', '【用户问题】', question, '', '请按上述格式与要求回答。'].join('\n')
}

/**
 * 直接模型组：与 RAG 组**同模型、同参数、同回答格式**，
 * 唯一差异是**不提供检索资料、不要求引用来源** —— 这样两组的差异才能归因到"有没有资料"，
 * 而不是归因到提示词写法（实验5 §2.5 第二条）。
 *
 * 因此下面这段 system 与 PROMPT_V2.system 逐条对齐：第 1 条换成"用自己的知识"，
 * 第 3 条去掉引用要求，第 4 条换成"不确定就说不确定"。
 * 第 2、5、6、7 条**故意保持不变** —— 否则就变成"顺便把提示词也改了"。
 */
export const PROMPT_DIRECT = {
  id: 'direct',
  label: '直接模型组',
  system: [
    '你是「对白」软件的使用助手。',
    '',
    '任务要求：',
    '1. 依据你自己的知识回答；',
    '2. 回答格式固定为两段：',
    '   第一段「结论」——直接回答问题，1–3 句；',
    '   第二段「依据」——逐条列出支撑结论的理由，每条一行；',
    '3. 不需要标注来源；',
    '4. 若你不确定答案，直接回答「我不确定」，不要编造；',
    '5. 若资料之间说法不一致，把两种说法并列写出，不要替用户选择一个；',
    '6. 若用户的问题缺少必要信息（例如没有说明是哪个页面、哪条报错、哪种操作），',
    '   先指出需要补充什么，再就现有信息给出可能的几种情况；',
    '7. 与本软件使用无关的请求（写作、翻译、闲聊等），回答「这不在我能回答的范围内」，并说明本助手只回答本软件的使用问题。'
  ].join('\n'),
  user: ({ question }) => ['【用户问题】', question, '', '请按上述格式与要求回答。'].join('\n')
}

export const QA_PROMPTS = { v1: PROMPT_V1, v2: PROMPT_V2 }

/* ------------------------------------------------ 相关性判定（模型判断环节） */

/**
 * 判定用的 Prompt：判断"这些资料能回答到什么程度"，不回答业务问题。
 *
 * 为什么要有这一环（实验5 §2.4 "返回片段不代表资料相关"）：
 *   检索一定有返回 —— 一个几十条片段的知识库，任何问题都能排出前 4 名。
 *   但"排在前 4"不等于"能回答"。程序侧试了三次都判不出来（见 retrieve.mjs 末尾），
 *   所以这里如实采用**模型判断**，并且把它单独做成一次调用：
 *   好处是判定结果可单独记录、可单独统计准确率，出了问题能定位到是"检索错了"
 *   还是"判定错了"，而不是混在回答里分不清。
 *
 * ★ 输出用三档而不是布尔值（这是实测逼出来的修正）★
 *   第一版只输出 true/false。实测发现它对**多要素问题**过于严格：
 *   "从上传到播放要经过哪些环节、哪几处会打断流程"这种问题，
 *   资料其实答得出一半，但只要有一小部分没有，就判 false → 整题拒答。
 *   改成三档之后：full 照答、partial 照答但要说明缺口、none 才拒答。
 *   partial 档同时把"缺什么"传给回答环节（见 buildQaMessages 的 gaps 参数），
 *   这样回答里会主动交代"资料未覆盖的部分"，而不是假装全都知道。
 */
export const PROMPT_JUDGE = {
  id: 'judge',
  label: '相关性判定',
  system: [
    '你是检索质量判定器。用户会给你一个问题和若干条检索到的资料。',
    '你的唯一任务是判断：**仅凭这些资料**，能把这个问题回答到什么程度。',
    '',
    '输出三档之一：',
    '  full    —— 资料直接包含回答问题所需的全部事实；',
    '  partial —— 资料包含**部分**答案（例如只覆盖了问题中的一部分子问题，或只给出了部分要点），',
    '             其余部分资料里没有；',
    '  none    —— 资料里没有回答该问题所需的事实（主题相关、词语重合但答不出，也算 none）。',
    '',
    '判定要求：',
    '1. 不要用你自己的知识判断"应该是什么"，只看资料里写没写；',
    '2. 资料内部互相矛盾时，判 partial，并在 missing 里说明矛盾点；',
    '3. 问题本身缺少必要信息（例如没说是哪个页面、哪条报错）时，',
    '   若资料给出了若干种可能情况，判 partial；若资料完全没涉及，判 none。',
    '',
    '只输出 JSON，不要输出任何解释文字：',
    '{"coverage": "full" | "partial" | "none", "missing": "资料里缺的那部分是什么；full 时填空字符串", "reason": "一句话理由"}'
  ].join('\n'),
  user: ({ context, question }) =>
    ['【用户问题】', question, '', '【检索资料】', context].join('\n')
}

/** 解析判定结果。JSON 不合规时按 partial 处理 —— 宁可多答一次并注明不确定，也不要误拒 */
export function parseJudgeJSON(text) {
  const pick = (s) => {
    try {
      return JSON.parse(s)
    } catch {
      const m = String(s).match(/```(?:json)?\s*([\s\S]*?)```/)
      if (!m) return null
      try {
        return JSON.parse(m[1])
      } catch {
        return null
      }
    }
  }
  const obj = pick(text)
  const VALID = ['full', 'partial', 'none']
  // 兼容模型偶尔仍返回布尔值的旧格式
  let coverage = obj && typeof obj.coverage === 'string' ? obj.coverage.toLowerCase() : null
  if (!coverage && obj && typeof obj.can_answer === 'boolean') coverage = obj.can_answer ? 'full' : 'none'
  if (!VALID.includes(coverage)) {
    return {
      coverage: 'partial',
      can_answer: true,
      missing: '',
      reason: `判定输出无法解析，按 partial 处理：${String(text).slice(0, 80)}`,
      parsed: false
    }
  }
  return {
    coverage,
    can_answer: coverage !== 'none',
    missing: String(obj.missing || ''),
    reason: String(obj.reason || ''),
    parsed: true
  }
}

export function buildJudgeMessages({ question, chunks }) {
  return [
    { role: 'system', content: PROMPT_JUDGE.system },
    { role: 'user', content: PROMPT_JUDGE.user({ context: composeContext(chunks), question }) }
  ]
}

/**
 * 组装一次问答的完整输入。
 *
 * @param {{question:string, chunks?:Array, version?:'v1'|'v2'|'direct',
 *          history?:Array<{role:string,content:string}>, gaps?:string}} input
 *        `gaps` 是判定环节发现的"资料里缺的部分"，会被明确写进 user 段 ——
 *        这是上下文工程的一部分：与其让模型自己猜哪里没依据，不如直接告诉它。
 * @returns {Array<{role:string,content:string}>}
 */
export function buildQaMessages(input) {
  const version = input.version || 'v2'
  const tpl =
    version === 'direct' ? PROMPT_DIRECT : QA_PROMPTS[version] || PROMPT_V2

  const context = input.chunks?.length ? composeContext(input.chunks) : ''
  const msgs = [{ role: 'system', content: tpl.system }]

  // 多轮对话：历史消息按需插入（§2.2 第三条）。历史在 system 之后、本轮 user 之前。
  for (const h of input.history || []) {
    if (h && typeof h.content === 'string' && (h.role === 'user' || h.role === 'assistant')) {
      msgs.push({ role: h.role, content: h.content })
    }
  }

  if (version === 'direct') {
    msgs.push({ role: 'user', content: tpl.user({ question: input.question }) })
    return msgs
  }

  const gapBlock = input.gaps
    ? `\n\n【已知的资料缺口】${input.gaps}\n（回答时请在「依据」之后用一行说明这部分资料未覆盖，不要用你自己的知识补上。）`
    : ''
  msgs.push({
    role: 'user',
    content: tpl.user({ context, question: input.question }) + gapBlock
  })
  return msgs
}

/** 输入的规模统计（用于 §2.2 "比较长度与回答变化"与 §2.5 的 Token 记录） */
export function messagesStat(messages) {
  const chars = messages.reduce((n, m) => n + m.content.length, 0)
  return {
    count: messages.length,
    chars,
    est_tokens: messages.reduce((n, m) => n + estimateTokens(m.content), 0)
  }
}

/** 把完整输入渲染成报告用的可读文本 */
export function renderInput(messages) {
  return messages
    .map((m) => `──── role=${m.role}（${m.content.length} 字符）────\n${m.content}`)
    .join('\n\n')
}
