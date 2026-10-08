<template>
	<view class="dc">
		<!-- 标签行：宽字距标签 + 右侧「小朱点 + 等宽时长」
		     那个小朱点是个小巧思 —— 它是全屏唯一标出"这是今天的"的记号，
		     比写"今日"两个字更安静。 -->
		<view class="sec-head">
			<text class="sec-label">今 日 一 集</text>
			<view class="meta">
				<view class="dot-live"></view>
				<text class="sec-count">{{ metaShort }}</text>
			</view>
		</view>

		<view class="card body">
			<text class="title">{{ episode.title }}</text>

			<view class="dlg">
				<view
					v-for="(l, i) in previewLines"
					:key="i"
					class="ln"
					:class="l.speaker === 'B' ? 'ln-b' : 'ln-a'"
				>
					<view class="rail"></view>
					<text class="who">{{ l.speaker === 'B' ? '乙' : '甲' }}</text>
					<text class="say">{{ l.text }}</text>
				</view>
			</view>

			<view class="acts">
				<view class="act press" @tap="onPlay">
					<!-- ⚠️ 原来用内联 <svg>，微信小程序渲染器不认 → 整块空白。
					  改用 CSS 三角（border trick），不依赖字体有没有收录 ▷。 -->
					<view class="tri"></view>
					<text>听整集</text>
				</view>
				<text class="act-dim press" @tap="$emit('past')">{{ pastText }}</text>
			</view>
		</view>
	</view>
</template>

<script>
/**
 * DailyCard 今日一集
 *
 * 为什么有这个组件：新用户进来没有自己的文章，首页是空的、没事可做。
 * 「今日一集」解决冷启动 —— 不用上传，打开就有得听。
 *
 * ⚠️ 内容来自 daily_episodes（离线预置），读取走云函数 data.daily.list。
 *    绝不能用定时任务实时生成 —— 每天 1 次定时任务 = 30 函数小时/月，
 *    而免费额度约 11 个函数小时/月，会直接超额停服。
 *    也实测过客户端直读该集合会静默返回空，所以走云函数。
 *
 * 台词用「左右交错 + 竖轨」呈现 —— 这是「对白」的独有符号，
 * 而且它同时也是产品的真实形态（一场两个人的对谈）。
 */
import { daily as dailyApi } from '@/api/index.js'

const FALLBACK = {
	_id: 'fallback',
	title: '光合作用为什么分两步？',
	tone_code: 'bicker',
	toneName: '抬杠',
	duration_sec: 402,
	line_count: 18,
	lines: [
		{ speaker: 'A', text: '光合作用其实没那么难。' },
		{ speaker: 'B', text: '难的是课本非要写得这么复杂。' }
	]
}

export default {
	name: 'DailyCard',
	emits: ['play', 'past'],
	data () {
		return { episode: FALLBACK, pastList: [] }
	},
	computed: {
		previewLines () {
			const ls = this.episode && this.episode.lines
			return Array.isArray(ls) ? ls.slice(0, 2) : []
		},
		/** 往期入口要说清有几集，否则用户不知道值不值得点 */
		pastText () {
			return this.pastList.length > 0 ? ('往期 ' + this.pastList.length + ' →') : '往期 →'
		},
		/** 标签行右侧只放时长 —— 详情（口吻 · 句数）交给台词本身，避免标签行太长 */
		metaShort () {
			const e = this.episode || {}
			return e.duration_sec ? this.formatSec(e.duration_sec) : ''
		}
	},
	created () {
		this.load()
	},
	methods: {
		formatSec (s) {
			const m = Math.floor(s / 60)
			const r = s % 60
			return m + ':' + (r < 10 ? '0' + r : r)
		},
		onPlay () {
			this.$emit('play', this.episode)
		},
		async load () {
			try {
				const d = await dailyApi.list()
				if (d && d.today) {
					this.episode = d.today
					this.pastList = d.list || []
				} else {
					console.warn('[DailyCard] 云端没有可用的一集，使用兜底')
				}
			} catch (e) {
				console.warn('[DailyCard] 读取每日一集失败，使用兜底：', e && (e.message || e.error))
			}
		}
	}
}
</script>

<style lang="scss" scoped>
.body { padding: $dui-s5 $dui-s4; }

.meta {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 12rpx;
}

/* 巧思：标出"这是今天的一集"的小朱点 */
.dot-live {
	width: 8rpx;
	height: 8rpx;
	border-radius: 4rpx;
	background-color: $dui-vm;
}

.title {
	display: block;
	font-family: $dui-font-serif;
	font-size: $dui-fs-h2;
	font-weight: $dui-fw-semi;
	line-height: $dui-lh-h2;
	color: $dui-ink;
	margin-bottom: $dui-s4;
}

.dlg {
	display: flex;
	flex-direction: column;
	gap: $dui-s2;
}

/* ★ 左右交错：甲靠左、乙靠右，各一条竖轨 —— 「对白」的独有符号 */
.ln {
	display: flex;
	flex-direction: row;
	align-items: flex-start;
	gap: 14rpx;
	max-width: 94%;
}

.ln-a { align-self: flex-start; }

.ln-b {
	align-self: flex-end;
	flex-direction: row-reverse;
}

.rail {
	width: 5rpx;
	border-radius: 3rpx;
	align-self: stretch;
	min-height: 30rpx;
	flex-shrink: 0;
}

.ln-a .rail { background-color: $dui-ink; }
.ln-b .rail { background-color: $dui-vm; }

.who {
	font-size: 19rpx;
	font-weight: $dui-fw-bold;
	flex-shrink: 0;
	padding-top: 6rpx;
}

.ln-a .who { color: $dui-ink2; }
.ln-b .who { color: $dui-vm; }

.say {
	font-size: $dui-fs-body;
	line-height: $dui-lh-body;
	color: $dui-ink;
}

.ln-b .say {
	color: $dui-vm;
	text-align: right;
}

.acts {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	margin-top: $dui-s6;
	/* 触摸目标 ≥88rpx(44pt)：这两个动作原本只有行高约 40rpx，远低于标准 */
	min-height: 88rpx;
}

.act {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 12rpx;
	font-size: $dui-fs-body;
	font-weight: $dui-fw-semi;
	color: $dui-vm;
}

/* CSS 三角：比 <svg> 可靠，也不赌字体有没有收录 ▷ */
.tri {
	width: 0;
	height: 0;
	border-left: 12rpx solid $dui-vm;
	border-top: 7rpx solid transparent;
	border-bottom: 7rpx solid transparent;
	flex-shrink: 0;
}

.act-dim {
	font-size: $dui-fs-body;
	font-weight: $dui-fw-semi;
	color: $dui-vm;
	/* ⚠️ 这里原来有 opacity: 0.7 —— $dui-vm 叠 0.7 后压卡片底只剩 3.01:1。
	   去掉后 4.97:1。要"次级感"请用字号或更浅的色，不要用降透明度：
	   降透明度会同时削弱对比度，是可用性问题。 */
}
</style>
