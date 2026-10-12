'use client'

/**
 * 表现层 · 生成与确认页（对应《实验3》图8 的原型）
 *
 * 两个状态都在这一页：
 *   · 加载 / 生成中 —— 进度提示
 *   · 人工确认   —— 待确认清单 + 对话稿预览 + 底部动作
 *
 * 交互约束照原型实现：**存在未确认项时"合成音频"不可用**，
 * 但用户可以选择"仅保存文字稿"走降级路径（对应 AC5）。
 */

import { useCallback, useEffect, useState } from 'react'
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

interface Script {
  id: number
  article_id: number
  tone_code: string
  status: string
  line_count: number
  pending_confirm: number
  generator: string
  created_at: string
}

interface Para {
  id: number
  seq: number
  text: string
}

const FLAG_TITLE: Record<string, string> = {
  term: '书面残留，已经按听觉需要去掉',
  no_source: '原文未支持',
  number: '数字与原文不一致'
}

const FLAG_ASK: Record<string, string> = {
  term: '这句原本带编号或括号补充，读出来会打断听觉。保留去掉后的版本吗？',
  no_source: '这句话在原文里找不到对应段落，是否保留？',
  number: '这句的数字和原文对不上，要保留现在的写法吗？'
}

export default function ConfirmPage() {
  // Next 15 里动态段用 useParams 取，避免在客户端组件里解 Promise
  const routeParams = useParams<{ id: string }>()
  const scriptId = String(routeParams?.id ?? '')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [script, setScript] = useState<Script | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [paras, setParas] = useState<Para[]>([])
  const [article, setArticle] = useState<{ id: number; title: string } | null>(null)
  const [toneName, setToneName] = useState('')
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const r = await fetch(`/api/scripts/${scriptId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.reason || '读取失败')
      setScript(j.data.script)
      setLines(j.data.lines)
      setParas(j.data.paragraphs)
      setArticle(j.data.article)
      const tr = await fetch('/api/tones', { cache: 'no-store' })
      const tj = await tr.json()
      if (tr.ok) {
        const t = tj.data.tones.find((x: { code: string }) => x.code === j.data.script.tone_code)
        setToneName(t?.name || j.data.script.tone_code)
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '读取失败')
    } finally {
      setLoading(false)
    }
  }, [scriptId])

  useEffect(() => {
    load()
  }, [load])

  const pending = lines.filter((l) => l.flag !== '' && !l.confirmed)

  async function act(url: string, init: RequestInit, tag: string, okMsg: string) {
    setBusy(tag)
    setErr('')
    setNotice('')
    try {
      const r = await fetch(url, init)
      const j = await r.json()
      if (!r.ok) {
        setErr(`${j.reason || '操作失败'}${j.suggestion ? ' —— ' + j.suggestion : ''}`)
        return null
      }
      setNotice(okMsg)
      await load()
      return j.data
    } catch (e) {
      setErr(e instanceof Error ? e.message : '网络异常')
      return null
    } finally {
      setBusy('')
    }
  }

  const doConfirm = (line: Line) =>
    act(
      `/api/lines/${line.id}/confirm`,
      { method: 'POST' },
      'confirm-' + line.id,
      `第 ${line.seq} 句已确认`
    )

  const doEdit = (line: Line) => {
    const text = (drafts[line.id] ?? '').trim()
    if (!text) {
      setErr('修改内容不能为空')
      return
    }
    return act(
      `/api/lines/${line.id}`,
      { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) },
      'edit-' + line.id,
      `第 ${line.seq} 句已保存并重新校验`
    )
  }

  async function doSynthesize() {
    setBusy('tts')
    setErr('')
    setNotice('')
    try {
      const r = await fetch(`/api/scripts/${scriptId}/audio`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) {
        // 语音合成不可用（503）是设计内的降级路径：如实说明，并把用户引到「仅保存文字稿」。
        // 这里**不自动跳转**——按实验3 图8，走降级路径是用户的选择。
        if (j.error === 'TTS_UNAVAILABLE') {
          setErr(`${j.reason} —— ${j.suggestion || ''}`)
          setNotice('文字稿已完整保存。点下面的「仅保存文字稿」即可继续阅读。')
          return
        }
        setErr(`${j.reason || '合成失败'}${j.suggestion ? ' —— ' + j.suggestion : ''}`)
        return
      }
      window.location.href = `/result/${scriptId}`
    } catch (e) {
      setErr(e instanceof Error ? e.message : '网络异常')
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return (
      <>
        <TopBar title="生成中" back="/" />
        <div className="wrap">
          <div className="panel">
            <div className="sec-head">
              <span className="label">生成中</span>
              <span className="count">已解析段落 · 正在生成对谈稿…</span>
            </div>
            <div className="loading">正在读取稿件…</div>
          </div>
        </div>
      </>
    )
  }

  if (loadError) {
    return (
      <>
        <TopBar title="读取失败" back="/" />
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
      </>
    )
  }

  return (
    <>
      <TopBar
        title={`${article?.title ?? ''} · ${toneName}口吻`}
        back="/"
      />
      <div className="wrap">
        <div className="panel">
          <div className="sec-head">
            <span className="label">已生成</span>
            <span className="count">
              {lines.length} 句 · 稿件 #{script?.id} · 生成器 {script?.generator}
            </span>
          </div>
          <div className="kv">
            <span>状态</span>
            <b>{script?.status}</b>
            <span style={{ marginLeft: 12 }}>待确认</span>
            <b>{pending.length} 项</b>
          </div>
          {script?.generator?.includes('local') && (
            <div className="hint" style={{ marginTop: 6 }}>
              本次由确定性本地实现产出（未接真实大模型）—— 内容逐句引用原文，
              因此可以被程序校验真实检查。
            </div>
          )}
        </div>

        <div className="panel">
          <div className="pending-head">
            <div className="sec-head" style={{ margin: 0 }}>
              <span className="label">待确认</span>
              <span className="count">{pending.length} 项</span>
            </div>
            <span className="hint">人工确认点 —— 必须处理完才能合成音频</span>
          </div>

          {pending.length === 0 ? (
            <div className="empty">
              没有待确认项了 —— 全部内容都有原文依据，且通过了听觉可用性检查。
            </div>
          ) : (
            pending.map((l) => {
              const src = paras.find((p) => p.seq === l.source_paragraph)
              return (
                <div className="suspect" key={l.id} data-line-id={l.id}>
                  <div className="title">
                    第 {l.seq} 句 · {FLAG_TITLE[l.flag] || l.flag}
                  </div>
                  <div className="why">{FLAG_ASK[l.flag] || ''}</div>
                  <div className="src">当前台词：{l.text}</div>
                  <div className="src">
                    {src
                      ? `原文 P${src.seq}：${src.text.slice(0, 90)}${src.text.length > 90 ? '…' : ''}`
                      : '原文：该句没有对应段落'}
                  </div>
                  <div className="acts">
                    <input
                      type="text"
                      placeholder="改成什么？（留空则点右边的确认）"
                      value={drafts[l.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                    />
                    <button
                      className="btn ghost sm"
                      disabled={busy === 'edit-' + l.id || !(drafts[l.id] ?? '').trim()}
                      onClick={() => doEdit(l)}
                    >
                      {busy === 'edit-' + l.id ? '保存中…' : '改为这个'}
                    </button>
                    <button
                      className="btn sm"
                      disabled={busy === 'confirm-' + l.id}
                      onClick={() => doConfirm(l)}
                    >
                      {busy === 'confirm-' + l.id ? '处理中…' : '保留现在的写法'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="panel">
          <div className="sec-head">
            <span className="label">对话稿</span>
            <span className="count">{lines.length} 句</span>
          </div>
          <div className="script">
            {lines.map((l) => (
              <div className={'line ' + l.speaker.toLowerCase() + (l.flag && !l.confirmed ? ' on' : '')} key={l.id}>
                <div className="who">{l.speaker === 'A' ? '甲' : '乙'}</div>
                <div className="txt">
                  {l.text}
                  <span className="src">
                    P{l.source_paragraph || '—'}
                    {l.flag ? ` · ${l.flag}${l.confirmed ? '（已确认）' : '（待确认）'}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          {notice && (
            <div className="hint" style={{ color: 'var(--ok)', marginBottom: 10 }}>
              {notice}
            </div>
          )}
          {err && (
            <div className="hint warn" style={{ marginBottom: 10 }} data-error>
              {err}
            </div>
          )}
          <div className="row">
            <button className="btn" disabled={pending.length > 0 || busy === 'tts'} onClick={doSynthesize}>
              {busy === 'tts' ? '正在合成…' : '全部确认并合成音频'}
            </button>
            <a className="btn ghost" href={`/result/${scriptId}${script?.status === 'text_only' ? '?tts=down' : ''}`}>
              仅保存文字稿
            </a>
            <span className="hint">
              {pending.length > 0
                ? `还有 ${pending.length} 处待确认，「合成音频」暂不可用`
                : '全部已确认，可以合成音频'}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

function TopBar({ title, back }: { title: string; back: string }) {
  return (
    <div className="topbar">
      <a className="back" href={back}>
        ← 返回
      </a>
      <span className="brand">{title}</span>
      <span className="spacer" />
      <span className="brand-en">DUIBAI · WEB</span>
    </div>
  )
}
