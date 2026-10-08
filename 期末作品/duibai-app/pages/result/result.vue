<template>
	<view class="page">
		<!-- 顶部 -->
		<view class="topbar">
			<view class="bar-slot" hover-class="bar-hit" aria-label="返回" @tap="back">
				<text class="bar-glyph">←</text>
			</view>
			<text class="title">{{ headerText }}</text>
			<view class="bar-slot more" hover-class="bar-hit" aria-label="更多操作" @tap="onMore">
				<text class="bar-glyph">⋯</text>
			</view>
		</view>

		<!-- 加载中 -->
		<view v-if="loading" class="center" aria-live="polite">
			<text class="t-hint">正在打开这场对谈…</text>
		</view>

		<!-- 空 / 失败：四种成因分开说，绝不把"读失败"说成"没内容" -->
		<view v-else-if="!lines.length" class="center" aria-live="polite">
			<empty-state
				v-if="showLogin"
				glyph="登"
				title="登录后就能打开这一场"
				desc="微信一键登录，不用注册。"
				action-text="去登录"
				@action="goLogin"
			/>
			<empty-state
				v-else-if="missingId"
				glyph="空"
				title="没拿到这场对谈"
				desc="小程序重启后会回到原来那一页，但内容标识会丢。回首页重新进一次就行。"
				action-text="回首页"
				@action="goHome"
			/>
			<empty-state
				v-else-if="errMsg"
				glyph="断"
				title="读取失败"
				:desc="friendlyErr"
				action-text="重试"
				@action="retry"
			/>
			<empty-state
				v-else
				glyph="空"
				title="没找到对话内容"
				desc="这场对谈可能已被删除。"
				action-text="回首页"
				@action="goHome"
			/>
			<!-- 诊断信息：让"空"这件事本身能说明原因，不用再去翻控制台 -->
			<view class="diag">
				<text class="diag-line">收到的参数：{{ rawOptions || '(无)' }}</text>
				<text class="diag-line">识别结果：{{ scriptId ? '对谈 ' + scriptId : (episodeId ? '每日一集 ' + episodeId : '两者都为空') }}</text>
				<text v-if="errMsg" class="diag-line">错误：{{ errMsg }}</text>
			</view>
		</view>

		<!-- 对话流（主体） -->
		<template v-else>
			<view class="stage">
				<conversation-stream
					:lines="lines"
					:index="current"
					@seek="seek"
					@source="openSource"
					@edit="openRedo"
				/>
			</view>

			<!-- ★ 音频还没生成时的入口（无可疑处时会绕过确认页，所以这里必须能补生成） -->
			<view v-if="canSynthesize" class="synth">
				<text class="synth-title">这场对谈还没有声音</text>
				<text class="synth-desc">文字稿已经在了。生成声音大概需要十几秒。</text>
				<view
					class="synth-btn"
					:class="{ disabled: synthesizing }"
					hover-class="btn-hover"
					:aria-label="synthesizing ? '正在生成声音' : '生成声音'"
					@tap="doSynthesize"
				>
					<text class="synth-btn-text">{{ synthesizing ? (prog || '正在生成…') : '生成声音' }}</text>
				</view>
			</view>

			<player-bar
				:playing="playing"
				:speed="speed"
				:mode="mode"
				@prev="prev"
				@next="next"
				@toggle="toggle"
				@speed="setSpeed"
			/>
		</template>

		<!-- 出处浮层 -->
		<source-popover
			:visible="sourceVisible"
			:paragraph="sourceParagraph"
			@close="sourceVisible = false"
			@full="goArticle"
		/>

		<!-- 单句重做浮层 -->
		<redo-sentence-sheet
			:visible="redoVisible"
			:text="redoText"
			@close="redoVisible = false"
			@submit="submitRedo"
		/>
	</view>
</template>

<script>
/**
 * 结果页 —— **整个产品的王牌**
 *
 * 设计立场（依据 UI设计规范.md）：
 *   · **视觉上彻底放弃 "播放器 + 文字稿" 的旧范式** —— 主界面是对话流，
 *     播放控制刻意做小、靠底，连进度条都不做（进度交给左侧竖轨）。
 *   · 用户感受到的应该是「我在旁听一场正在发生的对谈」。
 *
 * 两种内容来源：
 *   · script_id  → 自己的对话稿（走 data.script.get 云函数）
 *   · episode_id → 每日一集（直接读 daily_episodes，客户端可读，零云函数调用）
 *
 * ⚠️ 空态分四因（体验规范 §3.0）：未登录 / 丢了标识 / 读取失败 / 内容已删除。
 *    四者的文案、图标、主按钮都不同 —— 绝不把"读失败"伪装成"没内容"。
 *
 * ⚠️ 降级模式：TTS 未接入时没有音频，用「按阅读节奏逐句推进」演示，
 *    并在 PlayerBar 上**显式标注「音频未生成」**，不假装有声音。
 */
import { script, paragraph, daily as dailyApi, getUser } from '@/api/index.js'
import { saveLastView, readLastView } from '@/utils/format.js'
import ConversationStream from '@/components/ConversationStream/ConversationStream.vue'
import PlayerBar from '@/components/PlayerBar/PlayerBar.vue'
import SourcePopover from '@/components/SourcePopover/SourcePopover.vue'
import RedoSentenceSheet from '@/components/RedoSentenceSheet/RedoSentenceSheet.vue'
import EmptyState from '@/components/EmptyState/EmptyState.vue'

// 无音频时的阅读节奏：约 220ms/字（接近正常语速），每句最少 1.8 秒
const MS_PER_CHAR = 220
const MIN_MS = 1800

export default {
	components: { ConversationStream, PlayerBar, SourcePopover, RedoSentenceSheet, EmptyState },
	data () {
		return {
			loading: true,
			logged: false,
			scriptId: '',
			episodeId: '',
			lines: [],
			segments: [],
			title: '',
			tone: '',
			articleId: '',
			sourceText: '',
			current: 0,
			playing: false,
			speed: 1,
			mode: 'read', // audio | read
			// 音频补生成（无可疑项时生成页会直接跳结果页，绕过确认页，所以这里必须有入口）
			canSynthesize: false,
			synthesizing: false,
			prog: '',
			sourceVisible: false,
			sourceParagraph: { seq: 0, text: '' },
			redoVisible: false,
			redoText: '',
			redoLine: null,
			errMsg: ''
		}
	},
	computed: {
		/**
		 * 是否"丢了标识"。
		 *
		 * ⚠️ 这是真实会发生的场景：**小程序被重启后会恢复到原来那一页，但 query 会丢**
		 *    （点开发者工具的「编译」也是同理）。于是 `script_id` 变成空/字符串 "undefined"，
		 *    后端 `doc("undefined").get()` 查不到 → 就报了很误导的「对话稿不存在」。
		 *    所以这里要单独识别这种情况，给出能行动的解释，而不是让人以为数据丢了。
		 */
		missingId () {
			return !this.scriptId && !this.episodeId
		},
		/** A 未登录：`script.get` 需登录（每日一集是离线预置，不需要登录） */
		showLogin () {
			return !this.logged && !!this.scriptId
		},
		/** 把原始英文错误码映射成一句中文人话 */
		friendlyErr () {
			const m = String(this.errMsg || '')
			if (/unauthorized|401|登录|token/i.test(m)) return '登录状态过期了，重新登录一下。'
			if (/permission|forbidden|403|权限/i.test(m)) return '这场对谈暂时打不开。'
			if (/timeout|network|request:fail|网络|超时/i.test(m)) return '网络好像不太顺，再试一次。'
			if (/not.?found|不存在|404|已删除/i.test(m)) return '没找到这场对谈，可能已被删除。'
			return m || '稍后再试一次。'
		},
		headerText () {
			if (!this.title) return '对白'
			return this.tone ? this.title + ' · ' + this.tone : this.title
		}
	},
	onLoad (options) {
		this.logged = !!getUser()
		// ⚠️ 排查用：把收到的原始参数原样打出来
		console.log('[result] onLoad options =', JSON.stringify(options))
		// 小程序重启后 query 会丢，有时还会传来字符串 "undefined"，这里一并清掉
		const clean = v => {
			const s = (v || '')
			return (s === 'undefined' || s === 'null') ? '' : s
		}
		// ⚠️ 这里**不做**「用本地缓存补 id」的兜底 ——
		//    它会在传参出问题时拿"上次看的那场"顶上去，把真 bug 伪装成"内容不对"。
		this.rawOptions = options ? JSON.stringify(options) : '(options 是 undefined)'
		this.scriptId = clean(options && options.script_id)
		this.episodeId = clean(options && options.episode_id)
		// ⚠️ 兜底只在「页面被系统恢复」时启用（options 整个是空的）——
		//    如果是「传了但值是 undefined」那种脏参数，**绝不能**用缓存顶替，
		//    否则会把真 bug 伪装成"内容不对"。宁可显示"没拿到这场对谈"。
		if (!options || Object.keys(options).length === 0) {
			const last = readLastView()
			if (last && last.id) {
				if (last.type === 's') this.scriptId = last.id
				else if (last.type === 'e') this.episodeId = last.id
				console.log('[result] 页面被系统恢复（无任何参数），用上次记录继续：' + last.id)
			}
		}
		this.load()
	},

	/**
	 * onShow 兜底重试（幂等）。
	 *
	 * 为什么需要：自动化复现证明「拿到 script_id → 载入台词」这条链路是正确的，
	 * 后端也确认能返回 23 条。但真机上仍会出现空页面 ——
	 * 最可能的原因是**页面被系统恢复时 onLoad 不会重新触发**，
	 * 于是标识没设上、load 也没跑过。
	 *
	 * onShow 每次显示都会触发，且这里只在「没内容」时才重新载入，
	 * 正常路径不会重复请求。
	 */
	onShow () {
		this.logged = !!getUser()
		if (this.loading) return
		if (this.lines.length > 0) return
		if (!this.scriptId && !this.episodeId) return   // 没标识就重试也没用
		if (this.retried) return
		this.retried = true
		console.log('[result] onShow 发现内容为空，重试载入一次 · script_id=' + this.scriptId)
		this.load()
	},
	onUnload () {
		this.stopTimer()
		this.destroyAudio()
	},
	methods: {
		back () {
			uni.navigateBack({ delta: 1 })
		},
		retry () {
			this.retried = true
			this.errMsg = ''
			this.load()
		},
		goHome () {
			uni.switchTab({ url: '/pages/index/index' })
		},
		goLogin () {
			uni.navigateTo({ url: '/pages/login/login' })
		},

		/* ---------------- 载入 ---------------- */
		async load () {
			this.loading = true
			// ⚠️ pendingConfirm 必须在 if 块**外面**声明 ——
			//    之前写成 `Number(d.script && ...)` 而 d 只在 scriptId 分支里用 const 声明，
			//    出块就是 ReferenceError，会让整个 load() 崩掉、任何对谈都加载不了。
			//    语法检查查不出这类错（语法合法，只是运行时报错），只能靠实际运行发现。
			let pendingConfirm = 0
			try {
				if (this.scriptId) {
					const d = await script.get(this.scriptId)
					this.lines = d.lines || []
					this.segments = d.segments || []
					this.title = (d.script && d.script.title) || ''
					this.tone = (d.script && d.script.toneName) || ''
					this.articleId = (d.script && d.script.article_id) || ''
					pendingConfirm = Number((d.script && d.script.pending_confirm) || 0)
				} else if (this.episodeId) {
					// 每日一集：走云函数读（客户端直读会静默返回空）
					const e = await dailyApi.get(this.episodeId)
					if (e && e._id) {
						// 给每句补一个稳定的 _id，好让下面按 line_id 匹配音频分段
						this.lines = (e.lines || []).map((l, i) =>
							Object.assign({}, l, { seq: i + 1, _id: 'L' + (i + 1) }))
						// 预置的逐句音频（离线生成好的，segments 里是 {line_index, file_id}）
						this.segments = (e.segments || []).map(s => ({
							line_id: 'L' + ((s.line_index || 0) + 1),
							file_id: s.file_id
						}))
						this.title = e.title || ''
						this.tone = e.toneName || ''
						this.sourceText = e.source_text || ''
					} else {
						this.errMsg = '这一集还没准备好，换一集看看。'
					}
				} else {
					this.errMsg = '缺少内容标识。'
				}
				// 有真实音频片段才进 audio 模式
				this.mode = this.segments.some(s => s.file_id) ? 'audio' : 'read'
				// 没有音频、且没有待确认项 → 给出「生成声音」入口
				// ⚠️ 必须要求有 scriptId：**每日一集是离线预置内容**，它的声音应该
				//    随内容一起预置（存 segments），不该让用户现场合成。
				this.canSynthesize = this.mode === 'read' && pendingConfirm === 0 &&
					this.lines.length > 0 && !!this.scriptId
			} catch (e) {
				this.errMsg = (e && (e.message || e.error)) || '加载失败'
				console.warn('[result] 载入失败 · script_id=' + this.scriptId +
					' · episode_id=' + this.episodeId + ' ·', e)
			} finally {
				this.loading = false

				// ★ 记下「上次看到哪」：首页续听条要用（带当前句与句序）
				if (this.lines.length) {
					saveLastView({
						type: this.scriptId ? 's' : (this.episodeId ? 'e' : ''),
						id: this.scriptId || this.episodeId,
						at: Date.now(),
						i: this.current,
						text: (this.curLine && this.curLine.text) || ''
					})
				}

				// 决策性诊断：把「收到什么 id」和「最终加载了什么」都打出来
				console.log('[result] 载入完成 · 来源=' +
					(this.scriptId ? 'script:' + this.scriptId : (this.episodeId ? 'episode:' + this.episodeId : '无')) +
					' · 标题=' + (this.title || '(空)') +
					' · 台词=' + this.lines.length +
					' · 音频段=' + this.segments.length +
					' · 模式=' + this.mode)
			}
		},

		/* ---------------- 播放控制 ---------------- */
		/** 当前这句台词（续听条要显示它） */
		curLine () {
			return this.lines[this.current] || null
		},
		curSeg () {
			const l = this.lines[this.current]
			if (!l) return null
			return this.segments.find(s => s.line_id === l._id) || null
		},
		toggle () {
			if (this.playing) { this.pause() } else { this.play() }
		},
		play () {
			if (!this.lines.length) return
			this.playing = true
			if (this.mode === 'audio') this.playAudio()
			else this.startTimer()
		},
		pause () {
			this.playing = false
			this.stopTimer()
			if (this.audio) this.audio.pause()
		},
		playAudio () {
			const seg = this.curSeg()
			if (!seg) { this.next(); return }
			this.destroyAudio()
			this.audio = uni.createInnerAudioContext()
			this.audio.src = seg.file_id
			this.audio.playbackRate = this.speed
			this.audio.onEnded(() => { this.next() })
			this.audio.onError(() => {
				// 音频拿不到 → 立刻降级为阅读节奏，并让用户知道
				console.warn('[result] 音频播放失败，降级为阅读模式')
				this.mode = 'read'
				this.startTimer()
			})
			this.audio.play()
		},
		destroyAudio () {
			if (this.audio) { this.audio.destroy(); this.audio = null }
		},
		startTimer () {
			this.stopTimer()
			const l = this.lines[this.current]
			if (!l) return
			const ms = Math.max(MIN_MS, (l.text || '').length * MS_PER_CHAR) / this.speed
			this.timer = setTimeout(() => {
				if (this.current < this.lines.length - 1) {
					this.current += 1
					this.startTimer()
				} else {
					this.playing = false
					this.stopTimer()
				}
			}, ms)
		},
		stopTimer () {
			if (this.timer) { clearTimeout(this.timer); this.timer = null }
		},
		next () {
			if (this.current < this.lines.length - 1) {
				this.current += 1
				this.afterJump()
			} else {
				this.playing = false
				this.stopTimer()
			}
		},
		prev () {
			if (this.current > 0) {
				this.current -= 1
				this.afterJump()
			}
		},
		/** 点任意一句：该句浮到中央并重播 */
		seek (i) {
			this.current = i
			this.playing = true
			this.afterJump()
		},
		afterJump () {
			this.stopTimer()
			if (!this.playing) return
			if (this.mode === 'audio') this.playAudio()
			else this.startTimer()
		},
		setSpeed (s) {
			this.speed = s
			if (this.audio) this.audio.playbackRate = s
			if (this.playing && this.mode === 'read') this.startTimer()
		},

		/**
		 * 补生成声音。
		 * 为什么会走到这里：文章没有可疑处时，生成页会**直接跳结果页、绕过确认页**，
		 * 而音频合成原本只挂在确认页 —— 所以这条路径下永远没人触发合成。
		 */
		async doSynthesize () {
			if (this.synthesizing) return
			this.synthesizing = true
			this.prog = '正在生成 0/' + this.lines.length
			try {
				await script.synthesizeAll(this.scriptId, {
					batchSize: 8,
					onProgress: (done, total) => { this.prog = '正在生成 ' + done + '/' + total }
				})
				this.prog = ''
				uni.showToast({ title: '声音做好了', icon: 'success' })
				// 重新载入，让播放器切到 audio 模式
				await this.load()
			} catch (e) {
				this.prog = ''
				const code = e && e.error
				if (code === 'PENDING_CONFIRMATION') {
					uni.showToast({ title: '还有未确认的可疑项', icon: 'none' })
				} else {
					uni.showModal({
						title: '声音没做出来',
						content: (e && e.message) || '稍后再试一次，文字稿已经保住了',
						showCancel: false
					})
				}
			} finally {
				this.synthesizing = false
			}
		},

		/* ---------------- 出处 ---------------- */
		async openSource (line) {
			const seq = line && line.source_paragraph
			if (!seq) {
				uni.showToast({ title: '这句没有对应原文', icon: 'none' })
				return
			}
			this.sourceParagraph = { seq, text: '正在读取原文…' }
			this.sourceVisible = true
			try {
				if (this.episodeId && this.sourceText) {
					// 每日一集自带原文：按空行切段，取第 seq 段
					const parts = String(this.sourceText).split(/\r?\n\s*\r?\n/).filter(Boolean)
					this.sourceParagraph = { seq, text: parts[seq - 1] || parts[0] || '' }
				} else if (this.scriptId && this.articleId) {
					const d = await paragraph.list(this.articleId)
					const p = (d || []).find(x => x.seq === seq)
					this.sourceParagraph = { seq, text: p ? p.text : '未找到该段原文' }
				}
			} catch (e) {
				this.sourceParagraph = { seq, text: '原文读取失败' }
			}
		},
		goArticle () {
			this.sourceVisible = false
			if (this.articleId) {
				uni.navigateTo({
					url: `/pages/article/article?article_id=${this.articleId}&seq=${this.sourceParagraph.seq}`
				})
			} else {
				uni.showToast({ title: '该内容没有独立原文页', icon: 'none' })
			}
		},

		/* ---------------- 单句重做 ---------------- */
		openRedo (line) {
			this.redoLine = line
			this.redoText = line.text
			this.redoVisible = true
		},
		submitRedo (style) {
			this.redoVisible = false
			// TODO(TTS 接入后)：把 style 作为指令传给 tts-synthesize，只重做该句
			uni.showToast({
				title: '已选「' + this.styleLabel(style) + '」· TTS 接入后生效',
				icon: 'none'
			})
		},
		styleLabel (k) {
			return { natural: '更自然', concise: '更简洁', rigorous: '更严谨' }[k] || k
		},

		/* ---------------- 更多 ---------------- */
		onMore () {
			uni.showActionSheet({
				itemList: ['导出文字稿', '换一种口吻重新生成'],
				success: (res) => {
					if (res.tapIndex === 1) {
						uni.showToast({ title: '回到首页换个口吻再聊一次', icon: 'none' })
					} else {
						this.exportText()
					}
				}
			})
		},
		exportText () {
			const txt = this.lines
				.map(l => (l.speaker === 'B' ? '乙：' : '甲：') + l.text)
				.join('\n')
			uni.setClipboardData({
				data: txt,
				success: () => uni.showToast({ title: '文字稿已复制', icon: 'success' })
			})
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

.topbar {
	height: 88rpx;
	flex-shrink: 0;
	display: flex;
	flex-direction: row;
	align-items: center;
	/* 与全站同一条左轴（20pt） */
	padding: 0 $dui-s5;
}

/* 顶栏两侧的"返回 / 更多"：热区 88rpx（视觉仍是那个符号） */
.bar-slot {
	width: 88rpx;
	height: 88rpx;
	display: flex;
	align-items: center;
}

.bar-slot.more {
	justify-content: flex-end;
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
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	margin: 0 $dui-s2;
}

/* 对话流占满剩余空间，让当前句稳在视觉中心 */
.stage {
	flex: 1;
	overflow: hidden;
	min-height: 0;
}

.diag {
	margin-top: $dui-s5;
	padding: 0 $dui-s3;
}

.diag-line {
	display: block;
	font-size: 20rpx;
	color: $dui-ink3;
	line-height: 1.7;
	word-break: break-all;
}

.center {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}

/* ---------- 补生成声音 ---------- */
.synth {
	flex-shrink: 0;
	margin: 0 0 $dui-s3;
	padding: $dui-s3 $dui-s4;
	background-color: $dui-vm-soft;
	border-radius: $dui-r-card;
}

.synth-title {
	display: block;
	font-size: $dui-fs-body;
	font-weight: $dui-fw-medium;
	color: $dui-vm;
	margin-bottom: 6rpx;
}

.synth-desc {
	display: block;
	font-size: $dui-fs-caption;
	color: $dui-ink2;
	margin-bottom: $dui-s3;
}

.synth-btn {
	height: 96rpx;
	border-radius: $dui-r-pill;
	background-color: $dui-ink;
	display: flex;
	align-items: center;
	justify-content: center;
}

.synth-btn.disabled {
	background-color: $dui-ink4;
}

.synth-btn-text {
	font-size: $dui-fs-body;
	font-weight: $dui-fw-medium;
	color: $dui-on-ink;
	letter-spacing: 1rpx;
}

.btn-hover {
	opacity: 0.88;
}
</style>
