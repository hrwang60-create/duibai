'use client'

/**
 * 表现层 · 错误与降级页（对应《实验3》图6 的两条异常路径）
 *
 * 硬规则：**绝不写"系统错误，请稍后重试"**。
 * 每一类异常都要给出「发生了什么（原因）」与「下一步做什么（动作）」，
 * 而且原因必须具体到可以核对（例如占比是多少、缺的是哪个 Key）。
 *
 * 进入方式：/error?type=not_suitable|tts_down|no_key|generic&reason=<可选，覆盖默认原因>
 */

import { useEffect, useState } from 'react'

type ErrType = 'not_suitable' | 'tts_down' | 'no_key' | 'generic'

const PRESET: Record<ErrType, { title: string; reason: string; suggest: string; href: string; action: string }> = {
  not_suitable: {
    title: '这篇文章不适合转成音频',
    reason: '文章里表格与公式占比太高，读出来只有数字和符号，听不出信息。',
    suggest: '改用文字摘要形式，或换一篇以叙述性文字为主的文章。原文已经保存，不用重新上传。',
    href: '/',
    action: '换一篇文章'
  },
  tts_down: {
    title: '语音合成暂时不可用',
    reason: '语音服务这次没有响应。',
    suggest: '文字稿已经完整保存，可以先阅读；等服务恢复后对同一份稿件重新合成即可。',
    href: '/',
    action: '回到首页'
  },
  no_key: {
    title: '还没有配置模型密钥',
    reason: '对话生成需要调用大模型，而当前服务端没有配置 API Key。',
    suggest: '在服务端环境变量里配置模型密钥后重启服务；在此之前可以先用确定性本地实现验证流程。',
    href: '/',
    action: '回到首页'
  },
  generic: {
    title: '这一步没有完成',
    reason: '请求没有成功返回。',
    suggest: '可以重试一次；如果反复失败，请查看服务端日志（data/logs/）定位。',
    href: '/',
    action: '回到首页'
  }
}

export default function ErrorPage() {
  const [type, setType] = useState<ErrType>('generic')
  const [override, setOverride] = useState('')

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const t = (q.get('type') || 'generic') as ErrType
    setType(PRESET[t] ? t : 'generic')
    const r = q.get('reason')
    if (r) setOverride(r)
  }, [])

  const p = PRESET[type]

  return (
    <>
      <div className="topbar">
        <a className="back" href="/">
          ← 返回
        </a>
        <span className="brand">对白</span>
        <span className="spacer" />
        <span className="brand-en">DUIBAI · WEB</span>
      </div>
      <div className="wrap">
        <div className="errbox">
          <h2>{p.title}</h2>
          <div className="reason">{override || p.reason}</div>
          <div className="suggest">{p.suggest}</div>
          <div className="row">
            <a className="btn" href={p.href}>
              {p.action}
            </a>
            <button className="btn ghost" onClick={() => window.location.reload()}>
              重试
            </button>
          </div>
          <div className="hint" style={{ marginTop: 14 }}>
            错误类型：<code>{type}</code>
          </div>
        </div>
      </div>
    </>
  )
}
