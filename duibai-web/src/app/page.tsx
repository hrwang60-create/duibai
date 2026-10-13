'use client'

/**
 * 表现层 · 首页 / 入口页
 *
 * 对应《实验3》图7 的原型：上传区 → 口吻单选组 → 开始按钮 → 历史记录。
 * 交互约束也照原型实现：未选择文件时按钮置灰；历史为空时给引导文案而不是空白。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Tone {
  code: string
  name: string
  description: string
}

interface ArticleRow {
  id: number
  title: string
  char_count: number
  created_at: string
  script_id: number | null
  tone_code: string | null
  status: string | null
}

const STATUS_TEXT: Record<string, string> = {
  generated: '待确认',
  confirmed: '已确认',
  audio_ready: '可播放',
  text_only: '文字稿'
}

export default function HomePage() {
  const router = useRouter()
  const [tones, setTones] = useState<Tone[]>([])
  const [tone, setTone] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ArticleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  /** 读取失败与"真的没数据"必须分开——否则用户会以为数据丢了（实验4 §2.5 的异常要求） */
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState<
    { code: string; reason: string; suggestion: string } | null
  >(null)
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const r = await fetch('/api/articles', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.reason || '读取历史记录失败')
      setRows(j.data.articles)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '读取历史记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/tones', { cache: 'no-store' })
        const j = await r.json()
        if (r.ok) {
          setTones(j.data.tones)
          setTone((prev) => prev || j.data.tones[0]?.code || '')
        }
      } catch {
        /* 口吻读不到不阻碍上传，按钮会因为没选口吻而禁用并给出提示 */
      }
    })()
    reload()
  }, [reload])

  async function onPickFile(f: File | undefined) {
    if (!f) return
    setError(null)
    setNotice('')
    const text = await f.text()
    setFileName(f.name)
    setTitle((t) => t || f.name.replace(/\.(md|markdown|txt)$/i, ''))
    setContent(text)
  }

  const canSubmit = !!content.trim() && !!tone

  async function onSubmit() {
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    setNotice('')
    try {
      // 第一步：上传并解析（非AI 环节）
      const ar = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, content })
      })
      const aj = await ar.json()
      if (!ar.ok) {
        setError({ code: aj.error, reason: aj.reason, suggestion: aj.suggestion })
        return
      }
      setNotice(`已解析 ${aj.data.paragraphs.length} 段 / ${aj.data.article.char_count} 字`)

      // 第二步：生成对谈稿（走 AI 能力层适配器 + 程序三校）
      const sr = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ article_id: aj.data.article.id, tone_code: tone })
      })
      const sj = await sr.json()
      if (!sr.ok) {
        // 内容形态不适合（422）单独走降级页，其余在原位提示
        if (sj.error === 'NOT_SUITABLE_FOR_AUDIO') {
          router.push('/error?type=not_suitable&reason=' + encodeURIComponent(sj.reason))
          return
        }
        setError({ code: sj.error, reason: sj.reason, suggestion: sj.suggestion })
        await reload()
        return
      }

      setContent('')
      setFileName('')
      await reload()
      router.push(`/confirm/${sj.data.script.id}`)
    } catch (e) {
      setError({
        code: 'NETWORK',
        reason: e instanceof Error ? e.message : '网络异常',
        suggestion: '请检查本地服务是否仍在运行'
      })
    } finally {
      setBusy(false)
    }
  }

  const current = tones.find((t) => t.code === tone)

  return (
    <>
      <div className="topbar">
        <span className="brand">对白</span>
        <span className="brand-en">DUIBAI · WEB</span>
        <span className="spacer" />
        <a className="back" href="/ask">
          知识问答
        </a>
        <a className="back" href="/api/articles">
          接口自检
        </a>
      </div>

      <div className="wrap">
        <div className="hero">
          <h1>「对白」把文章，聊给你听</h1>
          <p>上传一篇文章，选一种口吻，它会变成两个人的对话。</p>
        </div>

        <div className="panel">
          <div className="sec-head">
            <span className="label">投一篇文章</span>
            <span className="count">
              {content ? `${content.length} 字` : '支持 Markdown / txt · 单篇 ≤ 3000 字'}
            </span>
          </div>

          <div className="field">
            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,.txt,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
            <div className="dropzone" onClick={() => fileRef.current?.click()}>
              <div className="big">
                {fileName ? `已选择：${fileName}` : '点击选择文件，或直接粘贴正文'}
              </div>
              <div className="small">支持 Markdown / txt，单篇不超过 3000 字</div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="article-title">文章标题</label>
            <input
              id="article-title"
              type="text"
              placeholder="不填则用文件名，或自动命名"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="article-body">文章正文</label>
            <textarea
              id="article-body"
              className="paste"
              placeholder="把文章正文粘贴到这里…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="sec-head" style={{ marginTop: 18 }}>
            <span className="label">选择口吻</span>
          </div>
          <div className="tones">
            {tones.map((t) => (
              <button
                key={t.code}
                type="button"
                className={'tone' + (t.code === tone ? ' on' : '')}
                onClick={() => setTone(t.code)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="tone-desc">{current?.description || ''}</div>

          <div className="split-hr" />

          <div className="row">
            <button className="btn" disabled={!canSubmit || busy} onClick={onSubmit}>
              {busy ? '正在生成…' : '开始生成'}
            </button>
            <span className="hint">
              {canSubmit ? '生成后会进入确认页，处理掉可疑处才能合成音频' : '还没选文件或正文为空，按钮不可用'}
            </span>
          </div>

          {notice && (
            <div className="hint" style={{ marginTop: 10, color: 'var(--ok)' }} id="notice">
              {notice}
            </div>
          )}
          {error && (
            <div
              className="hint warn"
              style={{ marginTop: 10 }}
              id="form-error"
              data-code={error.code}
            >
              {error.reason}
              {error.suggestion ? ` —— ${error.suggestion}` : ''}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="sec-head">
            <span className="label">历史记录</span>
            <span className="count">{rows.length} 条</span>
          </div>

          {loading ? (
            <div className="loading">正在读取…</div>
          ) : loadError ? (
            <div className="empty" id="load-error">
              记录没读出来：{loadError}
              <div style={{ marginTop: 10 }}>
                <button className="btn ghost sm" onClick={reload}>
                  重试
                </button>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty" id="empty-state">
              还没有解析过文章 —— 上面投一篇，这里就会长出来。
            </div>
          ) : (
            <div className="hist">
              {rows.map((r) => (
                <div className="hist-item" key={r.id}>
                  <div className="name">
                    {r.script_id ? (
                      <a href={`/confirm/${r.script_id}`}>{r.title}</a>
                    ) : (
                      r.title
                    )}
                    <span className="trace">
                      {r.tone_code ? `口吻 ${r.tone_code} · ` : ''}
                      {r.char_count} 字 · #{r.id}
                    </span>
                  </div>
                  {r.status && (
                    <span className={'tag' + (r.status === 'generated' ? ' accent' : ' ok')}>
                      {STATUS_TEXT[r.status] || r.status}
                    </span>
                  )}
                  <span className="meta">{r.created_at.slice(5, 16).replace('T', ' ')}</span>
                  {r.script_id ? (
                    <a className="btn ghost sm" href={r.status === 'generated' ? `/confirm/${r.script_id}` : `/result/${r.script_id}`}>
                      {r.status === 'generated' ? '继续确认' : '打开'}
                    </a>
                  ) : (
                    <a className="btn ghost sm" href={`/api/articles/${r.id}`}>
                      查看
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
