'use client'

/**
 * 表现层 · 结果页（对应《实验3》图9 的原型）
 *
 * 本页承载三件事：逐句回看、出处回溯、单句修正。
 *
 * 关于播放器：音频由 AI 能力层的语音合成提供，本阶段**尚未接入**。
 * 所以播放器**不假装有声音** —— 它显式标注「音频未生成 · 按阅读节奏推进」，
 * 并把播放键做成"按句子长度推进阅读位置"，这样逐句高亮与出处回溯这两件事
 * 仍然可以被真实演示（对应实验3 表13 的 503 降级与 AC5）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

interface Line {
  id: number
  seq: number
  speaker: 'A' | 'B'
  text: string
  source_paragraph: number
  flag: '' | 'term' | 'no_source' | 'number'
  confirmed: boolean
}

interface Para {
  id: number
  seq: number
  text: string
}

export default function ResultPage() {
  const rp = useParams<{ id: string }>()
  const scriptId = String(rp?.id ?? '')
  // 用 window.location 取查询参数：比 useSearchParams 少一层 Suspense 约束
  const [ttsDown, setTtsDown] = useState(false)
  useEffect(() => {
    setTtsDown(new URLSearchParams(window.location.search).get('tts') === 'down')
  }, [])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [paras, setParas] = useState<Para[]>([])
  const [article, setArticle] = useState<{ id: number; title: string } | null>(null)
  const [segments, setSegments] = useState<Array<{ line_id: number }>>([])
  const [voices, setVoices] = useState<Record<string, string>>({})
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [openSrc, setOpenSrc] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const r = await fetch(`/api/scripts/${scriptId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.reason || '读取失败')
      setLines(j.data.lines)
      setParas(j.data.paragraphs)
      setArticle(j.data.article)
      setSegments(j.data.segments)
      setVoices(j.data.voices || {})
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '读取失败')
    } finally {
      setLoading(false)
    }
  }, [scriptId])

  useEffect(() => {
    load()
  }, [load])

  const hasAudio = segments.length > 0
  const totalChars = useMemo(() => lines.reduce((n, l) => n + l.text.length, 0), [lines])

  /** 只有真的逐句读到末尾才停，中途只在句与句之间停顿 */
  useEffect(() => {
    if (!playing) {
      if (timer.current) clearTimeout(timer.current)
      return
    }
    const line = lines[cur]
    if (!line) {
      setPlaying(false)
      return
    }
    // 中文按每分钟约 240 字推进；短句最少给 1.4 秒，免得一闪而过
    const ms = Math.max(1400, Math.round((line.text.length / 4) * 1000))
    timer.current = setTimeout(() => {
      if (cur + 1 < lines.length) setCur(cur + 1)
      else setPlaying(false)
    }, ms)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [playing, cur, lines])

  async function patchLine(line: Line, text: string, tag: string, okMsg: string) {
    setMsg('')
    setErr('')
    try {
      const r = await fetch(`/api/lines/${line.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text })
      })
      const j = await r.json()
      if (!r.ok) {
        setErr(`${j.reason || '保存失败'}${j.suggestion ? ' —— ' + j.suggestion : ''}`)
        return false
      }
      setMsg(okMsg)
      setEditing(null)
      await load()
      return true
    } catch (e) {
      setErr(e instanceof Error ? e.message : '网络异常')
      return false
    }
  }

  function exportText() {
    const body = lines
      .map((l) => `${l.speaker === 'A' ? '甲' : '乙'}：${l.text}${l.source_paragraph ? `  [P${l.source_paragraph}]` : ''}`)
      .join('\n\n')
    const head = `${article?.title ?? '对谈稿'}\n共 ${lines.length} 句 · 约 ${totalChars} 字${hasAudio ? '' : '（音频未生成）'}\n\n`
    const blob = new Blob([head + body], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (article?.title || '对谈稿') + '.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (loading) {
    return (
      <div className="wrap">
        <div className="loading">正在读取稿件…</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="wrap">
        <div className="errbox">
          <h2>稿件没读出来</h2>
          <div className="reason">{loadError}</div>
          <div className="suggest">这不等于稿件不存在，可能只是这次没读到。</div>
          <button className="btn" onClick={load}>
            重试
          </button>
        </div>
      </div>
    )
  }

  const progress = lines.length ? ((cur + 1) / lines.length) * 100 : 0

  return (
    <>
      <div className="topbar">
        <a className="back" href={`/confirm/${scriptId}`}>
          ← 返回
        </a>
        <span className="brand">
          {article?.title} · {lines.length} 句
        </span>
        <span className="spacer" />
        <span className="brand-en">DUIBAI · WEB</span>
      </div>

      <div className="wrap">
        {ttsDown && (
          <div className="hint warn" style={{ marginBottom: 12 }} id="tts-down-banner">
            语音合成未接入，音频没有生成 —— 下面的文字稿是完整的，你仍然可以逐句回看与核对原文。
          </div>
        )}

        <div className="panel">
          <div className="player">
            <button
              className={'play' + (playing ? ' playing' : '')}
              aria-label={playing ? '暂停' : '播放'}
              id="play-btn"
              onClick={() => setPlaying((p) => !p)}
            >
              <i />
            </button>
            <div className="bar">
              <i style={{ width: progress + '%' }} />
            </div>
            <span className="time">
              {String(cur + 1).padStart(2, '0')} / {String(lines.length).padStart(2, '0')}
            </span>
            <button className="btn ghost sm" onClick={() => setCur((c) => Math.max(0, c - 1))}>
              上一句
            </button>
            <button
              className="btn ghost sm"
              onClick={() => setCur((c) => Math.min(lines.length - 1, c + 1))}
            >
              下一句
            </button>
          </div>
          <div className="hint">
            {hasAudio
              ? `双音色：甲 ${voices.A} · 乙 ${voices.B}`
              : '音频未生成 · 按阅读节奏推进（播放键按句子长度移动当前句）'}
          </div>
        </div>

        <div className="panel">
          <div className="sec-head">
            <span className="label">文字稿</span>
            <span className="count">约 {totalChars} 字</span>
          </div>
          {(msg || err) && (
            <div className={'hint' + (err ? ' warn' : '')} style={{ marginBottom: 8 }}>
              {err || msg}
            </div>
          )}
          <div className="script">
            {lines.map((l, i) => {
              const src = paras.find((p) => p.seq === l.source_paragraph)
              return (
                <div
                  className={'line ' + l.speaker.toLowerCase() + (i === cur ? ' on' : '')}
                  key={l.id}
                  id={'line-' + l.seq}
                >
                  <div className="who">{l.speaker === 'A' ? '甲' : '乙'}</div>
                  <div className="txt">
                    {editing === l.id ? (
                      <div className="acts">
                        <input
                          type="text"
                          defaultValue={l.text}
                          onChange={(e) => setDraft(e.target.value)}
                          style={{
                            flex: 1,
                            minWidth: 220,
                            border: '1px solid var(--line2)',
                            borderRadius: 4,
                            padding: '6px 9px',
                            fontFamily: 'inherit',
                            fontSize: 14
                          }}
                        />
                        <button className="btn sm" onClick={() => patchLine(l, draft, 'edit', `第 ${l.seq} 句已保存并重新校验`)}>
                          保存
                        </button>
                        <button className="btn ghost sm" onClick={() => setEditing(null)}>
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <span onClick={() => setCur(i)} style={{ cursor: 'pointer' }}>
                          {l.text}
                        </span>
                        <span className="src">
                          {l.source_paragraph ? (
                            <button
                              className="linkbtn"
                              onClick={() => setOpenSrc(openSrc === l.seq ? null : l.seq)}
                            >
                              出处：P{l.source_paragraph}
                            </button>
                          ) : (
                            <span className="hint warn">无原文依据</span>
                          )}
                          {l.flag ? ` · ${l.flag}${l.confirmed ? '（已确认）' : '（待确认）'}` : ''}
                          {openSrc === l.seq && src && (
                            <span
                              style={{
                                display: 'block',
                                marginTop: 6,
                                padding: '8px 10px',
                                background: 'var(--card)',
                                borderRadius: 4,
                                color: 'var(--ink2)',
                                whiteSpace: 'normal'
                              }}
                            >
                              P{src.seq}　{src.text}
                            </span>
                          )}
                        </span>
                        <span className="acts">
                          <button
                            className="linkbtn"
                            onClick={() => {
                              setEditing(l.id)
                              setDraft(l.text)
                            }}
                          >
                            修改这句
                          </button>
                          <button
                            className="linkbtn"
                            onClick={() =>
                              patchLine(
                                l,
                                l.text,
                                'redo',
                                hasAudio
                                  ? `第 ${l.seq} 句已重做`
                                  : `语音合成未接入，本次只重新校验了第 ${l.seq} 句`
                              )
                            }
                          >
                            重做这句
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel">
          <div className="row">
            <a className="btn" href="/">
              换一种口吻重新生成
            </a>
            <button className="btn ghost" onClick={exportText}>
              导出文字稿
            </button>
            <span className="hint">
              {hasAudio ? '音频已生成' : '音频未生成 —— 文字稿、出处与逐句回看均可用'}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
