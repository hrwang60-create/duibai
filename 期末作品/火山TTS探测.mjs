/**
 * 火山引擎豆包语音 —— 鉴权与连通性探测
 *
 * 目的：**用真实调用判断这串凭证是哪一种**（新版 API Key / 旧版 Access Token），
 *      不要靠猜。探测成功则说明主链路可以用经典 TTS 逐句合成。
 *
 * 运行：node 火山TTS探测.mjs
 * 说明：脚本不会回显凭证本身，只报告 HTTP 状态与返回摘要。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const CFG = path.join(
	process.env.USERPROFILE || '',
	'Desktop', '个人软件选题与需求分析2', '期末作品', 'duibai-app',
	'uniCloud-aliyun', 'cloudfunctions', 'common', 'app-config', 'config.json'
)

const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'))
const KEY = cfg.VOLC_TTS_API_KEY || ''
const APPID = cfg.VOLC_APP_ID || ''
const TOKEN = cfg.VOLC_ACCESS_TOKEN || ''
const RES = cfg.VOLC_RESOURCE_ID || 'seed-tts-2.0'
const SPK = cfg.VOLC_SPEAKER_A || ''

function line (s) { console.log(s) }

async function probe (name, url, headers, body, useProxy) {
	const t0 = Date.now()
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
			body: JSON.stringify(body)
		})
		const ms = Date.now() - t0
		const ct = res.headers.get('content-type') || ''
		let summary
		if (ct.indexOf('json') >= 0) {
			const txt = await res.text()
			summary = txt.slice(0, 300)
		} else {
			// 音频流：只报长度，不打印内容
			const buf = await res.arrayBuffer()
			summary = '[二进制音频] ' + buf.byteLength + ' 字节'
		}
		line(`  ${name}`)
		line(`    状态: ${res.status} ${res.statusText}   耗时: ${ms}ms`)
		line(`    类型: ${ct}`)
		line(`    返回: ${summary}`)
		return res.status
	} catch (e) {
		line(`  ${name}`)
		line(`    ❌ 请求异常: ${e && e.message}`)
		return -1
	}
}

line('')
line('=== 火山豆包语音 · 鉴权探测 ===')
line(`  凭证长度: ${KEY.length}   资源: ${RES}   音色: ${SPK}`)
line('')

const uuid = crypto.randomUUID()

// 探测 A：新版控制台 —— X-Api-Key 单头鉴权（官方推荐）
line('【A】新版控制台鉴权（X-Api-Key 单头）→ /api/v3/tts/unidirectional')
await probe(
	'A',
	'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
	{
		'X-Api-Key': KEY,
		'X-Api-Resource-Id': RES,
		'X-Api-Request-Id': uuid
	},
	{
		req_params: { text: '这是一次接口连通性测试。', speaker: SPK },
		audio_params: { format: 'mp3', sample_rate: 24000 }
	}
)

line('')

// 探测 B：旧版控制台 —— 双头鉴权（需要 APP ID；没有就跳过）
if (APPID && TOKEN) {
	line('【B】旧版控制台鉴权（X-Api-App-Id + X-Api-Access-Key）')
	await probe(
		'B',
		'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
		{
			'X-Api-App-Id': APPID,
			'X-Api-Access-Key': TOKEN,
			'X-Api-Resource-Id': RES,
			'X-Api-Request-Id': uuid
		},
		{
			req_params: { text: '这是一次接口连通性测试。', speaker: SPK },
			audio_params: { format: 'mp3', sample_rate: 24000 }
		}
	)
} else {
	line('【B】旧版控制台鉴权 —— 跳过（config.json 里 VOLC_APP_ID / VOLC_ACCESS_TOKEN 为空）')
}

line('')
line('=== 判读 ===')
line('  200            → 新版 API Key 有效，主链路可以直接接')
line('  401 / 403      → 凭证无效，或这串是另一种类型的凭证 / 模型未开通')
line('  404 / 未开通    → 模型服务没在「开通管理」里开通')
line('  连接异常        → 网络问题（可能需要走代理）')
line('')
