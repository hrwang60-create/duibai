'use strict'

/**
 * app-config —— 应用配置与密钥
 *
 * 为什么需要它：uniCloud 的云函数环境变量只能在**网页控制台**设置，
 * 而 HBuilderX CLI **不支持设环境变量**。为了能在命令行流程里打通核心链路，
 * 用这个公共模块从项目文件读取配置。
 *
 * ⚠️ 安全约定（重要）：
 *   · `config.json` 存放真实密钥，**已加入 .gitignore，且不随源代码压缩包提交**；
 *   · 提交给别人的是 `config.example.json`（同结构、空值）；
 *   · 读取优先级：**云函数环境变量 > config.json > 代码默认值** ——
 *     所以将来在网页控制台配了环境变量，会自动覆盖这里的值，不用改代码。
 */

let local = {}
try {
	// 文件不存在时不能让云函数直接崩，所以要兜住
	local = require('./config.json')
} catch (e) {
	local = {}
}

/**
 * 取配置项
 * @param {string} key 配置名，如 DEEPSEEK_API_KEY
 * @param {string} fallback 兜底值
 */
function get (key, fallback) {
	if (process.env && process.env[key]) return process.env[key]
	if (local && local[key]) return local[key]
	return fallback || ''
}

/** 调试用：返回哪些 key 已有值（**绝不返回值本身**） */
function presentKeys () {
	const out = []
	Object.keys(local || {}).forEach(k => { if (local[k]) out.push(k) })
	return out
}

module.exports = { get, presentKeys }
