<template>
	<view class="page">
		<view class="hero" aria-live="polite">
			<view class="badge"><text class="badge-text">{{ glyph }}</text></view>
			<text class="headline">{{ title }}</text>
			<text class="desc">{{ desc }}</text>

			<view v-if="reason" class="reason">
				<text class="reason-label">原因</text>
				<text class="reason-text">{{ reason }}</text>
			</view>
		</view>

		<view class="actions">
			<view class="btn press-ink" hover-class="btn-hover" @tap="primary">
				<text class="btn-text">{{ primaryText }}</text>
			</view>
			<view v-if="secondaryText" class="btn btn-ghost press" hover-class="ghost-hover" @tap="secondary">
				<text class="ghost-text">{{ secondaryText }}</text>
			</view>
		</view>
	</view>
</template>

<script>
/**
 * 错误与降级页
 *
 * 设计立场：**绝不写「系统错误，请稍后重试」** —— 必须说清**原因**和**下一步做什么**。
 * 两类典型场景：
 *   · not_suitable  —— 内容主要由表格/公式组成，改写后无法可靠朗读
 *   · tts_down      —— 声音合成不可用，但**文字稿已经保存**（可稍后再试）
 *
 * 通过路由参数 type 区分：
 *   /pages/error/error?type=not_suitable&reason=xxx
 *
 * ⚠️ 文案面向用户，不出现技术错误码；generic 无 reason 时布局保持稳定。
 */
const PRESET = {
	not_suitable: {
		glyph: '形',
		title: '这篇文章暂时聊不起来',
		desc: '它更像一份数据而不是一段话。',
		reason: '内容主要由表格和公式组成，改写后没法可靠地念出来。',
		primaryText: '换一篇文章',
		secondaryText: '返回首页'
	},
	tts_down: {
		glyph: '声',
		title: '声音暂时做不出来',
		desc: '但文字稿已经给你留好了。',
		reason: '声音服务此刻不可用。你可以先看文字稿，稍后再回来做声音。',
		primaryText: '先看文字稿',
		secondaryText: '稍后再说'
	},
	no_key: {
		glyph: '配',
		title: '服务端还没配置好',
		desc: '这是开发期的问题，不是你的操作问题。',
		reason: '云函数缺少必要的配置。',
		primaryText: '返回首页',
		secondaryText: ''
	},
	generic: {
		glyph: '！',
		title: '出了点问题',
		desc: '但没你想的那么严重。',
		reason: '',
		primaryText: '重试',
		secondaryText: '返回首页'
	}
}

export default {
	data () {
		return {
			type: 'generic',
			glyph: '！',
			title: '出了点问题',
			desc: '',
			reason: '',
			primaryText: '重试',
			secondaryText: '返回首页',
			scriptId: ''
		}
	},
	onLoad (options) {
		const t = (options && options.type) || 'generic'
		const preset = PRESET[t] || PRESET.generic
		Object.assign(this, preset)
		this.type = t
		this.scriptId = (options && options.script_id) || ''
		// 允许调用方传更具体的原因（覆盖预置文案）
		if (options && options.reason) {
			this.reason = decodeURIComponent(options.reason)
		}
	},
	methods: {
		primary () {
			if (this.type === 'tts_down' && this.scriptId) {
				uni.redirectTo({ url: `/pages/result/result?script_id=${this.scriptId}` })
				return
			}
			if (this.type === 'not_suitable') {
				uni.switchTab({ url: '/pages/index/index' })
				return
			}
			uni.navigateBack({ delta: 1 })
		},
		secondary () {
			uni.switchTab({ url: '/pages/index/index' })
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	padding: 0 $dui-s5;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
}

.hero {
	padding-top: 200rpx;
}

.badge {
	width: 120rpx;
	height: 120rpx;
	border-radius: 60rpx;
	background-color: $dui-card;
	border: 1rpx solid $dui-line;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-bottom: $dui-s5;
}

.badge-text {
	font-family: $dui-font-serif;
	font-size: 48rpx;
	font-weight: $dui-fw-semi;
	color: $dui-ink3;
}

.headline {
	display: block;
	font-family: $dui-font-serif;
	font-size: 40rpx;
	font-weight: $dui-fw-semi;
	color: $dui-ink;
	line-height: 1.4;
	margin-bottom: $dui-s2;
}

.desc {
	display: block;
	font-size: $dui-fs-body;
	color: $dui-ink2;
	line-height: $dui-lh-body;
}

.reason {
	margin-top: $dui-s5;
	padding: $dui-s4;
	background-color: $dui-card;
	border: 1rpx solid $dui-line;
	border-radius: $dui-r-card;
}

.reason-label {
	display: block;
	font-family: $dui-font-serif;
	font-size: $dui-fs-label;
	font-weight: $dui-fw-bold;
	letter-spacing: $dui-ls-label;
	color: $dui-ink3;
	margin-bottom: $dui-s2;
}

.reason-text {
	font-size: $dui-fs-body;
	line-height: $dui-lh-body;
	color: $dui-ink2;
}

.actions {
	margin-top: $dui-s7;
	padding-bottom: $dui-s7;
}

/* 主/次按钮样式由全局 .btn / .btn-ghost 提供（96rpx ≥ 88rpx），这里只补行距 */
.btn {
	margin-bottom: $dui-s2;
}

.btn-hover {
	opacity: 0.88;
}

.ghost-hover {
	background-color: $dui-press;
}

.btn-text {
	font-size: 30rpx;
	font-weight: $dui-fw-medium;
	color: $dui-on-ink;
	letter-spacing: 1rpx;
}

.ghost-text {
	font-size: 28rpx;
	color: $dui-ink;
}
</style>
