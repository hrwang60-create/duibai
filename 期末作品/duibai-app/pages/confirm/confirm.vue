<template>
	<view class="page">
		<!-- 顶部 -->
		<view class="topbar">
			<view class="bar-slot" hover-class="bar-hit" aria-label="返回" @tap="back">
				<text class="bar-glyph">←</text>
			</view>
			<text class="title">{{ headerText }}</text>
			<view class="bar-slot"></view>
		</view>

		<!-- 加载中 -->
		<view v-if="loading" class="center" aria-live="polite">
			<text class="t-hint">正在检查这稿对谈…</text>
		</view>

		<!-- A 未登录 -->
		<view v-else-if="showLogin" class="center" aria-live="polite">
			<empty-state
				glyph="登"
				title="登录后就能确认这一场"
				desc="微信一键登录，不用注册。"
				action-text="去登录"
				@action="goLogin"
			/>
		</view>

		<!-- 丢了标识 -->
		<view v-else-if="missingId" class="center" aria-live="polite">
			<empty-state
				glyph="空"
				title="没拿到这场对谈"
				desc="小程序重启后会回到原来那一页，但内容标识会丢。回首页重新进一次就行。"
				action-text="回首页"
				@action="goHome"
			/>
		</view>

		<!-- C 读取失败：页内空态 + 重试（不再用 modal 挡住内容） -->
		<view v-else-if="loadError" class="center" aria-live="polite">
			<empty-state
				glyph="断"
				title="这稿对谈没读出来"
				:desc="errMsg || '网络好像不太顺，再试一次。'"
				action-text="重试"
				@action="reload"
			/>
		</view>

		<!-- 无可疑处 -->
		<view v-else-if="!suspects.length" class="center" aria-live="polite">
			<empty-state
				glyph="过"
				title="全部确认完毕"
				desc="这场对谈没有疑问了，可以开始听。"
				action-text="去听这场对谈"
				@action="goResult"
			/>
		</view>

		<!-- 卡住的状态 -->
		<template v-else>
			<!-- 对话流：**变暗**，表示谈话被打断 -->
			<view class="stage">
				<conversation-stream
					:lines="lines"
					:index="curIndex"
					:radius="2"
					:dim="true"
				/>
			</view>

			<scroll-view class="scroll" scroll-y>
				<view class="card-wrap">
					<suspect-card
						:line="cur"
						:index="curPos"
						:total="suspects.length"
						:paragraph-text="refText"
						@view-source="openSource"
						@save="saveLine"
						@confirm="confirmLine"
					/>
				</view>

				<view class="stopnote">
					<text class="stopnote-text">对话停在这里 —— 你回应之后才会继续</text>
				</view>
			</scroll-view>

			<!-- 底部主按钮 -->
			<view class="foot">
				<view
					class="btn"
					:class="{ disabled: hasPending || submitting }"
					hover-class="btn-hover"
					@tap="finish"
				>
					<text class="btn-text">{{ submitting ? (prog || '正在准备声音…') : '全部确认，开始生成声音' }}</text>
				</view>
				<text v-if="submitting" class="foot-hint">长对谈会分几批合成，别急</text>
				<text v-else-if="hasPending" class="foot-hint">还有 {{ suspects.length }} 处没确认</text>
			</view>
		</template>

		<!-- 出处浮层 -->
		<source-popover
			:visible="sourceVisible"
			:paragraph="sourceParagraph"
			@close="sourceVisible = false"
			@full="goArticle"
		/>
	</view>
</template>

<script>
/**
 * 确认页 —— **产品第二个记忆点**
 *
 * 核心体验：**可疑处让对话"停住"**。
 *   · 进入时对话流整体**变暗**（谈话被打断，不是你打开了审核表单）
 *   · 中间浮出 `?` 卡片，给出**原文对照**，不让你凭记忆判断
 *   · 你回应（确认 / 修改）之后，对话才继续
 *
 * 业务约束（来自需求）：**存在未确认的可疑项时禁止合成音频**（后端返回 409）。
 *
 * ⚠️ 空态分四因（体验规范 §3.3）：未登录 / 丢了标识 / 读取失败 / 无可疑处。
 *    读取失败以前弹 `showModal` **会挡住内容**，现在改为页内空态 + 重试，与其他页一致。
 *    `script_id` 缺失 / 未登录时**先判断再决定**，不再直接 `script.get('')` 触发误导报错。
 */
import { script, line as lineApi, paragraph, getUser } from '@/api/index.js'
import ConversationStream from '@/components/ConversationStream/ConversationStream.vue'
import SuspectCard from '@/components/SuspectCard/SuspectCard.vue'
import SourcePopover from '@/components/SourcePopover/SourcePopover.vue'
import EmptyState from '@/components/EmptyState/EmptyState.vue'

export default {
	components: { ConversationStream, SuspectCard, SourcePopover, EmptyState },
	data () {
		return {
			loading: true,
			logged: false,
			loadError: false,
			errMsg: '',
			submitting: false,
			prog: '',              // 分批合成进度，如「正在准备声音 8/18」
			scriptId: '',
			articleId: '',
			lines: [],
			paraMap: {},
			pos: 0,                 // 当前处理第几个可疑项
			sourceVisible: false,
			sourceParagraph: { seq: 0, text: '' }
		}
	},
	computed: {
		suspects () {
			return this.lines.filter(l => l.flag && !l.confirmed)
		},
		hasPending () {
			return this.suspects.length > 0
		},
		missingId () {
			return !this.scriptId
		},
		showLogin () {
			return !this.logged && !!this.scriptId
		},
		headerText () {
			if (this.loading || this.loadError || this.missingId || this.showLogin) return '对谈'
			return this.suspects.length ? '有 ' + this.suspects.length + ' 处需要你确认' : '对谈已经可以听了'
		},
		cur () {
			return this.suspects[Math.min(this.pos, this.suspects.length - 1)] || {}
		},
		curPos () {
			return Math.min(this.pos, Math.max(0, this.suspects.length - 1))
		},
		/** 对话流定位到可疑句所在的那一行 */
		curIndex () {
			if (!this.cur || !this.cur._id) return 0
			const i = this.lines.findIndex(l => l._id === this.cur._id)
			return i < 0 ? 0 : i
		},
		refText () {
			const seq = this.cur && this.cur.source_paragraph
			if (!seq) return ''
			return this.paraMap[seq] || ''
		}
	},
	onLoad (options) {
		this.logged = !!getUser()
		const clean = v => {
			const s = (v || '')
			return (s === 'undefined' || s === 'null') ? '' : s
		}
		this.scriptId = clean(options && options.script_id)
		// ⚠️ 先判断再决定：没标识 / 没登录都不该直接 script.get('') 触发误导报错
		if (this.missingId) {
			this.loading = false
			return
		}
		if (!this.logged) {
			this.loading = false
			return
		}
		this.load()
	},
	methods: {
		back () {
			uni.navigateBack({ delta: 1 })
		},
		goHome () {
			uni.switchTab({ url: '/pages/index/index' })
		},
		goLogin () {
			uni.navigateTo({ url: '/pages/login/login' })
		},
		reload () {
			if (!this.scriptId) { this.loading = false; return }
			this.load()
		},
		async load (keepPos) {
			this.loading = true
			this.loadError = false
			this.errMsg = ''
			try {
				const d = await script.get(this.scriptId)
				this.lines = d.lines || []
				this.articleId = (d.script && d.script.article_id) || ''
				if (!keepPos) this.pos = 0
				if (this.articleId) {
					const ps = await paragraph.list(this.articleId)
					const m = {}
					;(ps || []).forEach(p => { m[p.seq] = p.text })
					this.paraMap = m
				}
			} catch (e) {
				this.loadError = true
				this.errMsg = (e && (e.message || e.error)) || '请稍后重试'
				console.warn('[confirm] 载入失败：', e && (e.message || e.error))
			} finally {
				this.loading = false
			}
		},

		/* ---------------- 三个动作 ---------------- */
		async saveLine (text) {
			try {
				await lineApi.update(this.cur._id, text)
				uni.showToast({ title: '已改好', icon: 'success' })
				// 改过之后该句不再算可疑项；重新拉一次保证与服务端一致
				await this.load(true)
			} catch (e) {
				uni.showModal({
					title: '修改失败',
					content: (e && (e.message || e.error)) || '请稍后重试',
					showCancel: false
				})
			}
		},
		async confirmLine (line) {
			try {
				await lineApi.confirm(line._id, true)
				await this.load(true)
				if (!this.suspects.length) {
					uni.showToast({ title: '全部确认完了', icon: 'success' })
				}
			} catch (e) {
				uni.showModal({
					title: '确认失败',
					content: (e && (e.message || e.error)) || '请稍后重试',
					showCancel: false
				})
			}
		},
		openSource (line) {
			const seq = line && line.source_paragraph
			if (!seq) {
				uni.showToast({ title: '这句没有对应原文', icon: 'none' })
				return
			}
			this.sourceParagraph = { seq, text: this.paraMap[seq] || '未找到该段原文' }
			this.sourceVisible = true
		},
		goArticle () {
			this.sourceVisible = false
			if (this.articleId) {
				uni.navigateTo({
					url: `/pages/article/article?article_id=${this.articleId}&seq=${this.sourceParagraph.seq}`
				})
			}
		},

		/* ---------------- 去听 ---------------- */
		finish () {
			if (this.hasPending) {
				uni.showToast({ title: '还有 ' + this.suspects.length + ' 处没确认', icon: 'none' })
				return
			}
			this.goResult()
		},
		async goResult () {
			this.submitting = true
			this.prog = '正在准备声音 0/' + (this.lines.length || 0)
			try {
				// ⚠️ 必须分批：云端逐句合成约 3 秒/句，18 句一次性合成会逼近
				//    云函数 60 秒上限。所以前端按 8 句一批循环调用。
				await script.synthesizeAll(this.scriptId, {
					batchSize: 8,
					onProgress: (done, total) => { this.prog = '正在准备声音 ' + done + '/' + total }
				})
			} catch (e) {
				const code = e && e.error
				if (code === 'PENDING_CONFIRMATION') {
					this.submitting = false
					this.prog = ''
					uni.showToast({ title: '还有未确认的可疑项', icon: 'none' })
					return
				}
				// 合成失败**不阻断流程** —— 结果页会降级为文字 + 阅读节奏模式
				console.warn('[confirm] 合成未成功，降级为文字模式：', code, (e && e.message) || '')
			} finally {
				this.submitting = false
			}
			uni.redirectTo({ url: `/pages/result/result?script_id=${this.scriptId}` })
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
}

/* 顶栏：与全站同一条左轴（20pt） */
.topbar {
	height: 88rpx;
	flex-shrink: 0;
	display: flex;
	flex-direction: row;
	align-items: center;
	padding: 0 $dui-s5;
}

.bar-slot {
	width: 88rpx;
	height: 88rpx;
	display: flex;
	align-items: center;
}

.bar-glyph {
	font-size: $dui-fs-bodyL;
	color: $dui-ink2;
}

.bar-hit {
	opacity: 0.5;
}

.title {
	flex: 1;
	font-size: $dui-fs-body;
	color: $dui-ink2;
	text-align: center;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

/* 对话流：变暗、压扁 —— 它在"暂停"，焦点让给卡片 */
.stage {
	flex-shrink: 0;
	height: 380rpx;
	overflow: hidden;
}

.scroll {
	flex: 1;
	min-height: 0;
}

.card-wrap {
	padding: 0 $dui-s5;
}

.stopnote {
	padding: $dui-s3 $dui-s5 $dui-s4;
}

.stopnote-text {
	font-size: $dui-fs-label;
	color: $dui-ink3;
	letter-spacing: $dui-ls-caption;
}

.center {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}

/* 底部 */
.foot {
	flex-shrink: 0;
	padding: $dui-s3 $dui-s5 $dui-s5;
}

.btn {
	height: 96rpx;
	border-radius: $dui-r-pill;
	background-color: $dui-ink;
	display: flex;
	align-items: center;
	justify-content: center;
}

.btn-hover {
	opacity: 0.88;
}

.disabled {
	background-color: $dui-ink4;
}

.btn-text {
	font-size: $dui-fs-bodyL;
	font-weight: $dui-fw-medium;
	color: $dui-on-ink;
	letter-spacing: 1rpx;
}

.foot-hint {
	display: block;
	text-align: center;
	font-size: $dui-fs-label;
	color: $dui-ink3;
	margin-top: $dui-s2;
}
</style>
