<template>
	<view
		class="item"
		:class="{ 'item-div': divider }"
		hover-class="item-hover"
		@tap="$emit('tap', task)"
		@longpress="$emit('longpress', task)"
	>
		<!-- 标题行：状态点 + 标题 + 等宽元数据 + 动作 -->
		<view class="head">
			<!-- 巧思 2：待确认的条目用「空心朱圈 + 极慢呼吸」，表示"这里在等你"。
			     周期 2.4s、幅度很小 —— 是呼吸，不是闪烁。 -->
			<view v-if="todo" class="dot-todo"></view>
			<view v-else class="dot-done"></view>

			<text class="name">{{ safeTitle }}</text>
			<text class="meta">{{ metaText }}</text>
			<text class="act">{{ actionText }}</text>
		</view>

		<!-- ★ 对话痕迹：显示两条真实台词，而不是"文件名 + 时间"
		     左右交错 + 竖轨 —— 与结果页的对话流同一套符号。
		     这样在点进去之前就能认出这是哪一场。 -->
		<view v-if="preview.length" class="dlg">
			<view class="ln ln-a">
				<view class="rail"></view>
				<text class="who">甲</text>
				<text class="say">{{ preview[0] }}</text>
			</view>
			<view v-if="preview[1]" class="ln ln-b">
				<view class="rail"></view>
				<text class="who">乙</text>
				<text class="say">{{ preview[1] }}</text>
			</view>
		</view>
	</view>
</template>

<script>
/**
 * TaskListItem 对谈条目
 *
 * ★ 设计要点 1：对话痕迹。
 *   显示前两句真实台词，不做成"文件名 + 时间"的普通列表 ——
 *   开始听之前就能认出这是哪一场，品牌语言也统一。
 *   台词预览来自 scripts.preview 字段（生成时写入，避免前端 N+1 查询）。
 *
 * ★ 设计要点 2：右侧给「动作」不给「状态」。
 *   「待确认」「可播放」是系统内部状态，用户要先理解才能行动；
 *   「去确认 →」「▶ 听」直接告诉他下一步做什么。
 *
 * ★ 设计要点 3：防御性显示。
 *   早期的 article.add 兜底会把原文换行截进 title，云端那条老数据还在，
 *   所以显示层必须自己兜住（不能只修写入侧）。
 */
import { formatTime } from '@/utils/format.js'

export default {
	name: 'TaskListItem',
	emits: ['tap', 'longpress'],
	props: {
		task: { type: Object, default: () => ({}) },
		/** 是否是列表里"非第一条" —— 用它画上方的分隔线，避免首条多一条线 */
		divider: { type: Boolean, default: false }
	},
	computed: {
		todo () {
			return this.task.status === 'generated'
		},
		safeTitle () {
			const raw = this.task.title
			const s = (typeof raw === 'string' ? raw : (raw && raw.text) || '') || '未命名文章'
			return s.replace(/\s*\r?\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
		},
		/** 对话痕迹：兼容元素是字符串或对象两种形态 */
		preview () {
			const p = this.task.preview
			if (!Array.isArray(p)) return []
			return p.slice(0, 2)
				.map(x => (typeof x === 'string' ? x : (x && (x.text || x.content)) || ''))
				.filter(Boolean)
		},
		/** 元数据：口吻 · 句数/时间 · 待确认数。一律等宽 + 用 · 分隔，保持成列。 */
		metaText () {
			const t = this.task
			const parts = []
			if (t.toneName) parts.push(t.toneName)
			const n = Number(t.line_count)
			parts.push(n > 0 ? (n + ' 句') : formatTime(t.created_at))
			const pend = Number(t.pending_confirm)
			if (pend > 0) parts.push('待确认 ' + pend)
			return parts.join(' · ')
		},
		actionText () {
			const s = this.task.status
			if (s === 'audio_ready') return '▶ 听'
			if (s === 'generated') return '去确认 →'
			if (s === 'confirmed') return '去生成 →'
			if (s === 'failed') return '重试 →'
			return '打开 →'
		}
	}
}
</script>

<style lang="scss" scoped>
.item {
	padding: $dui-s4 2rpx;
}

/* 整行按压反馈：用底色变化而不是缩放下沉 —— 缩放一整行列表会像"抖动"，
   底色变化更像"这一行被按住"。它在两种 reduced-motion 模式下都成立，
   所以直接挂 hover-class，不需要 .press / .press-ink 的分支。 */
.item-hover {
	background-color: $dui-press;
}

/* 非首条：上方一条卡内分隔线 */
.item-div {
	border-top: 1rpx solid $dui-line2;
}

.head {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 12rpx;
	margin-bottom: $dui-s3;
}

.dot-done {
	width: 6rpx;
	height: 6rpx;
	border-radius: 3rpx;
	background-color: $dui-ink4;
	flex-shrink: 0;
}

.name {
	flex: 1;
	min-width: 0;
	font-size: $dui-fs-body;
	font-weight: $dui-fw-medium;
	color: $dui-ink;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.meta {
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	letter-spacing: $dui-ls-num;
	color: $dui-ink3;
	flex-shrink: 0;
}

.act {
	font-size: $dui-fs-caption;
	font-weight: $dui-fw-semi;
	color: $dui-vm;
	flex-shrink: 0;
}

/* ---------- 对话痕迹：左右交错 + 竖轨 ---------- */
.dlg {
	display: flex;
	flex-direction: column;
	gap: 10rpx;
	padding-left: $dui-s1;
}

.ln {
	display: flex;
	flex-direction: row;
	align-items: flex-start;
	gap: 12rpx;
	max-width: 94%;
}

.ln-a { align-self: flex-start; }

.ln-b {
	align-self: flex-end;
	flex-direction: row-reverse;
}

.rail {
	width: 4rpx;
	border-radius: 2rpx;
	align-self: stretch;
	min-height: 26rpx;
	flex-shrink: 0;
}

.ln-a .rail { background-color: $dui-ink; }
.ln-b .rail { background-color: $dui-vm; }

.who {
	font-size: 18rpx;
	font-weight: $dui-fw-bold;
	flex-shrink: 0;
	padding-top: 5rpx;
}

.ln-a .who { color: $dui-ink3; }
.ln-b .who { color: $dui-vm; }

.say {
	font-size: $dui-fs-body;
	line-height: $dui-lh-body;
	color: $dui-ink2;
}

.ln-b .say {
	color: $dui-vm;
	text-align: right;
}
</style>
