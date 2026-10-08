/**
 * Seed-Audio 真实对谈生成 —— 端到端演示
 *
 * 用「每日一集」第一集的真实台词，构造 Seed-Audio 的 text_prompt，
 * 生成一段完整的两对谈音频，存成 mp3。
 *
 * 目的：**验证音频链路真的能通，并且听得到**，而不是停在"理论上可行"。
 *
 * 运行：node 生成对谈音频.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = path.join(
	process.env.USERPROFILE || '', 'Desktop', '个人软件选题与需求分析2', '期末作品'
)
const CFG = path.join(
	ROOT, 'duibai-app', 'uniCloud-aliyun', 'cloudfunctions', 'common', 'app-config', 'config.json'
)
const SEED = path.join(
	ROOT, 'duibai-app', 'uniCloud-aliyun', 'database', 'db_init.json'
)
const OUT = path.join(ROOT, '样例音频-光合作用对谈.mp3')

const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'))
const KEY = cfg.VOLC_TTS_API_KEY

// 取「每日一集」第一集的台词
const init = JSON.parse(fs.readFileSync(SEED, 'utf8'))
const ep = init.daily_episodes.data[0]

console.log('')
console.log('=== 用「每日一集」的真实台词生成对谈音频 ===')
console.log('  集标题:', ep.title)
console.log('  台词条数:', ep.lines.length)

/* ---------------- 构造 text_prompt ---------------- */
// 设计要点：
//   · 明确两人身份与音色（Seed-Audio 靠自然语言描述角色）
//   · 台词逐条给出，用「甲/乙」区分
//   · 明确要求"只有人声、不要背景音乐" —— 我们产品卖的是对话本身
const dialogue = ep.lines
	.map(l => (l.speaker === 'B' ? '乙' : '甲') + '：' + l.text)
	.join('\n')

const prompt = [
	'一段两个人的中文科普对谈，像播客里两个朋友在聊天，语气自然、口语化，语速适中。',
	'',
	'甲：年轻女性，声音清亮，语速稍快，带点质疑和追问的语气。',
	'乙：年轻男性，声音低沉温和，耐心解释。',
	'',
	'对话内容：',
	dialogue,
	'',
	'要求：只有两个人的说话声，不要背景音乐，不要环境音效，不要旁白。',
	'两人音色要有明显区分度，听起来像真的在对话，而不是各自念稿。'
].join('\n')

console.log('  prompt 长度:', prompt.length, '字符（上限 3000）')
console.log('')

/* ---------------- 调用 ---------------- */
const url = 'https://openspeech.bytedance.com/api/v3/tts/create'
const body = {
	model: 'seed-audio-1.0',
	text_prompt: prompt,
	audio_config: {
		format: 'mp3',
		sample_rate: 24000,
		pitch_rate: 0,
		speech_rate: 0,
		loudness_rate: 0
	},
	watermark: {}
}

const t0 = Date.now()
const res = await fetch(url, {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		'X-Api-Key': KEY,
		'X-Api-Request-Id': crypto.randomUUID()
	},
	body: JSON.stringify(body)
})
const ms = Date.now() - t0

console.log('  HTTP 状态:', res.status, '  耗时:', ms + 'ms')

const raw = await res.text()
let data
try { data = JSON.parse(raw) } catch (e) { data = null }

if (res.status !== 200 || !data || !data.audio) {
	console.log('  ❌ 未拿到音频。原始返回前 400 字符：')
	console.log('  ' + raw.slice(0, 400))
	process.exit(1)
}

// 返回里除 audio 之外还有什么字段
const extra = Object.keys(data).filter(k => k !== 'audio')
console.log('  返回字段:', extra.length ? extra.join(', ') : '(只有 audio)')
extra.forEach(k => {
	const v = data[k]
	console.log('    ' + k + ' =', typeof v === 'object' ? JSON.stringify(v).slice(0, 160) : v)
})

const buf = Buffer.from(data.audio, 'base64')
fs.writeFileSync(OUT, buf)

console.log('')
console.log('  ✅ 音频已保存:', OUT)
console.log('  文件大小:', (buf.length / 1024).toFixed(1), 'KB')
console.log('  文件头:', buf.slice(0, 3).toString('hex'), '(494433 = ID3，即标准 MP3)')
console.log('')
