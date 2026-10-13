/**
 * AI 能力层 · RAG 环节五：最小链路（问题输入 → 检索 → 上下文组织 → 模型调用 → 回答返回）
 *
 * 这是实验5 §2.6 要求"整理为可调用的模块"的那个模块。依赖与调用方式写在这里：
 *
 *   依赖：retrieve.mjs（检索）、prompt.mjs（Prompt 与上下文）、
 *        llm/deepseek.mjs（模型调用）、store.mjs（索引）
 *   输入：{ question, index, mode, version, history, k, root, params }
 *   输出：见 ask() 的返回值注释 —— 包含**检索片段、实际上下文、最终回答**三份留证材料
 *   失败：抛出 ModelError（code ∈ MODEL_TIMEOUT / MODEL_CONNECTION /
 *        MODEL_HTTP_ERROR / MODEL_OUTPUT_INVALID / MODEL_NOT_CONFIGURED），
 *        调用方据此转成 504 / 502 / 500；**"资料不足"不是失败，是正常返回**。
 *
 * 流程分三级，每级各司其职：
 *
 *   ① 检索        —— 混合检索（向量 + BM25 → RRF），取 Top-k
 *   ② 判定        —— 程序只判"内容词完全无覆盖"这一种（省钱且不会判错）；
 *                    其余交给一次独立的**模型判定调用**（理由见 retrieve.mjs 末尾的实测记录）
 *   ③ 生成        —— 依据判定通过的片段生成带出处的回答
 *
 * ② 之所以单独做成一次调用而不是塞进 ③：判定结果要能单独记录与统计准确率，
 * 否则"答错了"这件事分不清是检索错了、判定错了，还是生成错了。
 */

import { chat } from '../llm/deepseek.mjs'
import {
  buildJudgeMessages,
  buildQaMessages,
  composeContext,
  contextSources,
  messagesStat,
  parseJudgeJSON,
  pruneChunks,
  renderInput
} from './prompt.mjs'
import { describeRow, retrieve } from './retrieve.mjs'
import { estimateTokens } from './token.mjs'

/** 程序判定为"资料不足"时的固定回复（不经过模型，措辞固定、可断言） */
export const INSUFFICIENT_ANSWER =
  '现有资料中没有相关信息。\n' +
  '依据：问题的关键词在知识库中没有被任何资料片段覆盖，因此不给出答案，也不用资料之外的知识补充。\n' +
  '说明：本助手只回答「对白」软件自身的设计与使用问题。'

/**
 * 模型判定为"资料不足"时的回复。
 *
 * 措辞上刻意做成**追问**，而不是一句"我不知道"——因为落到这一支的其实是两类问题：
 *   - 知识库确实没有该话题（如"订阅价格是多少"）；
 *   - 知识库有相关内容，但用户的问题缺必要信息（如"为什么我生成不了音频"，
 *     而可能的成因有表格公式占比过高 422、存在未确认项 409、语音服务不可用 503 三种）。
 * 两类都适合"说明缺什么 + 请补充信息"这个回应，而不是硬猜一个原因。
 */
export function insufficientByJudge(missing, reason) {
  return [
    '现有资料中没有相关信息。',
    `依据：${reason || '检索到的资料片段主题相关，但不包含回答问题所需的事实。'}`,
    missing ? `缺少的信息：${missing}` : '',
    '说明：本助手只回答「对白」软件自身的设计与使用问题，不会用资料之外的知识补答。' +
      '如果这是你在使用软件时遇到的问题，请补充你看到的提示文案或所处的步骤，我再据此回答。'
  ]
    .filter(Boolean)
    .join('\n')
}

/** 从回答里抽出引用编号，并与给定上下文对照，判断引用是否可靠 */
export function checkCitations(answer, chunks) {
  const valid = new Set(chunks.map((c) => c.id))
  const found = [...String(answer).matchAll(/\[([A-Za-z]{1,3}\d*-C\d{2,3})\]/g)].map((m) => m[1])
  const uniq = [...new Set(found)]
  const invalid = uniq.filter((id) => !valid.has(id))
  const uncited = [...valid].filter((id) => !uniq.includes(id))
  return {
    cited: uniq,
    invalid,      // 编造的编号 —— 引用不可靠的直接证据
    uncited,      // 给了资料却没有用上
    ok: invalid.length === 0,
    coverage: valid.size ? Number(((valid.size - uncited.length) / valid.size).toFixed(2)) : 0
  }
}

/**
 * 执行一次问答。
 *
 * @param {{
 *   question: string,
 *   index?: object,                 // RAG 模式必填；用 loadIndex() 得到
 *   mode?: 'rag'|'direct',
 *   version?: 'v1'|'v2',            // RAG 模式的 Prompt 版本（默认 v2）
 *   history?: Array,                // 多轮历史（按需）
 *   k?: number,                     // Top-k，默认 4
 *   prune?: boolean,                // 是否做上下文精简，默认 true
 *   judge?: boolean,                // 是否启用模型判定环节，默认 true
 *   root?: string, apiKey?: string, params?: object, quiet?: boolean
 * }} input
 */
export async function ask(input) {
  const t0 = Date.now()
  const mode = input.mode || 'rag'
  const question = String(input.question || '').trim()
  if (!question) throw new Error('question 不能为空')

  /* ══════════ 直接模型组：不检索，直接把问题交给模型 ══════════ */
  if (mode === 'direct') {
    const messages = buildQaMessages({ question, version: 'direct', history: input.history })
    const r = await chat(messages, {
      root: input.root,
      apiKey: input.apiKey,
      params: input.params,
      quiet: input.quiet
    })
    return {
      ok: true,
      mode,
      version: 'direct',
      question,
      model_called: true,
      insufficient: null,          // 直接组没有检索，无从判断资料是否足够
      insufficient_by: null,
      judge: null,
      retrieval: null,
      context: { chunks: [], chars: 0, est_tokens: 0, text: '' },
      pruned: { before: 0, after: 0, removed: [] },
      answer: r.text,
      citations: null,
      input: { messages, ...messagesStat(messages) },
      input_rendered: renderInput(messages),
      model: r.model,
      usage: r.usage,
      attempts: r.attempts,
      request_id: r.request_id,
      ms: r.ms,
      total_ms: Date.now() - t0,
      calls: [{ stage: 'answer', model: r.model, usage: r.usage, ms: r.ms, attempts: r.attempts }]
    }
  }

  /* ══════════════════════════ RAG 组 ══════════════════════════ */
  const version = input.version || 'v2'
  const ret = retrieve(input.index, question, { k: input.k })

  const base = {
    ok: true,
    mode,
    version,
    question,
    retrieval: {
      k: ret.k,
      strong_insufficient: ret.strong_insufficient,
      max_coverage: ret.max_coverage,
      profile: ret.profile,
      reason: ret.reason,
      stats: ret.stats,
      topk: ret.topk.map(describeRow),
      candidates_top5: ret.candidates.slice(0, 5).map(describeRow)
    }
  }

  // —— ①程序强判"资料不足" → 直接返回，不调用模型 ——
  if (ret.strong_insufficient) {
    return {
      ...base,
      model_called: false,
      insufficient: true,
      insufficient_by: 'program',
      judge: null,
      context: { chunks: [], chars: 0, est_tokens: 0, text: '' },
      pruned: { before: 0, after: 0, removed: [] },
      answer: INSUFFICIENT_ANSWER,
      citations: { cited: [], invalid: [], uncited: [], ok: true, coverage: 0 },
      input: null,
      input_rendered: '(程序强判资料不足，未调用模型)',
      model: null,
      usage: null,
      attempts: 0,
      request_id: null,
      ms: 0,
      total_ms: Date.now() - t0,
      calls: []
    }
  }

  // —— 上下文精简：去重 + 去掉覆盖度过低的片段（把覆盖度带到片段上供其判断）——
  const doPrune = input.prune !== false
  const candidates = ret.topk.map((r) => ({ ...r.chunk, cov: r.idfcov }))
  const { kept, removed } = doPrune
    ? pruneChunks(candidates, question)
    : { kept: candidates, removed: [] }
  const useChunks = kept.length ? kept : candidates
  const contextText = composeContext(useChunks)
  const contextBlock = {
    chunks: contextSources(useChunks),
    chars: contextText.length,
    est_tokens: estimateTokens(contextText),
    text: contextText
  }
  const prunedBlock = {
    before: candidates.length,
    after: useChunks.length,
    removed: removed.map((c) => ({ id: c.id, reason: c.reason, detail: c.detail }))
  }

  const calls = []

  // —— ② 模型判定：这些片段能不能回答问题 ——
  let judge = null
  if (input.judge !== false) {
    const jm = buildJudgeMessages({ question, chunks: useChunks })
    const jr = await chat(jm, {
      root: input.root,
      apiKey: input.apiKey,
      params: input.params,
      json: true,
      quiet: input.quiet
    })
    judge = { ...parseJudgeJSON(jr.text), ms: jr.ms, usage: jr.usage, model: jr.model, raw: jr.text }
    calls.push({ stage: 'judge', model: jr.model, usage: jr.usage, ms: jr.ms, attempts: jr.attempts })
    if (judge.coverage === 'none') {
      return {
        ...base,
        model_called: true,
        insufficient: true,
        insufficient_by: 'model',
        judge,
        context: contextBlock,
        pruned: prunedBlock,
        answer: insufficientByJudge(judge.missing, judge.reason),
        citations: { cited: [], invalid: [], uncited: useChunks.map((c) => c.id), ok: true, coverage: 0 },
        input: { messages: jm, ...messagesStat(jm) },
        input_rendered: renderInput(jm),
        model: jr.model,
        usage: jr.usage,
        attempts: jr.attempts,
        request_id: jr.request_id,
        ms: jr.ms,
        total_ms: Date.now() - t0,
        calls
      }
    }
  }

  // —— ③ 依据片段生成带出处的回答；判定为 partial 时把"资料缺口"一并写进输入 ——
  const messages = buildQaMessages({
    question,
    chunks: useChunks,
    version,
    history: input.history,
    gaps: judge && judge.coverage === 'partial' ? judge.missing : ''
  })
  const r = await chat(messages, {
    root: input.root,
    apiKey: input.apiKey,
    params: input.params,
    quiet: input.quiet
  })
  calls.push({ stage: 'answer', model: r.model, usage: r.usage, ms: r.ms, attempts: r.attempts })

  return {
    ...base,
    model_called: true,
    insufficient: false,
    insufficient_by: null,
    judge,
    context: contextBlock,
    pruned: prunedBlock,
    answer: r.text,
    citations: checkCitations(r.text, useChunks),
    input: { messages, ...messagesStat(messages) },
    input_rendered: renderInput(messages),
    model: r.model,
    usage: r.usage,
    attempts: r.attempts,
    request_id: r.request_id,
    ms: r.ms,
    total_ms: Date.now() - t0,
    calls
  }
}

/** 精简后实际进入上下文的片段数（导出以便调用方核对） */
export function contextSize(res) {
  return res?.context?.chunks?.length ?? 0
}

export { describeRow }
