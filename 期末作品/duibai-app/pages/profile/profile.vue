<template>
	<view class="page">
		<view class="topbar">
			<text class="title">我的</text>
		</view>

		<!-- 加载中：口吻表与对谈数 settle 后立即收起，最多等 1.2 秒 -->
		<view v-if="loading" class="center" aria-live="polite">
			<text class="t-hint">正在读取…</text>
		</view>

		<template v-else>
			<!-- 用户名（宋体大标题）+ 状态行 -->
			<view class="uwrap">
				<text class="uname">{{ nickname }}</text>
				<text class="usub">{{ statusLine }}</text>
			</view>

			<!-- 三格等宽大数字：场对谈 / 句台词 / 集可听（第 3 个用朱色） -->
			<view class="stats">
				<view v-for="s in stats" :key="s.key" class="stat card">
					<text class="stat-v" :class="{ vm: s.vm }">{{ s.value }}</text>
					<text class="stat-l">{{ s.label }}</text>
				</view>
			</view>

			<!-- 偏好 -->
			<text class="sec-label block">偏 好</text>
			<view class="card grp">
				<view class="prow first" hover-class="prow-hover" aria-label="默认对谈口吻" @tap="pickTone">
					<text class="prow-label">默认口吻</text>
					<text class="prow-value">{{ toneValue }}</text>
					<text class="prow-arrow">›</text>
				</view>
				<view class="prow" hover-class="prow-hover" aria-label="音色" @tap="voiceInfo">
					<text class="prow-label">音色</text>
					<text class="prow-value">女声 · 男声</text>
					<text class="prow-arrow">›</text>
				</view>
			</view>

			<!-- 其他 -->
			<text class="sec-label block">其 他</text>
			<view class="card grp">
				<view class="prow first" hover-class="prow-hover" aria-label="本地缓存" @tap="manageCache">
					<text class="prow-label">本地缓存</text>
					<text class="prow-value">{{ cacheText }}</text>
					<text class="prow-action">清理</text>
				</view>
				<view class="prow" hover-class="prow-hover" aria-label="意见反馈" @tap="feedback">
					<text class="prow-label">意见反馈</text>
					<text class="prow-value"></text>
					<text class="prow-arrow">›</text>
				</view>
				<view class="prow" hover-class="prow-hover" aria-label="关于对白" @tap="about">
					<text class="prow-label">关于对白</text>
					<text class="prow-value">v1.0.0</text>
					<text class="prow-arrow">›</text>
				</view>
			</view>

			<!-- 管理员入口：仅 role=admin 可见 -->
			<view v-if="isAdmin" class="card grp admin-card">
				<view class="prow first" hover-class="prow-hover" aria-label="对白后台" @tap="goAdmin">
					<text class="prow-label">对白后台</text>
					<text class="prow-value">管理员</text>
					<text class="prow-arrow">›</text>
				</view>
			</view>

			<view
				class="logout press"
				hover-class="logout-hover"
				:aria-label="logged ? '退出登录' : '去登录'"
				@tap="logged ? logout() : goLogin()"
			>
				<text class="logout-text">{{ logged ? '退出登录' : '去登录' }}</text>
			</view>

			<view class="tab-space"></view>
		</template>
	</view>
</template>

<script>
/**
 * 我的
 *
 * 结构按《八页最终样机》07：用户块 → 三格等宽大数字 → 「偏 好」「其 他」两组设置 → 退出登录。
 * 管理端入口只在 role=admin 时出现（普通用户看不到）。
 *
 * ★ 三态与诚实显示：
 *   未登录 —— 昵称「未登录」、状态行说明登录后能做什么、数字显示「—」、按钮「去登录」。
 *   ◆ 口吻读失败（loadTones）：显示「—」，不显示「未设置」——
 *     「未设置」会让人以为是自己没设，其实是没读到。
 *   ◆ 对谈数读失败（loadStat）：数字显示「—」，不显示 0 —— 0 会和「真的 0 场」混淆。
 *   ⚠️ 第 3 格用「集可听」（有音频、听得了的集数）。后端暂无「听完」埋点，
 *      写「听完」会是编出来的数字，故按真实可得数据命名为「可听」。
 *   ◆ 句台词 / 可听集数只统计「最近 20 场」；到达分页上限时数字后加「+」，
 *      表示"至少这么多"，不谎报为总数。
 */
import { getUser, clearAuth, setUser, script, feedback as fb, tone as toneApi } from '@/api/index.js'

/** script.list 第 1 页的分页上限（后端默认 size=20）。用于判断统计是否被截断。 */
const PAGE_SIZE = 20

export default {
	data () {
		return {
			loading: true,
			user: null,
			total: 0,
			linesTotal: 0,
			audioReady: 0,
			scripts: [],
			cache: 0,
			tones: [],
			toneError: false,
			statError: false
		}
	},
	computed: {
		logged () {
			return !!(this.user && this.user._id)
		},
		nickname () {
			return this.logged ? (this.user.nickname || '对白用户') : '未登录'
		},
		statusLine () {
			if (!this.logged) return '登录后，这里会存下你聊过的每一场'
			const n = this.statError ? '—' : this.total
			return '微信登录 · 聊过 ' + n + ' 场'
		},
		isAdmin () {
			return this.logged && this.user.role === 'admin'
		},
		/** 统计口径：句台词 / 可听集数只统计「最近 20 场」（script.list 第 1 页）。
		 *  当已加载条数达到分页上限，说明后面还有没被统计到的 → 数字后加「+」表示"至少这么多"。
		 *  没达到上限即为精确值，不加「+」。 */
		isCapped () {
			return this.scripts.length >= PAGE_SIZE
		},
		/** 数字：未登录或读失败一律「—」，绝不显示误导性的 0 */
		stats () {
			const bad = this.statError || !this.logged
			const suffix = this.isCapped ? '+' : ''
			return [
				{ key: 'scripts', label: '场 对 谈', value: bad ? '—' : String(this.total), vm: false },
				{ key: 'lines', label: '句 台 词', value: bad ? '—' : (this.linesTotal + suffix), vm: false },
				{ key: 'listened', label: '集 可 听', value: bad ? '—' : (this.audioReady + suffix), vm: true }
			]
		},
		toneValue () {
			if (this.toneError) return '—'
			const saved = uni.getStorageSync('duibai_default_tone') || ''
			if (!saved) return '未设置'
			const t = this.tones.find(x => x.code === saved)
			return t ? t.name : saved
		},
		cacheText () {
			if (!this.cache) return '—'
			return this.cache > 1024 ? (this.cache / 1024).toFixed(1) + ' MB' : this.cache + ' KB'
		}
	},
	onShow () {
		this.user = getUser()
		this.loading = true
		this.calcCache()
		// 三件事 settle 后立即收起（最多 1.2 秒上限，避免网络慢时一直转）
		const timer = setTimeout(() => { this.loading = false }, 1200)
		Promise.all([this.loadTones(), this.loadStat()]).then(() => {
			clearTimeout(timer)
			this.loading = false
		})
	},
	methods: {
		async loadTones () {
			try {
				// 走云函数，不走客户端直读
				this.tones = (await toneApi.list()) || []
				this.toneError = false
			} catch (e) {
				this.tones = []
				this.toneError = true
			}
		},
		async loadStat () {
			if (!this.logged) {
				this.total = 0
				this.linesTotal = 0
				this.audioReady = 0
				this.scripts = []
				this.statError = false
				return
			}
			try {
				const d = await script.list(1)
				const list = d.list || []
				this.total = d.total || 0
				this.scripts = list
				// 句数 / 可听集数按已加载的条数统计（列表分页，够用且不额外请求）；
				// 达到分页上限时由 isCapped 在数字后补「+」，不谎报为总数。
				this.linesTotal = list.reduce((n, s) => n + (Number(s.line_count) || 0), 0)
				this.audioReady = list.filter(s => s.status === 'audio_ready').length
				this.statError = false
			} catch (e) {
				this.statError = true
				this.total = 0
				this.linesTotal = 0
				this.audioReady = 0
				this.scripts = []
			}
		},
		calcCache () {
			try {
				const info = uni.getStorageInfoSync()
				// currentSize 单位是 KB
				this.cache = (info && info.currentSize) || 0
			} catch (e) { this.cache = 0 }
		},
		pickTone () {
			if (!this.tones.length) {
				uni.showToast({ title: '口吻列表还没加载出来', icon: 'none' })
				return
			}
			uni.showActionSheet({
				itemList: this.tones.map(t => t.name),
				success: (res) => {
					const t = this.tones[res.tapIndex]
					if (!t) return
					uni.setStorageSync('duibai_default_tone', t.code)
					uni.showToast({ title: '默认口吻：' + t.name, icon: 'success' })
					this.$forceUpdate()
				}
			})
		},
		voiceInfo () {
			uni.showModal({
				title: '音色',
				content: '每一场对谈都用一男一女两个音色，按对谈内容自动搭配，暂时不用手动选。',
				showCancel: false,
				confirmText: '知道了'
			})
		},
		manageCache () {
			uni.showModal({
				title: '清理缓存',
				content: '只清理本地临时数据，不会删除你的对谈记录。',
				confirmText: '清理',
				success: (r) => {
					if (!r.confirm) return
					// 保留登录态，清掉其余本地数据
					const info = uni.getStorageInfoSync()
					;(info.keys || []).forEach(k => {
						if (k !== 'duibai_token' && k !== 'duibai_user' && k !== 'duibai_default_tone') {
							uni.removeStorageSync(k)
						}
					})
					this.calcCache()
					uni.showToast({ title: '已清理', icon: 'success' })
				}
			})
		},
		feedback () {
			uni.showModal({
				title: '意见反馈',
				editable: true,
				placeholderText: '哪里不好用？或者你希望它有什么？',
				success: async (r) => {
					if (!r.confirm) return
					const content = String(r.content || '').trim()
					if (!content) {
						uni.showToast({ title: '还没写内容', icon: 'none' })
						return
					}
					try {
						await fb.add(content, '')
						uni.showToast({ title: '收到了，谢谢', icon: 'success' })
					} catch (e) {
						uni.showToast({ title: '提交失败，稍后再试', icon: 'none' })
					}
				}
			})
		},
		about () {
			uni.showModal({
				title: '关于对白',
				content: '把文章，聊给你听。\n\n把一篇书面文章改写成两个人的口语对谈，'
					+ '再合上双音色的声音，适合通勤、睡前这些看不了屏幕的时刻。\n\n'
					+ '每一句都能点回原文核对 —— 它不是朗读软件，是一场可以参与的谈话。',
				showCancel: false,
				confirmText: '知道了'
			})
		},
		goAdmin () {
			uni.navigateTo({ url: '/pages/admin/dashboard/index' })
		},
		goLogin () {
			uni.navigateTo({ url: '/pages/login/login' })
		},
		logout () {
			uni.showModal({
				title: '退出登录',
				content: '退出后本地不再保留登录状态，对谈记录仍在云端。',
				confirmText: '退出',
				success: (r) => {
					if (!r.confirm) return
					clearAuth()
					setUser(null)
					this.user = null
					this.total = 0
					this.linesTotal = 0
					this.audioReady = 0
					this.scripts = []
					uni.showToast({ title: '已退出', icon: 'success' })
				}
			})
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	padding: 0 $dui-s5;
	box-sizing: border-box;
}

.topbar {
	height: 88rpx;
	display: flex;
	flex-direction: row;
	align-items: center;
}

.title {
	font-family: $dui-font-serif;
	font-size: 48rpx;
	font-weight: $dui-fw-semi;
	letter-spacing: 1rpx;
	color: $dui-ink;
}

.center {
	padding: $dui-s8 0;
	display: flex;
	justify-content: center;
}

/* ---------- 用户块 ---------- */
.uwrap {
	padding: $dui-s5 0 $dui-s5;
}

.uname {
	display: block;
	font-family: $dui-font-serif;
	font-size: 48rpx;
	font-weight: $dui-fw-semi;
	letter-spacing: 1rpx;
	color: $dui-ink;
}

.usub {
	display: block;
	font-size: $dui-fs-caption;
	color: $dui-ink2;
	margin-top: $dui-s2;
}

/* ---------- 三格等宽大数字 ---------- */
.stats {
	display: flex;
	flex-direction: row;
	gap: $dui-s2;
	margin-bottom: $dui-s5;
}

.stat {
	flex: 1;
	padding: $dui-s4 $dui-s3;
	display: flex;
	flex-direction: column;
}

.stat-v {
	font-family: $dui-font-mono;
	font-size: 48rpx;
	font-weight: $dui-fw-bold;
	line-height: 1;
	letter-spacing: -1rpx;
	color: $dui-ink;
}

.stat-v.vm {
	color: $dui-vm;
}

.stat-l {
	font-family: $dui-font-serif;
	font-size: $dui-fs-label;
	color: $dui-ink2;
	margin-top: $dui-s2;
	letter-spacing: 1rpx;
}

/* ---------- 分组标签 ---------- */
.sec-label.block {
	display: block;
	margin: $dui-s5 0 $dui-s2;
}

/* ---------- 设置行（分组卡） ---------- */
.grp {
	padding: 0 $dui-s4;
}

.admin-card {
	margin-top: $dui-s4;
}

.prow {
	display: flex;
	flex-direction: row;
	align-items: center;
	height: 104rpx;
	border-top: 1rpx solid $dui-line2;
}

.prow.first {
	border-top: none;
}

.prow-hover {
	opacity: 0.65;
}

.prow-label {
	flex: 1;
	font-size: $dui-fs-body;
	color: $dui-ink;
}

.prow-value {
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	color: $dui-ink3;
	margin-right: $dui-s3;
}

.prow-action {
	font-size: $dui-fs-caption;
	font-weight: $dui-fw-semi;
	color: $dui-vm;
}

.prow-arrow {
	font-size: 30rpx;
	color: $dui-ink4;
}

/* ---------- 退出登录（朱色描边） ---------- */
.logout {
	margin-top: $dui-s7;
	height: 96rpx;
	border-radius: $dui-r-pill;
	border: 1rpx solid $dui-vm;
	display: flex;
	align-items: center;
	justify-content: center;
}

.logout-hover {
	background-color: $dui-vm-soft;
}

.logout-text {
	font-size: $dui-fs-bodyL;
	font-weight: $dui-fw-semi;
	color: $dui-vm;
}
</style>
