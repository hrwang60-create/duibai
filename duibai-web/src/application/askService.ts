/**
 * 应用服务层 · 知识问答（实验5 的 RAG 链路接入应用）
 *
 * 职责：把 AI 能力层的 RAG 模块包装成"应用服务层的一等公民"——
 * 负责索引的加载与缓存、把模型调用异常翻译成本项目既有的 AppError 错误码、
 * 以及把完整的链路留证（检索片段、上下文、判定结果、引用检查）写进日志。
 *
 * 依赖方向：本文件 → ai（RAG 模块）。**不反向** —— RAG 模块不知道 HTTP、不知道 SQLite，
 * 所以命令行脚本（scripts/rag-ask.mjs）能复用它，页面与本接口也能复用同一份逻辑。
 */

import fs from 'node:fs'
import path from 'node:path'

import { ask } from '@/ai/rag/ask.mjs'
import { loadIndex } from '@/ai/rag/store.mjs'
import { AppError } from '@/domain/errors'
import { logger } from '@/infrastructure/logger'

const INDEX_FILE = path.join(process.cwd(), 'data', 'kb', 'index.json')

/** 索引只加载一次（几十 KB，进程级缓存；资料更新后需重启服务或重新构建索引） */
let cached: any = null

function getIndex(): any {
  if (cached) return cached
  if (!fs.existsSync(INDEX_FILE)) {
    throw new AppError(
      'INTERNAL_ERROR',
      '知识库索引不存在',
      '请先在 duibai-web 目录执行 `npm run kb:import` 与 `npm run kb:build` 生成索引'
    )
  }
  cached = loadIndex(INDEX_FILE)
  logger.info('ask', '知识库索引已加载', {
    chunks: cached.chunks?.length,
    sources: cached.sources?.length,
    embed_model: cached.stats?.embed_model
  })
  return cached
}

/**
 * 模型调用异常 → 本项目错误码。
 *
 * 这一步不能省：AI 能力层抛出的是它自己的错误分类（MODEL_TIMEOUT 等），
 * 而接口层与页面认识的是实验3 表12 定义的那套错误码。
 * 不翻译的话，用户会看到一句 "fetch failed"，与本项目"每个错误都要有原因和下一步"
 * 的约定冲突。
 */
function toAppError(e: any): AppError {
  const code = e?.code
  switch (code) {
    case 'MODEL_TIMEOUT':
      return new AppError('MODEL_TIMEOUT', '模型响应超时', '请稍后重试；知识库与索引都不受影响')
    case 'MODEL_CONNECTION':
    case 'MODEL_HTTP_ERROR':
      return new AppError('MODEL_OUTPUT_INVALID', `模型服务调用失败：${e.message}`, '请检查网络与密钥配置后重试')
    case 'MODEL_OUTPUT_INVALID':
      return new AppError('MODEL_OUTPUT_INVALID', `模型返回内容无法解析：${e.message}`, '请稍后重试')
    case 'MODEL_NOT_CONFIGURED':
      return new AppError(
        'INTERNAL_ERROR',
        '未配置 DEEPSEEK_API_KEY',
        '请在 duibai-web/.env.local 里填写 DEEPSEEK_API_KEY（可参考 .env.example）后重启服务'
      )
    default:
      return new AppError('INTERNAL_ERROR', '问答链路出现未预期异常', '请查看服务端日志定位')
  }
}

export interface AskResult {
  question: string
  mode: string
  version: string
  insufficient: boolean | null
  insufficient_by: string | null
  answer: string
  citations: any
  judge: any
  retrieval: any
  context: { chunks: any[]; chars: number; est_tokens: number }
  pruned: any
  model: string | null
  usage: any
  total_ms: number
  calls: any[]
}

/**
 * 一次问答。
 * @param input.question 用户问题
 * @param input.mode     'rag'（默认）| 'direct'
 * @param input.version  RAG 组的 Prompt 版本：'v2'（默认）| 'v1'
 * @param input.k        Top-k，默认 4
 */
export async function answerQuestion(input: {
  question: string
  mode?: 'rag' | 'direct'
  version?: 'v1' | 'v2'
  k?: number
}): Promise<AskResult> {
  const question = String(input.question || '').trim()
  if (!question) {
    throw new AppError('BAD_REQUEST', '问题不能为空', '请输入一个关于「对白」软件的问题')
  }
  if (question.length > 300) {
    throw new AppError('BAD_REQUEST', '问题过长（上限 300 字）', '请把问题缩短后再提问')
  }

  let res: any
  try {
    res = await ask({
      question,
      index: input.mode === 'direct' ? undefined : getIndex(),
      mode: input.mode || 'rag',
      version: input.version || 'v2',
      k: input.k || 4,
      root: process.cwd()
    })
  } catch (e) {
    const appErr = toAppError(e)
    logger.error('ask', '问答失败', {
      question,
      code: appErr.code,
      reason: appErr.reason,
      err: e instanceof Error ? e.message : String(e)
    })
    throw appErr
  }

  // 链路留证：检索片段、实际上下文、最终回答、引用检查都进日志（实验5 §2.4 要求可复查）
  logger.info('ask', '问答完成', {
    question,
    mode: res.mode,
    version: res.version,
    model_called: res.model_called,
    insufficient: res.insufficient,
    insufficient_by: res.insufficient_by,
    topk: res.retrieval?.topk?.map((r: any) => r.id) || [],
    context_chunks: res.context?.chunks?.map((c: any) => c.id) || [],
    context_chars: res.context?.chars,
    citations: res.citations?.cited || [],
    citations_ok: res.citations?.ok,
    total_ms: res.total_ms,
    tokens: res.usage?.total_tokens ?? null
  })

  return {
    question: res.question,
    mode: res.mode,
    version: res.version,
    insufficient: res.insufficient,
    insufficient_by: res.insufficient_by,
    answer: res.answer,
    citations: res.citations,
    judge: res.judge
      ? {
          coverage: res.judge.coverage,
          can_answer: res.judge.can_answer,
          reason: res.judge.reason,
          missing: res.judge.missing
        }
      : null,
    retrieval: res.retrieval,
    context: {
      chunks: res.context.chunks,
      chars: res.context.chars,
      est_tokens: res.context.est_tokens
    },
    pruned: res.pruned,
    model: res.model,
    usage: res.usage,
    total_ms: res.total_ms,
    calls: res.calls
  }
}

/** 供页面展示知识库概况（用了哪些资料、切了多少片段） */
export function getKbSummary() {
  // 这里不抛错：目录页只想展示概况，索引缺失时返回空壳并如实标记
  try {
    const idx = getIndex()
    return {
      ready: true,
      sources: idx.sources.map((s: any) => ({
        id: s.id,
        title: s.title,
        origin_path: s.origin_path,
        chars: s.chars,
        chunks: s.chunks,
        sha256: s.sha256?.slice(0, 12),
        covers: s.covers
      })),
      stats: idx.stats
    }
  } catch {
    return { ready: false, sources: [], stats: null }
  }
}
