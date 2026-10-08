<template>
	<view class="page">
		<!-- ========== 展开态：输入文章（原地展开，不跳页） ========== -->
		<template v-if="expanded">
			<view class="topbar">
				<text class="back press" @tap="collapse">← 收起</text>
				<text class="topbar-title">投一篇文章</text>
			</view>

			<upload-card v-model="content" :max="3000" />

			<tone-selector v-model="toneCode" />

			<view class="submit">
				<view
					class="btn press-ink"
					:class="{ disabled: !canSubmit || submitting }"
					@tap="start"
				>
					<text class="btn-text">{{ submitting ? '正在提交…' : '开始聊' }}</text>
				</view>
				<text v-if="!canSubmit" class="btn-tip">先粘贴一篇文章，或从聊天里选个文件</text>
			</view>
		</template>

		<!-- ========== 默认态 ========== -->
		<template v-else>
			<!-- ① 标题行 -->
			<view class="head">
				<text class="brand">对白</text>
				<text class="t-num">{{ todayStamp }}</text>
			</view>

			<!-- ② 主功能：E1 一行输入框
			     全页唯一带「占位文字 + 动作按钮」的控件，所以一眼看得出能点。
			     它和下面的卡片同色，靠更圆的圆角与朱色圆按钮区分。
			     占位文字末尾的省略号是关键 —— 它天然暗示"这里可以往里面写"。 -->
			<view class="cta-main press" hover-class="cta-hover" @tap="expand">
				<text class="cta-ph">把文章贴进来…</text>
				<view class="cta-btn">
					<!-- ⚠️ 原来用内联 <svg>。uni-app 会把它透传到 WXML，但
					  **微信小程序渲染器不认 <svg> 标签** → 整个按钮空白。
					  改用字符 ↑：它和页面里能正常显示的「→」同属 U+2190 箭头区，
					  字体覆盖一致，比赌 <svg> 稳得多。 -->
					<text class="cta-ico">↑</text>
				</view>
			</view>

			<!-- ③ 续听条：有记录才出现，极轻一行（不占整块） -->
			<view v-if="lastView" class="resume press" @tap="resume">
				<text class="resume-when">{{ resumeWhen }}</text>
				<text class="resume-line">{{ resumeText }}</text>
				<text class="t-vm resume-go">继续 →</text>
			</view>

			<!-- ④ 今日一集 -->
			<daily-card @play="playEpisode" @past="goDaily" />

			<!-- ⑤ 我聊过的 -->
			<view class="sec-head">
				<text class="sec-label">我 聊 过 的</text>
				<text v-if="recent.length" class="sec-act press" @tap="goHistory">全部 →</text>
			</view>

			<view v-if="loading" class="loading"><text class="t-hint">加载中…</text></view>

			<view v-else-if="recent.length" class="card recent-card">
				<task-list-item
					v-for="(t, i) in recent"
					:key="t._id"
					:task="t"
					:divider="i > 0"
					@tap="openTask"
				/>
			</view>

			<!-- ★ 空状态必须区分「没聊过」和「没登录」——
			     未登录也说「还没聊过」是误导：用户明明聊过，只是登录态没了。 -->
			<empty-state
				v-else
				glyph="谈"
				:title="logged ? '还没聊过' : '登录后，这里会存下你聊过的每一场'"
				:desc="logged ? '投一篇文章，听两个人把它聊开。' : '不用注册，微信一键登录。'"
				:action-text="logged ? '去投一篇文章' : '去登录'"
				@action="logged ? expand() : goLogin()"
			/>

			<view class="tab-space"></view>
		</template>
	</view>
</template>

<script>
/**
 * 首页
 *
 * 结构（自上而下，与《八页最终样机》01 一致）：
 *   标题行 → 主功能 E1 → 续听条 → 今日一集 → 我聊过的
 *
 * 三层层级，靠"结构"而不是"颜色"建立：
 *   · 主功能：全页唯一的「输入框」形态（占位文字 + 动作按钮）
 *   · 今日一集 / 我聊过的：卡片，靠标签行分隔
 *   · 续听条：极轻的一行，有记录才出现
 *
 * 文案原则：写「开始聊」而不是「开始生成」——"生成"是技术语言。
 */
import { article, script, getUser } from '@/api/index.js'
import { goDialogue } from '@/utils/nav.js'
import { readLastView, lastViewWhen } from '@/utils/format.js'

// ⚠️ 组件一律显式 import + 注册，不依赖 easycom（实测 autoscan 在本工程不生效）
import DailyCard from '@/components/DailyCard/DailyCard.vue'
import UploadCard from '@/components/UploadCard/UploadCard.vue'
import ToneSelector from '@/components/ToneSelector/ToneSelector.vue'
import TaskListItem from '@/components/TaskListItem/TaskListItem.vue'
import EmptyState from '@/components/EmptyState/EmptyState.vue'

export default {
	components: { DailyCard, UploadCard, ToneSelector, TaskListItem, EmptyState },
	data () {
		return {
			expanded: false,
			content: '',
			toneCode: '',
			submitting: false,
			loading: true,
			recent: [],
			logged: false,
			lastView: null
		}
	},
	computed: {
		canSubmit () {
			return !!this.content && this.content.trim().length > 0
		},
		/** 标题行右侧：今天的日期落款（等宽）。
		 *  ⚠️ 原来这里写死过 '01 / 07'，那是我画样机时编的假数据 ——
		 *     真实产品里不该有编出来的数字。改成日期：零依赖，而且"日期落款"本身就纸墨。 */
		todayStamp () {
			const d = new Date()
			const p = n => (n < 10 ? '0' + n : '' + n)
			return p(d.getMonth() + 1) + '-' + p(d.getDate())
		},
		resumeWhen () {
			const v = this.lastView
			if (!v) return ''
			const when = lastViewWhen(v.at)
			const idx = typeof v.i === 'number' ? v.i + 1 : 0
			return idx > 0 ? (when + ' · 听到第 ' + idx + ' 句') : when
		},
		resumeText () {
			const v = this.lastView
			return (v && v.text) || '继续上次的对谈'
		}
	},
	onShow () {
		this.logged = !!getUser()
		this.loadRecent()
		this.loadLastView()
	},
	methods: {
		loadLastView () {
			const v = readLastView()
			// 只有近 7 天内的记录才提示续听，更早的就不提了
			if (v && v.id && (!v.at || Date.now() - v.at < 7 * 86400000)) {
				this.lastView = v
			} else {
				this.lastView = null
			}
		},
		expand () {
			this.expanded = true
		},
		collapse () {
			this.expanded = false
		},
		resume () {
			const v = this.lastView
			if (!v || !v.id) return
			if (v.type === 'e') goDialogue({ episodeId: v.id, tag: 'index-resume' })
			else goDialogue({ scriptId: v.id, tag: 'index-resume' })
		},
		goDaily () {
			uni.navigateTo({ url: '/pages/daily/daily' })
		},
		goHistory () {
			uni.switchTab({ url: '/pages/history/history' })
		},
		playEpisode (ep) {
			goDialogue({ episodeId: ep && (ep._id || ep.id), tag: 'index-daily' })
		},
		openTask (t) {
			goDialogue({ scriptId: t && (t._id || t.id), tag: 'index-recent' })
		},
		goLogin () {
			uni.navigateTo({ url: '/pages/login/login' })
		},
		async loadRecent () {
			// ⚠️ 未登录时 recent 必然为空 —— 所以空状态必须能区分这两种「空」，
			//    否则用户会以为自己的记录丢了。
			if (!this.logged) {
				this.recent = []
				this.loading = false
				return
			}
			this.loading = true
			try {
				const d = await script.list(1)
				this.recent = (d.list || []).slice(0, 3)
			} catch (e) {
				// 失败要说清楚是「读不到」而不是「没有」，否则同样会被误解成记录丢了
				console.warn('[index] 读取最近失败：', e && (e.message || e.error))
				uni.showToast({ title: '最近记录读不到，稍后自动重试', icon: 'none' })
				this.recent = []
			} finally {
				this.loading = false
			}
		},
		async start () {
			if (this.submitting) return
			if (!this.canSubmit) {
				uni.showToast({ title: '先填写文章内容', icon: 'none' })
				return
			}
			if (!this.logged) {
				uni.navigateTo({ url: '/pages/login/login' })
				return
			}
			this.submitting = true
			uni.showLoading({ title: '正在解析文章…', mask: true })
			try {
				const d = await article.add('', this.content)
				uni.hideLoading()
				uni.navigateTo({
					url: `/pages/generate/generate?article_id=${d.article_id}&tone_code=${this.toneCode}`
				})
			} catch (e) {
				uni.hideLoading()
				uni.showModal({
					title: '提交失败',
					content: (e && (e.message || e.error)) || '请稍后重试',
					showCancel: false
				})
			} finally {
				this.submitting = false
			}
		}
	}
}
</script>

<style lang="scss" scoped>
/* ---------- 展开态顶栏 ---------- */
.topbar {
	height: 88rpx;
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
}

.back { font-size: 27rpx; color: $dui-ink2; }
.topbar-title { font-size: 26rpx; color: $dui-ink2; }

/* ---------- ① 标题行 ---------- */
.head {
	display: flex;
	flex-direction: row;
	align-items: baseline;
	justify-content: space-between;
	padding: $dui-s7 0 $dui-s5;
}

.brand {
	font-family: $dui-font-serif;
	font-size: 52rpx;
	font-weight: $dui-fw-semi;
	letter-spacing: 1rpx;
	color: $dui-ink;
}

/* ---------- ② 主功能 E1 ---------- */
.cta-main {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: $dui-s3;
	padding: 26rpx 28rpx 26rpx 38rpx;
	/* 与卡片同色 —— 靠更圆的圆角（44 vs 36）与朱色圆按钮区分 */
	background-color: $dui-card;
	border: 1rpx solid $dui-line;
	border-radius: $dui-r-main;
	margin-bottom: $dui-s4;
}

.cta-hover { background-color: $dui-press; }

.cta-ph {
	font-size: 31rpx;
	letter-spacing: $dui-ls-body;
	color: $dui-ink4;
}

.cta-btn {
	/* 触摸目标 ≥88rpx(44pt)：朱色圆按钮是首页最主要的可点元素，
	   72rpx(36pt) 低于标准，撑到 88rpx。 */
	width: 88rpx;
	height: 88rpx;
	border-radius: 44rpx;
	background-color: $dui-vm;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}

.cta-ico {
	font-size: 38rpx;
	line-height: 1;
	color: $dui-on-ink;
	font-weight: $dui-fw-medium;
}

/* ---------- ③ 续听条 ---------- */
.resume {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: $dui-s3;
	padding: $dui-s3 2rpx;
	margin-bottom: $dui-s2;
}

.resume-when {
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	color: $dui-ink3;
	flex-shrink: 0;
}

.resume-line {
	flex: 1;
	min-width: 0;
	font-size: $dui-fs-caption;
	color: $dui-ink2;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.resume-go {
	font-size: $dui-fs-caption;
	font-weight: $dui-fw-semi;
	flex-shrink: 0;
}

/* ---------- ⑤ 我聊过的 ---------- */
.sec-act {
	font-size: $dui-fs-caption;
	font-weight: $dui-fw-semi;
	color: $dui-vm;
}

.recent-card {
	padding: 4rpx $dui-s4;
}

.loading { padding: $dui-s6 0; }

/* ---------- 展开态 ---------- */
.submit { padding-top: $dui-s6; padding-bottom: $dui-s6; }

.btn-text {
	font-size: 30rpx;
	font-weight: $dui-fw-medium;
	color: $dui-on-ink;
	letter-spacing: 1rpx;
}

.btn-tip {
	display: block;
	text-align: center;
	font-size: 23rpx;
	color: $dui-ink3;
	margin-top: $dui-s2;
}
</style>
