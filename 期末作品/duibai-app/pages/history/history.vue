<template>
	<view class="page">
		<!-- 大标题（宋体）+ 等宽总数 -->
		<view class="topbar">
			<text class="title">我聊过的</text>
			<text v-if="totalText" class="t-num">{{ totalText }}</text>
		</view>

		<!-- 筛选：选中=墨底白字；触控撑到 88rpx；选中态用 aria 播报 -->
		<view class="filters" role="tablist">
			<view
				v-for="f in filters"
				:key="f.key"
				class="f-item tap-88"
				:class="{ on: f.key === active }"
				:hover-class="f.key === active ? 'none' : 'f-hover'"
				role="tab"
				:aria-selected="f.key === active ? 'true' : 'false'"
				:aria-label="'筛选：' + f.label"
				@tap="active = f.key"
			>{{ f.label }}</view>
		</view>

		<view v-if="loading" class="center" aria-live="polite">
			<text class="t-hint">正在翻你的谈话记录…</text>
		</view>

		<!-- ★ C 读取失败：绝不说成「没有」——图标/文案/主按钮与 A、B 都不同 -->
		<empty-state
			v-else-if="loadError"
			glyph="断"
			title="记录没读出来"
			desc="网络或服务一时没回应，你的记录还在，再试一次就好。"
			action-text="重试"
			@action="reload"
		/>

		<!-- 有数据：按时间分组（今天 / 昨天 / 更早） -->
		<view v-else-if="groups.length" class="list">
			<view v-for="g in groups" :key="g.key" class="group">
				<view class="g-head">
					<text class="g-title">{{ g.label }}</text>
					<view class="g-line"></view>
					<text class="g-count">{{ pad2(g.items.length) }}</text>
				</view>
				<view class="card list-card">
					<task-list-item
						v-for="(t, i) in g.items"
						:key="t._id"
						:task="t"
						:divider="i > 0"
						@tap="open"
						@longpress="more"
					/>
				</view>
			</view>
			<view v-if="hasMore" class="more" hover-class="more-hover" aria-label="加载更多" @tap="loadMore">
				<text class="more-text">{{ loadingMore ? '加载中…' : '加载更多' }}</text>
			</view>
			<text class="tip">长按一条可以删除</text>
		</view>

		<!-- ★ 筛完没有 ≠ 从没有过 -->
		<empty-state
			v-else-if="active !== 'all'"
			glyph="筛"
			title="这里现在是空的"
			:desc="'「' + activeLabel + '」下暂时没有对谈。换一个筛选看看，或者去开始一场。'"
			action-text="看全部"
			@action="active = 'all'"
		/>
		<!-- ★ A 未登录 / B 真没聊过：文案与主行动都不同 -->
		<empty-state
			v-else
			glyph="谈"
			:title="logged ? '还没聊过' : '登录后，这里会存下你聊过的每一场'"
			:desc="logged ? '投一篇文章，听两个人把它聊开。' : '不用注册，微信一键登录。'"
			:action-text="logged ? '去投一篇文章' : '去登录'"
			@action="logged ? goHome() : goLogin()"
		/>

		<view class="tab-space"></view>
	</view>
</template>

<script>
/**
 * 历史页
 *
 * ★ 改动 1：按时间分组（今天 / 昨天 / 更早）。
 *   平铺 23 条时必须逐条读标题；分组之后 90% 的回访都落在「今天」，
 *   **把「扫」变成了「找」**。
 *
 * ★ 改动 2：状态词交给 TaskListItem 变成动作（去确认 › / ▶ 听）。
 *
 * ★ 改动 3：三种「空」分三态 ——
 *   A 未登录      → 「登录后，这里会存下…」+ 去登录
 *   B 真没聊过    → 「还没聊过」+ 去投一篇文章
 *   C 读取失败    → 新增 loadError：「记录没读出来」+ 重试
 *   ❌ 原先 reload 的 catch 把 list 清空 → 落进「还没聊过」，
 *      把「读失败」伪装成「没数据」。现在读失败单独走 C，绝不与 B 混。
 *
 * ★ 改动 4：loadMore 失败原先只回退 page、无任何提示 → 补 toast。
 */
import { script, getUser } from '@/api/index.js'
import { goDialogue } from '@/utils/nav.js'
import TaskListItem from '@/components/TaskListItem/TaskListItem.vue'
import EmptyState from '@/components/EmptyState/EmptyState.vue'

function dayKey (ts) {
  const d = new Date(ts || Date.now())
  const p = n => (n < 10 ? '0' + n : '' + n)
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
}

export default {
	components: { TaskListItem, EmptyState },
	data () {
		return {
			loading: true,
			loadingMore: false,
			loadError: false,
			list: [],
			page: 1,
			total: 0,
			active: 'all',
			logged: false,
			filters: [
				{ key: 'all', label: '全部' },
				{ key: 'generated', label: '待确认' },
				{ key: 'audio_ready', label: '可播放' }
			]
		}
	},
	computed: {
		shown () {
			if (this.active === 'all') return this.list
			return this.list.filter(t => t.status === this.active)
		},
		activeLabel () {
			const f = this.filters.find(x => x.key === this.active)
			return f ? f.label : ''
		},
		/** 标题右侧「共 04」：未登录或读失败时不显示，避免出现误导性的 0 */
		totalText () {
			if (!this.logged || this.loadError) return ''
			return '共 ' + this.pad2(this.total)
		},
		groups () {
			const today = dayKey(Date.now())
			const yesterday = dayKey(Date.now() - 86400000)
			const bucket = { today: [], yesterday: [], earlier: [] }
			for (const t of this.shown) {
				const k = dayKey(t.created_at)
				if (k === today) bucket.today.push(t)
				else if (k === yesterday) bucket.yesterday.push(t)
				else bucket.earlier.push(t)
			}
			const out = []
			if (bucket.today.length) out.push({ key: 'today', label: '今天', items: bucket.today })
			if (bucket.yesterday.length) out.push({ key: 'yesterday', label: '昨天', items: bucket.yesterday })
			if (bucket.earlier.length) out.push({ key: 'earlier', label: '更早', items: bucket.earlier })
			return out
		},
		hasMore () {
			return this.list.length < this.total
		}
	},
	onShow () {
		this.reload()
	},
	methods: {
		pad2 (n) {
			const v = Number(n) || 0
			return v < 10 ? '0' + v : '' + v
		},
		async reload () {
			this.logged = !!getUser()
			this.loadError = false
			this.page = 1
			this.list = []
			this.total = 0
			// 未登录：不请求（必失败），交给 A 态引导，别把失败当成「没数据」
			if (!this.logged) {
				this.loading = false
				return
			}
			this.loading = true
			try {
				const d = await script.list(1)
				this.list = d.list || []
				this.total = d.total || 0
			} catch (e) {
				console.warn('[history] 读取失败：', e && (e.message || e.error))
				this.loadError = true
				this.list = []
				this.total = 0
			} finally {
				this.loading = false
			}
		},
		async loadMore () {
			if (this.loadingMore || !this.logged || this.loadError) return
			this.loadingMore = true
			try {
				this.page += 1
				const d = await script.list(this.page)
				this.list = this.list.concat(d.list || [])
				this.total = d.total || this.total
			} catch (e) {
				this.page -= 1
				// 失败要有提示，否则「点了没反应」会被当成没有更多
				uni.showToast({ title: '没加载出来，再点一次', icon: 'none' })
			} finally {
				this.loadingMore = false
			}
		},
		open (t) {
			// id 校验与跳转都在 nav 层统一处理，这里只负责传值
			goDialogue({ scriptId: t && (t._id || t.id), tag: 'history' })
		},
		more (t) {
			if (!t || !t._id) return
			uni.showActionSheet({
				itemList: ['继续听', '删除这场对谈'],
				success: (res) => {
					if (res.tapIndex === 0) this.open(t)
					else this.confirmRemove(t)
				}
			})
		},
		confirmRemove (t) {
			// 用系统弹窗，不自造确认组件（省一个组件位）
			uni.showModal({
				title: '删除这场对谈？',
				content: '对话稿与音频都会一并删除，无法恢复。',
				confirmText: '删除',
				confirmColor: '#B83F28',
				success: async (r) => {
					if (!r.confirm) return
					try {
						await script.remove(t._id)
						this.list = this.list.filter(x => x._id !== t._id)
						this.total = Math.max(0, this.total - 1)
						uni.showToast({ title: '已删除', icon: 'success' })
					} catch (e) {
						uni.showModal({
							title: '删除失败',
							content: (e && (e.message || e.error)) || '请稍后重试',
							showCancel: false
						})
					}
				}
			})
		},
		goHome () {
			uni.switchTab({ url: '/pages/index/index' })
		},
		goLogin () {
			uni.navigateTo({ url: '/pages/login/login' })
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	padding: 0 $dui-s5 $dui-s4;
	box-sizing: border-box;
}

/* 大标题行：宋体标题 + 右侧等宽计数 */
.topbar {
	display: flex;
	flex-direction: row;
	align-items: baseline;
	justify-content: space-between;
	padding: $dui-s7 0 $dui-s4;
}

.title {
	font-family: $dui-font-serif;
	font-size: 48rpx;
	font-weight: $dui-fw-semi;
	letter-spacing: 1rpx;
	color: $dui-ink;
}

/* ---------- 筛选 chip：88rpx 高，选中=墨底白字 ---------- */
.filters {
	display: flex;
	flex-direction: row;
	margin-bottom: $dui-s3;
}

.f-item {
	height: 88rpx;
	padding: 0 28rpx;
	margin-right: $dui-s2;
	border-radius: $dui-r-chip;
	background-color: $dui-card;
	border: 1rpx solid $dui-line;
	font-size: 26rpx;
	color: $dui-ink2;
}

.f-item.on {
	background-color: $dui-ink;
	border-color: $dui-ink;
	color: $dui-on-ink;
	font-weight: $dui-fw-semi;
}

.f-hover {
	background-color: $dui-press;
}

/* ---------- 时间分组头：宋体宽字距 + 发丝线 + 等宽计数 ---------- */
.group {
	margin-bottom: $dui-s4;
}

.g-head {
	display: flex;
	flex-direction: row;
	align-items: center;
	height: 52rpx;
	margin-bottom: $dui-s2;
}

.g-title {
	font-family: $dui-font-serif;
	font-size: $dui-fs-label;
	letter-spacing: $dui-ls-label;
	color: $dui-ink3;
}

.g-line {
	flex: 1;
	height: 1rpx;
	background-color: $dui-line;
	margin: 0 $dui-s3;
}

/* ink3（已按对比度修正），不再用 ink5 承载文字 */
.g-count {
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	letter-spacing: $dui-ls-num;
	color: $dui-ink3;
}

.list {
	padding-bottom: $dui-s4;
}

.list-card {
	padding: 4rpx $dui-s4;
}

.more {
	height: 88rpx;
	display: flex;
	align-items: center;
	justify-content: center;
}

.more-hover {
	opacity: 0.6;
}

.more-text {
	font-size: 25rpx;
	color: $dui-ink2;
}

.tip {
	display: block;
	text-align: center;
	font-size: $dui-fs-num;
	color: $dui-ink3;
	margin-top: $dui-s3;
}

.center {
	padding: $dui-s8 0;
	display: flex;
	justify-content: center;
}
</style>
