'use strict'

/**
 * tts-synthesize —— 音频合成调度（火山引擎豆包语音合成 2.0）
 *
 * 入参：{ token, script_id, line_ids? }   // 传 line_ids 表示**只重做这几句**
 * 出参：{ code:0, data:{ segments:[...] } }
 *
 * 两条关键规则（来自需求）：
 *   ① 存在未确认的可疑项时，直接返回 409 PENDING_CONFIRMATION，拒绝合成；
 *   ② TTS 服务不可用时，返回 503 并降级为 text_only，**文字稿不丢**。
 *
 * 为什么是**逐句**合成而不是整段：
 *   产品的核心功能是「单句重做」—— 某句听不清就只重做那一句，其余音频不动。
 *   整段生成（如 Seed-Audio）做不到这一点。逐句实测约 1 秒/句，重做一句几乎无感。
 *
 * ⚠️ 音色后缀必须和 Resource-Id 匹配（配错会报 55000000）：
 *   `_uranus_bigtts` / `saturn_*_tob` → seed-tts-2.0
 *   `_moon_bigtts` / `_mars_bigtts`   → seed-tts-1.0
 */

const crypto = require('crypto')
const common = require('common')
const appConfig = require('app-config')
const { ERR, ok, fail, assertLogin } = common

const VOLC_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'

function ttsError (msg, code) {
  const e = new Error(msg)
  e.errorCode = code || ERR.TTS_UNAVAILABLE
  return e
}

/**
 * 把流式返回体切成一个个 JSON 对象。
 *
 * 火山这个接口的 content-type 是 text/plain，返回的是**多段 JSON 直接拼接**，
 * 所以不能整体 JSON.parse，要用大括号配对切开 —— 而且必须跳过字符串内部，
 * 否则台词里的引号/括号会把配对算错。
 */
function splitJsonStream (text) {
  const out = []
  let depth = 0
  let start = -1
  let inStr = false
  let esc = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      if (depth > 0) inStr = true
      continue
    }
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        out.push(text.slice(start, i + 1))
        start = -1
      }
    }
  }
  return out
}

function uuid () {
  if (crypto.randomUUID) return crypto.randomUUID()
  // 兜底：老 Node 没有 randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : ((r & 0x3) | 0x8)
    return v.toString(16)
  })
}

/**
 * 合成一句语音，返回 Buffer(mp3)。
 *
 * 这是「AI 能力层与业务解耦」的落点：换供应商只需要改这个函数，上层逻辑不动。
 */
async function synthOne (text, speaker) {
  const key = appConfig.get('VOLC_TTS_API_KEY')
  if (!key) throw ttsError('未配置 VOLC_TTS_API_KEY（云函数环境变量或 app-config/config.json）')

  const rid = appConfig.get('VOLC_RESOURCE_ID', 'seed-tts-2.0')
  const spk = speaker === 'B'
    ? appConfig.get('VOLC_SPEAKER_B')
    : appConfig.get('VOLC_SPEAKER_A')
  if (!spk) throw ttsError('未配置音色 ID（VOLC_SPEAKER_A / VOLC_SPEAKER_B）')

  const res = await uniCloud.httpclient.request(VOLC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': key,
      'X-Api-Resource-Id': rid,
      'X-Api-Request-Id': uuid()
    },
    data: {
      req_params: { text: String(text), speaker: spk },
      audio_params: { format: 'mp3', sample_rate: 24000 }
    },
    dataType: 'text',
    timeout: 20000
  })

  const body = String((res && res.data) || '')
  if (!res || res.status !== 200) {
    throw ttsError('TTS 返回 ' + (res && res.status) + '：' + body.slice(0, 160), ERR.TTS_UNAVAILABLE)
  }

  const chunks = []
  let bizErr = null
  for (const part of splitJsonStream(body)) {
    let obj
    try { obj = JSON.parse(part) } catch (e) { continue }
    if (obj.code && obj.code !== 0) { bizErr = obj; continue }
    if (obj.data) chunks.push(Buffer.from(obj.data, 'base64'))
  }
  if (!chunks.length) {
    const msg = bizErr
      ? ('TTS 业务错误 ' + bizErr.code + '：' + bizErr.message)
      : ('TTS 未返回音频帧：' + body.slice(0, 160))
    throw ttsError(msg, ERR.TTS_UNAVAILABLE)
  }
  return Buffer.concat(chunks)
}

exports.main = common.wrap(async (event) => {
  const { script_id, line_ids } = event || {}
  if (!script_id) return fail(ERR.PARAM, '缺少 script_id')

  const uid = assertLogin(event)
  const db = uniCloud.database()
  const t0 = Date.now()

  const sRes = await db.collection('scripts').doc(script_id).get()
  const script = sRes.data && sRes.data[0]
  if (!script) return fail(ERR.NOT_FOUND, '对话稿不存在')
  if (script.user_id !== uid) return fail(ERR.FORBIDDEN, '无权访问该对话稿')

  // ① 人工确认点：未确认完不许合成
  const pendingRes = await db.collection('dialogue_lines')
    .where({ script_id, flag: db.command.neq(''), confirmed: false })
    .field({ _id: true }).limit(100).get()
  const pendingIds = (pendingRes.data || []).map(x => x._id)
  if (pendingIds.length) {
    return fail(ERR.PENDING_CONFIRMATION, '还有未确认的可疑项，先确认再生成声音',
      { pending_line_ids: pendingIds })
  }

  // 取待合成的条目（只重做时按 line_ids 过滤）
  let where = { script_id }
  if (Array.isArray(line_ids) && line_ids.length) {
    where = { script_id, _id: db.command.in(line_ids) }
  }
  const lRes = await db.collection('dialogue_lines')
    .where(where).orderBy('seq', 'asc').limit(300).get()
  const lines = lRes.data || []
  if (!lines.length) return fail(ERR.NOT_FOUND, '没有待合成的对话条目')

  const segments = []
  for (const line of lines) {
    try {
      const buf = await synthOne(line.text, line.speaker)
      const up = await uniCloud.uploadFile({
        cloudPath: `audio/${uid}/${script_id}/${line._id}.mp3`,
        fileContent: buf
      })
      // 单句重做：先删旧片段，保持与条目一对一
      await db.collection('audio_segments').where({ line_id: line._id }).remove()
      await db.collection('audio_segments').add({
        line_id: line._id,
        script_id,
        user_id: uid,
        speaker: line.speaker,
        file_id: up.fileID,
        size: buf.length,
        duration: 0, // TODO: 需要 MP3 时长解析库才能补真实值；前端按 text 长度估算节奏
        created_at: Date.now()
      })
      segments.push({ line_id: line._id, file_id: up.fileID })
    } catch (e) {
      // ② 降级：保存已有结果，明确告知，不丢失已生成内容
      await db.collection('gen_logs').add({
        user_id: uid, script_id, stage: 'tts',
        ms: Date.now() - t0, ok: false,
        error_code: (e && e.errorCode) || ERR.TTS_UNAVAILABLE,
        error_message: (e && e.message) || '',
        created_at: Date.now()
      })
      return fail(ERR.TTS_UNAVAILABLE,
        (e && e.message) || '音频暂不可用，文字稿已保存，可稍后重试',
        { fallback: 'text_only', segments })
    }
  }

  // 只重做时不要把整体状态改错
  if (!Array.isArray(line_ids) || !line_ids.length) {
    await db.collection('scripts').doc(script_id).update({
      status: 'audio_ready',
      pending_confirm: 0
    })
  }
  await db.collection('gen_logs').add({
    user_id: uid, script_id, stage: 'tts',
    ms: Date.now() - t0, ok: true, error_code: '', created_at: Date.now()
  })

  return ok({ segments, count: segments.length })
})
