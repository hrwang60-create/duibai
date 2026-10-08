/**
 * 豆包语音合成（逐句）—— 双人对谈音频生成
 *
 * 用途：用「每日一集」的真实台词，**逐句**调用火山 TTS 2.0，甲/乙各一个音色，
 *      再按顺序拼成一段完整对谈音频。
 *
 * 为什么必须逐句：产品的核心功能是「单句重做」（某句听不清就只重做那一句），
 * 整段生成做不到。所以这里验证的正是主链路要用的合成方式。
 *
 * 运行：node 逐句合成对谈.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = path.join(process.env.USERPROFILE || '', 'Desktop', '个人软件选题与需求分析2', '期末作品')
const CFG = path.join(ROOT, 'duibai-app', 'uniCloud-aliyun', 'cloudfunctions', 'common', 'app-config', 'config.json')
const SEED = path.join(ROOT, 'duibai-app', 'uniCloud-aliyun', 'database', 'db_init.json')
const OUT = path.join(ROOT, '提交物', '02-录屏演示', '样例-逐句合成对谈.mp3')

const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'))
const KEY = cfg.VOLC_TTS_API_KEY
const RID = cfg.VOLC_RESOURCE_ID || 'seed-tts-2.0'
const SPK = { A: cfg.VOLC_SPEAKER_A, B: cfg.VOLC_SPEAKER_B }
const URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'

/**
 * 把流式返回体切成一个个 JSON 对象。
 * 火山这个接口 content-type 是 text/plain，返回的是**多段 JSON 拼接**，
 * 所以不能直接 JSON.parse，要用大括号配对切开（JSON 里可能含引号内的括号，需跳过字符串）。
 */
function splitJsonStream (text) {
  const out = []
  let depth = 0, start = -1, inStr = false, esc = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { if (depth > 0) inStr = true; continue }
    if (ch === '{') { if (depth === 0) start = i; depth++ }
    else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        out.push(text.slice(start, i + 1))
        start = -1
      }
    }
  }
  return out
}

/** 去掉 MP3 开头的 ID3v2 标签（拼接多段时必须去掉，否则中间会插标签） */
function stripId3 (buf) {
  if (buf.length > 10 && buf.slice(0, 3).toString('latin1') === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
    return buf.slice(10 + size)
  }
  return buf
}

/** 合成一句，返回 MP3 Buffer */
async function tts (text, speaker) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': KEY,
      'X-Api-Resource-Id': RID,
      'X-Api-Request-Id': crypto.randomUUID()
    },
    body: JSON.stringify({
      req_params: { text, speaker },
      audio_params: { format: 'mp3', sample_rate: 24000 }
    })
  })
  const body = await res.text()
  if (res.status !== 200) throw new Error('HTTP ' + res.status + ' ' + body.slice(0, 200))

  const parts = splitJsonStream(body)
  const chunks = []
  let bizErr = null
  for (const p of parts) {
    let obj
    try { obj = JSON.parse(p) } catch (e) { continue }
    if (obj.code && obj.code !== 0) { bizErr = obj; continue }
    if (obj.data) chunks.push(Buffer.from(obj.data, 'base64'))
  }
  if (!chunks.length) throw new Error('没拿到音频帧：' + (bizErr ? JSON.stringify(bizErr) : body.slice(0, 200)))
  return { buf: Buffer.concat(chunks), frames: chunks.length }
}

/* ---------------- 跑一整集 ---------------- */

const init = JSON.parse(fs.readFileSync(SEED, 'utf8'))
const ep = init.daily_episodes.data[0]

console.log('')
console.log('=== 逐句合成一场对谈（豆包 TTS 2.0）===')
console.log('  集标题:', ep.title)
console.log('  台词:', ep.lines.length, '句')
console.log('  甲音色:', SPK.A)
console.log('  乙音色:', SPK.B)
console.log('')

const pieces = []
const t0 = Date.now()
for (let i = 0; i < ep.lines.length; i++) {
  const l = ep.lines[i]
  const who = l.speaker === 'B' ? '乙' : '甲'
  const speaker = l.speaker === 'B' ? SPK.B : SPK.A
  const ts = Date.now()
  const r = await tts(l.text, speaker)
  const ms = Date.now() - ts
  // 第一段保留 ID3 头，后续段去掉，避免中间插入标签
  pieces.push(pieces.length === 0 ? r.buf : stripId3(r.buf))
  console.log(`  ${String(i + 1).padStart(2)}. [${who}] ${r.frames} 帧 ${(r.buf.length / 1024).toFixed(1)}KB  ${ms}ms  ${l.text}`)
}

const all = Buffer.concat(pieces)
const total = Date.now() - t0
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, all)

console.log('')
console.log('  ✅ 合并完成:', OUT)
console.log('  总大小:', (all.length / 1024).toFixed(1), 'KB')
console.log('  总耗时:', (total / 1000).toFixed(1), '秒（', (total / ep.lines.length / 1000).toFixed(2), '秒/句）')
console.log('  文件头:', all.slice(0, 3).toString('hex'), '(494433 = ID3，标准 MP3)')
console.log('')
console.log('  ⚠️ 注意：逐句合成 = 每句几百毫秒，所以「单句重做」可以只重合成那一句。')
console.log('')
