<template>
	<view class="page">
		<view class="topbar">
			<view class="bar-slot" hover-class="bar-hit" aria-label="返回" @tap="back">
				<text class="bar-glyph">← 返回</text>
			</view>
			<text class="topbar-title">每日一集</text>
			<text class="topbar-count">{{ pastList.length ? '共 ' + pastList.length : '' }}</text>
		</view>

		<!-- 今日大卡 -->
		<view class="today">
			<view class="dhead">
				<text class="tag">{{ todayLabel }}</text>
				<text class="meta">{{ todayMeta }}</text>
			</view>
			<text class="dtitle">{{ today.title }}</text>

			<!-- 两句台词左右交错：甲左墨轨 / 乙右朱轨 -->
			<view class="dlg">
				<view
					v-for="(l, i) in todayPreview"
					:key="i"
					class="ln"
					:class="l.speaker === 'B' ? 'b' : 'a'"
				>
					<view class="rl"></view>
					<text class="who" :aria-label="l.speaker === 'B' ? '乙说' : '甲说'">{{ l.speaker === 'B' ? '乙' : '甲' }}</text>
					<text class="say">{{ l.text }}</text>
				</view>
			</view>

			<view class="play" hover-class="play-hover" :aria-label="'开始听：' + today.title" @tap="play(today)">
				<text class="play-text">▶　开始听</text>
			</view>
		</view>

		<!-- ★ 往期：时间轴，不是列表。
		     网格/列表 = 内容广场 = 视觉噪音；时间轴天然带「积累感」——
		     7 集就是 7 天，用户能感觉到自己攒下了什么。
		     实心点/空心点表示听过没，一眼可扫，不用文字解释。 -->
		<view class="past" aria-live="polite">
			<view class="sec-head">
				<text class="sec-label">往 期</text>
				<text class="sec-count">{{ pastList.length || '' }}</text>
			</view>

			<view v-if="loading" class="loading"><text class="t-hint">加载中…</text></view>

			<!-- C 读取失败：必须与"真没有往期"分开说，绝不伪装成"没准备" -->
			<empty-state
				v-else-if="loadError"
				glyph="断"
				title="往期没读出来"
				desc="网络好像不太顺，再试一次。"
				action-text="重试"
				@action="load"
			/>

			<view v-else-if="pastList.length" class="tl">
				<view
					v-for="(e, i) in pastList"
					:key="e._id"
					class="node"
					hover-class="node-hover"
					@tap="play(e)"
				>
					<view class="rail">
						<view class="dot" :class="{ on: listened(e._id) }"></view>
						<view v-if="i < pastList.length - 1" class="line"></view>
					</view>
					<view class="body">
						<text class="n-date">{{ dateLabel(e.date_key) }}</text>
						<text class="n-title">{{ e.title }}</text>
						<text class="n-meta">{{ e.toneName || e.tone_code }} · {{ e.line_count || 0 }} 句 · {{ fmt(e.duration_sec) }}</text>
					</view>
					<text class="n-cta">›</text>
				</view>
			</view>

			<empty-state v-else glyph="集" title="往期还在准备" desc="从今天开始，每天一集。" />
		</view>

		<text class="foot">每天一集，不用你上传，打开就能听。空心点是没听过的。</text>
	</view>
</template>

<script>
/**
 * 每日一集
 *
 * 数据来自 daily_episodes（**离线预置**），读取走云函数 `data.daily.list`，
 * 读不到时用兜底数据，保证页面不开天窗。
 *
 * ★ 往期用时间轴而不是列表：网格是内容广场（视觉噪音、与「呼吸感」相悖），
 *   时间轴天然带积累感 —— 7 集就是 7 天，用户能感觉到自己攒下了什么。
 *   实心点/空心点自带"听过没"的确定性，一眼可扫、不用文字解释。
 *
 * ⚠️ 绝不用定时任务实时生成 —— 见 DailyCard.vue 注释。
 *
 * ⚠️ 读失败 ≠ 没数据（体验规范 §3.1 硬伤）：以前 `daily.list` 失败只 `console.warn`、
 *    `pastList=[]` → 会显示"往期还在准备"，**把读失败伪装成没准备**。
 *    现在加 `loadError` 标记：显示"往期没读出来" + 重试，与"真没有往期"的文案/图标都不同。
 *    今日卡有兜底（FALLBACK_TODAY），失败只给一条不打断的轻提示。
 */
import EmptyState from '@/components/EmptyState/EmptyState.vue'
import { daily as dailyApi } from '@/api/index.js'
import { goDialogue } from '@/utils/nav.js'

/** 听过哪些集：记在本地，不写云端（这只是"我读过没有"的个人痕迹，不该占用云资源） */
const LISTENED_KEY = 'duibai_daily_listened'

const FALLBACK_TODAY = {
	_id: 'fallback',
	date_key: 0,
	title: '光合作用为什么分两步？',
	tone_code: 'bicker',
	toneName: '抬杠',
	duration_sec: 402,
	line_count: 18,
	lines: [
		{ speaker: 'A', text: '光合作用其实没那么难。' },
		{ speaker: 'B', text: '难的是课本非要写得这么复杂。' },
		{ speaker: 'A', text: '那光反应到底在干嘛？' }
	]
}

export default {
	components: { EmptyState },
	data () {
		return {
			today: FALLBACK_TODAY,
			pastList: [],
			loading: true,
			loadError: false
		}
	},
	computed: {
		todayLabel () {
			const d = new Date()
			return '今日 · ' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
		},
		todayMeta () {
			const e = this.today || {}
			const p = []
			if (e.toneName || e.tone_code) p.push(e.toneName || e.tone_code)
			if (e.duration_sec) p.push(this.fmt(e.duration_sec))
			return p.join(' · ')
		},
		todayPreview () {
			const ls = this.today && this.today.lines
			return Array.isArray(ls) ? ls.slice(0, 2) : []
		}
	},
	onLoad () {
		this.load()
	},
	methods: {
		back () {
			uni.navigateBack({ delta: 1 })
		},
		fmt (s) {
			if (!s) return ''
			const m = Math.floor(s / 60)
			const r = s % 60
			return m + ':' + (r < 10 ? '0' + r : r)
		},
		/** 20261002 → 10-02
		 *  ⚠️ 原来返回 "10月2日"：一是没补前导零（10月2日 vs 10-02），
		 *     二是中文月/日让它看起来不像一串等宽数据。
		 *     统一 MM-DD，与「01/07」那类编号是同一套数字语言。 */
		dateLabel (key) {
			const k = String(key || '')
			if (k.length !== 8) return '—'
			// ⚠️ 这里**不能**用 Number()、也**不需要**补前导零：
			//    k 是 8 位串 'YYYYMMDD'，slice(4,6)/slice(6,8) 拿到的已经是两位
			//    （前导零本来就在里面）。原代码用 Number() 反而把 '02' 变成 2，
			//    于是显示成「10月2日」；若再去"补零"更会变成 '002'。
			//    正确做法：原样切片。
			return k.slice(4, 6) + '-' + k.slice(6, 8)
		},
		todayKey () {
			const d = new Date()
			const p = n => (n < 10 ? '0' + n : '' + n)
			return Number('' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()))
		},
		async load () {
			this.loading = true
			this.loadError = false
			try {
				// 走云函数，不走客户端直读（客户端读 daily_episodes 会静默返回空）
				const d = await dailyApi.list()
				if (d && d.today) {
					this.today = d.today
					this.pastList = d.list || []
				}
			} catch (e) {
				// ★ 读失败必须能自证：标记 loadError，并给一条不打断的轻提示
				this.loadError = true
				console.warn('[daily] 读取失败：', e && (e.message || e.error))
				uni.showToast({ title: '每日一集暂时读不到', icon: 'none' })
			} finally {
				this.loading = false
			}
		},
		/** 是否听过（本地记录，不写云端） */
		listened (id) {
			try {
				const arr = uni.getStorageSync(LISTENED_KEY) || []
				return Array.isArray(arr) && arr.indexOf(id) >= 0
			} catch (e) { return false }
		},
		markListened (id) {
			try {
				const arr = uni.getStorageSync(LISTENED_KEY) || []
				if (Array.isArray(arr) && arr.indexOf(id) < 0) {
					arr.push(id)
					uni.setStorageSync(LISTENED_KEY, arr.slice(-60))
				}
			} catch (e) { /* 记不住不影响使用 */ }
		},
		play (e) {
			goDialogue({ episodeId: e._id, tag: 'daily' })
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	/* 这个页面没有 tabBar（navigateTo 进来的），底部留出安全区 */
	padding: 0 $dui-s5 $dui-s7;
	box-sizing: border-box;
}

.topbar {
	height: 88rpx;
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
}

.bar-slot {
	height: 88rpx;
	display: flex;
	align-items: center;
}

.bar-glyph {
	font-size: $dui-fs-body;
	color: $dui-ink2;
}

.bar-hit {
	opacity: 0.5;
}

.topbar-title {
	flex: 1;
	text-align: center;
	font-size: $dui-fs-body;
	color: $dui-ink2;
}

.topbar-count {
	min-width: 88rpx;
	text-align: right;
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	letter-spacing: $dui-ls-num;
	color: $dui-ink3;
}

/* 今日大卡：一张真正的卡（更亮的纸 + 极细边） */
.today {
	background-color: $dui-card;
	border: 1rpx solid $dui-line;
	border-radius: $dui-r-card;
	padding: $dui-s4;
	margin-bottom: $dui-s6;
}

.dhead {
	display: flex;
	flex-direction: row;
	align-items: baseline;
	justify-content: space-between;
	margin-bottom: $dui-s3;
}

.tag {
	font-family: $dui-font-mono;
	font-size: $dui-fs-label;
	letter-spacing: $dui-ls-label;
	color: $dui-vm;
}

.meta {
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	letter-spacing: $dui-ls-num;
	color: $dui-ink3;
}

.dtitle {
	display: block;
	font-family: $dui-font-serif;
	font-size: $dui-fs-h1;
	font-weight: $dui-fw-semi;
	line-height: $dui-lh-h1;
	letter-spacing: $dui-ls-h1;
	color: $dui-ink;
	margin-bottom: $dui-s4;
}

/* 台词：左右交错，各带一条竖轨（甲墨 / 乙朱） */
.dlg {
	display: flex;
	flex-direction: column;
}

.ln {
	display: flex;
	flex-direction: row;
	align-items: flex-start;
	max-width: 96%;
	margin-bottom: $dui-s2;
}

.dlg .ln:last-child {
	margin-bottom: 0;
}

.ln.a {
	align-self: flex-start;
}

.ln.b {
	align-self: flex-end;
	flex-direction: row-reverse;
}

.rl {
	width: 6rpx;
	border-radius: 3rpx;
	align-self: stretch;
	min-height: 26rpx;
	flex-shrink: 0;
}

.a .rl {
	background-color: $dui-ink;
}

.b .rl {
	background-color: $dui-vm;
}

.who {
	font-size: $dui-fs-label;
	font-weight: $dui-fw-bold;
	flex-shrink: 0;
	padding-top: 2rpx;
}

.a .who {
	color: $dui-ink2;
}

.b .who {
	color: $dui-vm;
}

.say {
	font-size: $dui-fs-body;
	line-height: $dui-lh-body;
	color: $dui-ink;
}

.b .say {
	color: $dui-vm;
	text-align: right;
}

.ln .rl + .who {
	margin: 0 $dui-s1;
}

.play {
	margin-top: $dui-s4;
	height: 96rpx;
	border-radius: $dui-r-pill;
	background-color: $dui-ink;
	display: flex;
	align-items: center;
	justify-content: center;
}

.play-hover {
	opacity: 0.88;
}

.play-text {
	font-size: $dui-fs-bodyL;
	font-weight: $dui-fw-medium;
	color: $dui-on-ink;
	letter-spacing: 1rpx;
}

/* 往期 */
.past {
	padding-top: $dui-s2;
}

.loading {
	padding: $dui-s5 0;
}

.tl {
	margin-top: $dui-s2;
}

.node {
	display: flex;
	flex-direction: row;
	align-items: flex-start;
	min-height: 88rpx;
	padding: $dui-s3 0;
	box-sizing: border-box;
}

.node-hover {
	opacity: 0.7;
}

.rail {
	width: 40rpx;
	display: flex;
	flex-direction: column;
	align-items: center;
	flex-shrink: 0;
	/* ⚠️ 必须 stretch：父级 .node 是 align-items: flex-start，
	   若 .rail 按内容收缩，里面的 .line(flex:1) 会分到 0 高度，
	   竖线就整条消失 —— 表现为"时间轴只剩一列孤零零的点"。 */
	align-self: stretch;
}

/* 空心点 = 没听过；实心朱点 = 听过 */
.dot {
	width: 14rpx;
	height: 14rpx;
	border-radius: $dui-r-pill;
	border: 2rpx solid $dui-ink4;
	margin-top: 12rpx;
	background-color: transparent;
	box-sizing: border-box;
}

.dot.on {
	background-color: $dui-vm;
	border-color: $dui-vm;
}

.line {
	flex: 1;
	width: 1rpx;
	background-color: $dui-line;
	margin-top: 6rpx;
}

.body {
	flex: 1;
	min-width: 0;
}

.n-date {
	display: block;
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	letter-spacing: $dui-ls-num;
	color: $dui-ink3;
	margin-bottom: 6rpx;
}

.n-title {
	display: block;
	font-size: $dui-fs-body;
	color: $dui-ink;
	line-height: $dui-lh-body;
	margin-bottom: 4rpx;
}

.n-meta {
	display: block;
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	color: $dui-ink3;
}

.n-cta {
	flex-shrink: 0;
	font-size: $dui-fs-caption;
	color: $dui-ink3;
	margin-left: $dui-s2;
}

.foot {
	display: block;
	font-size: $dui-fs-caption;
	color: $dui-ink3;
	margin-top: $dui-s5;
	line-height: $dui-lh-caption;
}
</style>
