/**
 * 云函数调用统一封装
 *
 * 约定：所有云函数返回 { code: 0, data } 表示成功；code !== 0 时带 error / message。
 * 令牌统一由这里注入，页面里不用关心。
 */

const TOKEN_KEY = 'duibai_token'
const USER_KEY = 'duibai_user'

export function getToken () {
	return uni.getStorageSync(TOKEN_KEY) || ''
}
export function setToken (t) {
	uni.setStorageSync(TOKEN_KEY, t || '')
}
export function getUser () {
	return uni.getStorageSync(USER_KEY) || null
}
export function setUser (u) {
	uni.setStorageSync(USER_KEY, u || null)
}
export function clearAuth () {
	uni.removeStorageSync(TOKEN_KEY)
	uni.removeStorageSync(USER_KEY)
}

/**
 * 调用云函数
 * @returns {Promise<any>} 成功时 resolve 业务数据；失败时 reject({ error, message, ... })
 */
export function call (name, data = {}) {
	return new Promise((resolve, reject) => {
		uniCloud.callFunction({
			name,
			data: Object.assign({}, data, { token: getToken() }),
			success: (res) => {
				const r = (res && res.result) || {}
				if (r.code === 0) resolve(r.data)
				else reject(r)
			},
			fail: (err) => {
				reject({ code: -1, error: 'NETWORK', message: (err && err.errMsg) || '网络异常' })
			}
		})
	})
}

/* ---------------- 按业务分组（页面里直接用） ---------------- */

export const auth = {
	/** 微信一键登录 */
	async login (profile = {}) {
		const { code } = await new Promise((resolve, reject) => {
			uni.login({ provider: 'weixin', success: resolve, fail: reject })
		})
		const d = await call('login', { code, nickname: profile.nickname, avatar: profile.avatar })
		setToken(d.token)
		setUser(d.user)
		return d
	},
	logout () {
		clearAuth()
	}
}

export const article = {
	add: (title, content) => call('data', { action: 'article.add', payload: { title, content } }),
	list: (page = 1) => call('data', { action: 'article.list', payload: { page } }),
	get: (_id) => call('data', { action: 'article.get', payload: { _id } })
}

export const paragraph = {
	list: (article_id) => call('data', { action: 'paragraph.list', payload: { article_id } }),
	get: (_id) => call('data', { action: 'paragraph.get', payload: { _id } })
}

export const script = {
	list: (page = 1) => call('data', { action: 'script.list', payload: { page } }),
	get: (script_id) => call('data', { action: 'script.get', payload: { script_id } }),
	/** 删除一场对谈（级联删除台词与音频分段） */
	remove: (script_id) => call('data', { action: 'script.remove', payload: { script_id } }),
	/** 生成对话稿（核心链路） */
	generate: (article_id, tone_code) => call('generate-dialogue', { article_id, tone_code }),
	/** 合成音频；line_ids 传入时表示只重做这几句 */
	synthesize: (script_id, line_ids) => call('tts-synthesize', { script_id, line_ids }),

	/**
	 * 分批合成整场对谈的音频。
	 *
	 * ⚠️ 为什么要分批：云端逐句合成约 3 秒/句（含上传），18 句≈54 秒，
	 *    **会逼近云函数 60 秒上限**。所以前端按批循环调用，每批控制在 8 句以内。
	 *
	 * @param {string} script_id
	 * @param {{batchSize?:number, onProgress?:function}} opts
	 *        onProgress(done, total) —— 用于显示进度
	 */
	async synthesizeAll (script_id, opts = {}) {
		const batchSize = opts.batchSize || 8
		const onProgress = opts.onProgress || function () {}
		const d = await call('data', { action: 'script.get', payload: { script_id } })
		const lines = (d && d.lines) || []
		if (!lines.length) return { count: 0, batches: 0 }

		const ids = lines.map(l => l._id)
		const batches = []
		for (let i = 0; i < ids.length; i += batchSize) {
			batches.push(ids.slice(i, i + batchSize))
		}

		let done = 0
		for (const batch of batches) {
			await call('tts-synthesize', { script_id, line_ids: batch })
			done += batch.length
			onProgress(done, ids.length)
		}
		return { count: done, batches: batches.length }
	}
}

export const line = {
	update: (_id, text) => call('data', { action: 'line.update', payload: { _id, text } }),
	confirm: (_id, confirmed = true) =>
		call('data', { action: 'line.confirm', payload: { _id, confirmed } })
}

export const feedback = {
	add: (content, contact) => call('data', { action: 'feedback.add', payload: { content, contact } })
}

export const banner = {
	/** 首页薄条轮播。走云函数 —— 客户端直读实测会静默返回空 */
	list: () => call('data', { action: 'banner.list' })
}

export const tone = {
	/** 口吻列表。走云函数 —— 客户端直读实测不可靠 */
	list: () => call('data', { action: 'tone.list' })
}

export const daily = {
	/** 今日一集（含往期列表）。走云函数而非客户端直读 —— 见 data 云函数里的注释 */
	list: () => call('data', { action: 'daily.list' }),
	get: (_id) => call('data', { action: 'daily.get', payload: { _id } })
}

/** 管理端 */
export const admin = {
	banners: (action, payload) => call('admin-banners', { action, payload }),
	users: (action, payload) => call('admin-users', { action, payload }),
	tones: (action, payload) => call('admin-tones', { action, payload })
}

