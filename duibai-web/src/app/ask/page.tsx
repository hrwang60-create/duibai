'use client'

/**
 * 表现层 · 知识问答页（实验5 §2.6 要求的"页面入口"）
 *
 * 演示"从输入问题到显示回答与出处"的完整过程。页面上把链路的每一段都摊开：
 *   ① 检索：Top-k 片段、排序依据（RRF / 覆盖度 / 余弦 / 名次）
 *   ② 判定：程序强判还是模型判定，判定理由
 *   ③ 上下文：真正发给模型的片段与长度
 *   ④ 回答：正文 + 引用编号 + 引用有效性检查
 * 把它做成"看得见链路"的页面，而不是只给一个答案气泡 —— 这是本实验要证明的东西。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface KbSource {
  id: string
  title: string
  origin_path: string
  chars: number
  chunks: number
  covers: string
}
interface KbSummary {
  ready: boolean
  sources: KbSource[]
  stats: { chunks: number; chars: number; avg_chars: number; embed_model: string } | null
}
interface Row {
  id: string
  section: string
  rrf: number
  vec: number
  idfcov: number
  rank_vec: number
  rank_bm25: number
  chars: number
}
interface AskResult {
  question: string
  mode: string
  version: string
  insufficient: boolean | null
  insufficient_by: string | null
  answer: string
  citations: { cited: string[]; invalid: string[]; uncited: string[]; ok: boolean; coverage: number } | null
  judge: { coverage: 'full' | 'partial' | 'none'; can_answer: boolean; reason: string; missing: string } | null
  retrieval: {
    reason: string
    max_coverage: number
    stats: { scanned: number; with_overlap: number }
    topk: Row[]
  } | null
  context: { chunks: { id: string; source_title: string; section_short: string; chars: number; text: string }[]; chars: number; est_tokens: number }
  model: string | null
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null
  total_ms: number
  calls: { stage: string; ms: number; usage?: { total_tokens?: number } }[]
}

const SAMPLES = [
  '「对白」一共提供哪几种口吻？',
  '语音合成服务不可用的时候，系统会怎么处理？',
  '从上传文章到听到音频，中间要经过哪些环节？',
  '文章以表格和公式为主时会怎么处理？',
  '为什么我生成不了音频？',
  '「对白」的订阅价格是多少？'
]

export default function AskPage() {
  const [kb, setKb] = useState<KbSummary | null>(null)
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'rag' | 'direct'>('rag')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<AskResult | null>(null)
  const [err, setErr] = useState<{ error: string; reason: string; suggestion: string } | null>(null)

  useEffect(() => {
    fetch('/api/ask', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setKb(j.data))
      .catch(() => setKb(null))
  }, [])

  /**
   * 支持 `?q=问题&auto=1`：把一次提问变成可分享的链接，也便于自动截图取证。
   * 只做一次（ref 守卫），否则 React 严格模式下的二次挂载会重复提问、白花 token。
   */
  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current) return
    const sp = new URLSearchParams(window.location.search)
    const initial = sp.get('q')
    const m = sp.get('mode') === 'direct' ? 'direct' : 'rag'
    if (sp.get('mode') === 'direct') setMode('direct')
    if (initial) {
      autoRan.current = true
      setQ(initial)
      if (sp.get('auto') === '1') run(initial, m)
    }
    // run 由 mode 派生，这里只在挂载时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = useCallback(
    async (question: string, m: 'rag' | 'direct' = mode) => {
      if (!question.trim()) return
      setBusy(true)
      setErr(null)
      setRes(null)
      try {
        const r = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, mode: m, k: 4 })
        })
        const j = await r.json()
        if (!r.ok) throw new Error(JSON.stringify(j))
        setRes(j.data)
      } catch (e) {
        try {
          const parsed = JSON.parse((e as Error).message)
          setErr(parsed)
        } catch {
          setErr({ error: 'INTERNAL_ERROR', reason: (e as Error).message, suggestion: '请查看服务端日志' })
        }
      } finally {
        setBusy(false)
      }
    },
    [mode]
  )

  return (
    <div className="wrap">
      <div className="topbar">
        <b>「对白」· 知识问答</b>
        <span className="hint" style={{ marginLeft: 12 }}>
          RAG 最小链路演示（实验5）
        </span>
        <a className="linkbtn" href="/" style={{ marginLeft: 'auto' }}>
          返回首页
        </a>
      </div>

      <div className="hero">
        <h1>问一问「对白」自己的资料</h1>
        <p className="hint">
          回答只依据下面这份知识库，逐句标注来源编号；资料里没有的，直接说没有，不用模型自己的知识补答。
        </p>
      </div>

      {kb && (
        <div className="panel">
          <div className="sec-head">
            知识库（{kb.ready ? `${kb.sources.length} 份资料 / ${kb.stats?.chunks} 个片段 / 平均 ${kb.stats?.avg_chars} 字符` : '索引未生成' }）
          </div>
          {kb.ready ? (
            <>
              <div className="kv">
                {kb.sources.map((s) => (
                  <div key={s.id} className="row">
                    <span className="tag">{s.id}</span>
                    <b>{s.title}</b>
                    <span className="hint">
                      {s.chars} 字符 → {s.chunks} 个片段 · 来源 {s.origin_path}
                    </span>
                    <div className="hint" style={{ width: '100%' }}>
                      {s.covers}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hint">
                嵌入模型：{kb.stats?.embed_model}（本地确定性，维度 256，余弦相似度）；检索方式：BM25 关键词 + 向量余弦，RRF 融合。
              </div>
            </>
          ) : (
            <div className="errbox">
              <b>索引未生成</b>
              <div>请在 duibai-web 目录执行 npm run kb:import 与 npm run kb:build。</div>
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <div className="sec-head">提问</div>
        <div className="field">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="例如：语音合成服务不可用的时候，系统会怎么处理？"
            onKeyDown={(e) => {
              if (e.key === 'Enter') run(q)
            }}
          />
        </div>
        <div className="tones">
          <button className={`tone ${mode === 'rag' ? 'on' : ''}`} onClick={() => setMode('rag')}>
            RAG 组（先检索再回答）
          </button>
          <button className={`tone ${mode === 'direct' ? 'on' : ''}`} onClick={() => setMode('direct')}>
            直接模型组（不给资料，作对照）
          </button>
        </div>
        <button className="btn" disabled={busy || !q.trim()} onClick={() => run(q)}>
          {busy ? '生成中…' : '提问'}
        </button>
        <div className="hint" style={{ marginTop: 8 }}>
          试一试：
          {SAMPLES.map((s) => (
            <button
              key={s}
              className="linkbtn"
              style={{ marginLeft: 8 }}
              onClick={() => {
                setQ(s)
                run(s)
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="panel">
          <div className="errbox">
            <b>{err.error}</b>
            <div>{err.reason}</div>
            {err.suggestion && <div className="hint">{err.suggestion}</div>}
          </div>
        </div>
      )}

      {res && (
        <>
          <div className="panel">
            <div className="sec-head">
              回答（{res.mode === 'rag' ? `RAG 组 · Prompt ${res.version}` : '直接模型组'}；总耗时 {res.total_ms} ms；
              {res.model ? ` 模型 ${res.model}` : ' 未调用模型'}；
              {res.usage ? ` ${res.usage.total_tokens} tokens` : ''}）
            </div>
            {res.insufficient ? (
              <div className="errbox" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}>
                <b>资料不足（由{res.insufficient_by === 'program' ? '程序' : '模型'}判定）</b>
                <div style={{ whiteSpace: 'pre-wrap' }}>{res.answer}</div>
              </div>
            ) : (
              <div className="script" style={{ whiteSpace: 'pre-wrap' }}>
                {res.answer}
              </div>
            )}
            {res.citations && res.citations.cited.length > 0 && (
              <div className="hint" style={{ marginTop: 10 }}>
                引用编号：{res.citations.cited.join('、')} ·
                {res.citations.ok ? ' 全部来自给定片段 ✓' : ` 编造编号 ${res.citations.invalid.join('、')} ✗`} ·
                片段被引用比例 {(res.citations.coverage * 100).toFixed(0)}%
              </div>
            )}
          </div>

          {res.retrieval && (
            <div className="panel">
              <div className="sec-head">① 检索（Top-{res.retrieval.topk.length}，按相关性排序）</div>
              <div className="hint">{res.retrieval.reason}</div>
              <div className="kv" style={{ marginTop: 8 }}>
                {res.retrieval.topk.map((r) => (
                  <div key={r.id} className="row">
                    <span className="tag">{r.id}</span>
                    <span className="mono">
                      RRF {r.rrf.toFixed(6)} · 覆盖度 {r.idfcov} · 余弦 {r.vec} · 名次(向量/BM25) {r.rank_vec}/{r.rank_bm25} · {r.chars} 字符
                    </span>
                    <div className="hint" style={{ width: '100%' }}>
                      {r.section}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {res.judge && (
            <div className="panel">
              <div className="sec-head">② 模型判定（这些片段够不够回答问题）</div>
              <div>
                <span className="tag">coverage = {res.judge.coverage}</span>{' '}
                {res.judge.reason}
              </div>
              {res.judge.missing && <div className="hint">缺少的信息：{res.judge.missing}</div>}
            </div>
          )}

          {res.context.chunks.length > 0 && (
            <div className="panel">
              <div className="sec-head">
                ③ 实际进入模型的上下文（{res.context.chunks.length} 个片段 / {res.context.chars} 字符 ≈{' '}
                {res.context.est_tokens} tokens）
              </div>
              {res.context.chunks.map((c) => (
                <div key={c.id} className="suspect" style={{ marginBottom: 8 }}>
                  <div className="pending-head">
                    <span className="tag">{c.id}</span> {c.source_title}
                    {c.section_short ? ` › ${c.section_short}` : ''} · {c.chars} 字符
                  </div>
                  <div className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12.5 }}>
                    {c.text}
                  </div>
                </div>
              ))}
            </div>
          )}

          {res.calls.length > 0 && (
            <div className="panel">
              <div className="sec-head">调用统计</div>
              <div className="kv">
                {res.calls.map((c, i) => (
                  <div key={i} className="row">
                    <span className="tag">{c.stage}</span>
                    <span className="mono">
                      {c.ms} ms · {c.usage?.total_tokens ?? '?'} tokens
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
