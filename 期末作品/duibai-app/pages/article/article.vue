<template>
	<view class="page">
		<view class="topbar">
			<view class="back tap-88" hover-class="back-hover" aria-label="返回" @tap="back">
				<text class="back-text">‹ 返回</text>
			</view>
			<text class="nav">原文</text>
			<text v-if="paras.length" class="nav-count t-num">{{ paras.length }} 段</text>
			<text v-else class="nav-count"></text>
		</view>

		<view v-if="loading" class="center" aria-live="polite">
			<text class="t-hint">正在打开原文…</text>
		</view>

		<!-- ★ C 读取失败：与「没删」「没登录」都不同 -->
		<empty-state
			v-else-if="loadError"
			glyph="断"
			title="原文没读出来"
			desc="网络或服务一时没回应，不是文章被删了，再试一次。"
			action-text="重试"
			@action="load"
		/>

		<!-- ★ A 未登录 -->
		<empty-state
			v-else-if="!logged"
			glyph="锁"
			title="登录后可以查看原文"
			desc="原文只给登录的你核对每一句的出处。"
			action-text="去登录"
			@action="goLogin"
		/>

		<!-- ★ B 真无原文 -->
		<empty-state
			v-else-if="!paras.length"
			glyph="空"
			title="这篇文章没有可用原文"
			desc="它可能没有被切出段落。"
			action-text="返回"
			@action="back"
		/>

		<scroll-view v-else class="scroll" scroll-y :scroll-into-view="anchor" :scroll-with-animation="true">
			<text class="a-title">{{ article.title || '未命名文章' }}</text>
			<text class="a-meta t-num">{{ charCount }} 字</text>

			<view class="paras">
				<view
					v-for="p in paras"
					:key="p._id"
					class="para"
					:class="{ hl: p.seq === targetSeq }"
					:id="'p' + p.seq"
				>
					<text class="p-num">P{{ p.seq }}</text>
					<text class="para-text">{{ p.text }}</text>
				</view>
			</view>

			<view class="foot">
				<text class="foot-text">这一页只做一件事：定位并高亮对应段落。</text>
			</view>
		</scroll-view>
	</view>
</template>

<script>
/**
 * 原文页
 *
 * 存在的意义：**证明对话不是凭空编的** —— 从结果页/确认页点「出处 P3」进来，
 * 自动滚到第 3 段并高亮。
 *
 * 设计：**只做定位 + 高亮**，不加任何其它功能（避免用户在这页迷路）。
 * 每段前给等宽朱色编号（P1 / P2 / P3），和结果页的「出处 Pn」用同一套符号。
 *
 * ★ 三种「空」分三态（原先 catch 把网络失败一律说成「原文可能已被清理」）：
 *   A 未登录   → 「登录后可以查看原文」+ 去登录
 *   B 真无原文 → 「这篇文章没有可用原文」+ 返回
 *   C 读取失败 → 新增 loadError：「原文没读出来」+ 重试
 */
import { article as articleApi, paragraph, getUser } from '@/api/index.js'
import EmptyState from '@/components/EmptyState/EmptyState.vue'

export default {
	components: { EmptyState },
	data () {
		return {
			loading: true,
			loadError: false,
			logged: false,
			articleId: '',
			targetSeq: 0,
			anchor: '',
			article: {},
			paras: []
		}
	},
	computed: {
		charCount () {
			return this.paras.reduce((n, p) => n + String(p.text || '').length, 0)
		}
	},
	onLoad (options) {
		this.articleId = (options && options.article_id) || ''
		this.targetSeq = Number((options && options.seq) || 0)
		this.logged = !!getUser()
		this.load()
	},
	methods: {
		back () {
			uni.navigateBack({ delta: 1 })
		},
		goLogin () {
			uni.navigateTo({ url: '/pages/login/login' })
		},
		async load () {
			this.loadError = false
			// 未登录：不请求（必失败），交给 A 态引导，别把失败说成内容被清
			if (!this.logged) {
				this.loading = false
				return
			}
			this.loading = true
			try {
				if (this.articleId) {
					this.article = await articleApi.get(this.articleId) || {}
				}
				this.paras = await paragraph.list(this.articleId) || []
				// 延迟一拍再设锚点，确保列表已渲染、滚动才生效
				if (this.targetSeq) {
					setTimeout(() => { this.anchor = 'p' + this.targetSeq }, 260)
				}
			} catch (e) {
				console.warn('[article] 载入失败：', e && (e.message || e.error))
				this.loadError = true
				this.paras = []
			} finally {
				this.loading = false
			}
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	height: 100vh;
	display: flex;
	flex-direction: column;
	background-color: $dui-page;
	box-sizing: border-box;
	padding: 0 $dui-s5;
}

.topbar {
	height: 88rpx;
	flex-shrink: 0;
	display: flex;
	flex-direction: row;
	align-items: center;
}

.back {
	/* .tap-88 已把热区撑到 88rpx，视觉尺寸不变 */
	flex-shrink: 0;
}

.back-hover {
	opacity: 0.6;
}

.back-text {
	font-size: $dui-fs-caption;
	color: $dui-ink2;
}

.nav {
	flex: 1;
	font-size: $dui-fs-caption;
	color: $dui-ink2;
	text-align: center;
}

.nav-count {
	flex-shrink: 0;
}

.scroll {
	flex: 1;
	min-height: 0;
}

.a-title {
	display: block;
	font-family: $dui-font-serif;
	font-size: $dui-fs-h2;
	font-weight: $dui-fw-semi;
	line-height: $dui-lh-h2;
	color: $dui-ink;
	margin: $dui-s4 0 $dui-s2;
}

.a-meta {
	display: block;
	color: $dui-ink3;
	margin-bottom: $dui-s5;
}

.para {
	padding: $dui-s2 0 $dui-s2 $dui-s3;
	border-left: 6rpx solid transparent;
	margin-bottom: $dui-s3;
}

/* 目标段落：左侧朱色竖条 + 浅底，一眼能找到 */
.hl {
	border-left-color: $dui-vm;
	background-color: $dui-vm-soft;
	border-radius: 0 $dui-r-card $dui-r-card 0;
	padding-right: $dui-s3;
}

/* 段落编号：等宽 + 朱色，与结果页「出处 Pn」同符号 */
.p-num {
	display: block;
	font-family: $dui-font-mono;
	font-size: $dui-fs-label;
	letter-spacing: 1rpx;
	color: $dui-vm;
	margin-bottom: $dui-s1;
}

.para-text {
	font-size: 29rpx;
	line-height: 1.8;
	color: $dui-ink2;
}

.hl .para-text {
	color: $dui-ink;
}

.foot {
	padding: $dui-s6 0 $dui-s8;
}

.foot-text {
	font-size: $dui-fs-num;
	color: $dui-ink3;
}

.center {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
}
</style>
