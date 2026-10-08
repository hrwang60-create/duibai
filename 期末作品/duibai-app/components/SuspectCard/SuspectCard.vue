<template>
	<view class="sc">
		<view class="sc-head">
			<view class="sc-q" aria-label="待确认"><text class="sc-q-text">?</text></view>
			<text class="sc-kind">{{ kindText }}</text>
			<text class="sc-prog">{{ index + 1 }} / {{ total }}</text>
		</view>

		<text class="sc-line">第 {{ line.seq }} 句 · {{ speakerLabel }}</text>
		<text class="sc-quote">{{ line.text }}</text>

		<view class="sc-desc">
			<text class="sc-desc-text">{{ problemText }}</text>
		</view>

		<!-- 原文对照：不让你凭记忆判断 -->
		<view v-if="paragraphText" class="sc-ref">
			<text class="sc-ref-label">原文对照</text>
			<text class="sc-ref-text">{{ paragraphText }}</text>
		</view>

		<!-- 编辑态 -->
		<view v-if="editing" class="sc-edit">
			<textarea
				class="sc-input"
				v-model="draft"
				auto-height
				:maxlength="500"
				placeholder="改成你认为对的说法"
				placeholder-class="sc-ph"
			/>
			<view class="sc-edit-acts">
				<view class="sc-btn-s" hover-class="sc-hover" @tap="cancelEdit">
					<text class="sc-btn-s-text">取消</text>
				</view>
				<view class="sc-btn-p" hover-class="sc-hover" @tap="save">
					<text class="sc-btn-p-text">保存这一句</text>
				</view>
			</view>
		</view>

		<!-- 三个动作（文案沿用现有实现：查看原文 / 修改这一句 / 确认没问题） -->
		<template v-else>
			<view class="sc-acts">
				<view class="sc-btn-s" hover-class="sc-hover" @tap="$emit('view-source', line)">
					<text class="sc-btn-s-text">查看原文</text>
				</view>
				<view class="sc-btn-s" hover-class="sc-hover" @tap="startEdit">
					<text class="sc-btn-s-text">修改这一句</text>
				</view>
			</view>
			<view class="sc-btn-p full" hover-class="sc-hover" @tap="$emit('confirm', line)">
				<text class="sc-btn-p-text">确认没问题</text>
			</view>
		</template>
	</view>
</template>

<script>
/**
 * SuspectCard 可疑处卡片
 *
 * 设计立场：**不要写成"⚠️ 第 12 句存在问题 / [确认] [修改]"** —— 那太像表单。
 * 这里做成「谈话被卡住了」的样子：
 *   · `?` 而不是感叹号（是"追问"，不是"报错"）
 *   · 给出**原文对照**，不让你凭记忆判断
 *   · 动作是"查看原文 / 修改这一句 / 确认没问题"，都是在回应这场谈话
 *
 * 结构对齐《八页最终样机》04：`?` 徽标（朱底白字圆）+ 说明 + 原句
 *   + 一排 pill 按钮 + 底部墨色胶囊主按钮。
 * 文案**沿用现有实现**（产品已定：比"保留/改这句/删掉"更清楚）。
 *
 * ⚠️ 触控：次要按钮 76 → 88rpx；主按钮 80 → 96rpx（体验规范 §1.2.1）。
 */
export default {
	name: 'SuspectCard',
	emits: ['view-source', 'save', 'confirm'],
	props: {
		line: { type: Object, default: () => ({}) },
		index: { type: Number, default: 0 },
		total: { type: Number, default: 1 },
		paragraphText: { type: String, default: '' }
	},
	data () {
		return { editing: false, draft: '' }
	},
	computed: {
		speakerLabel () {
			return this.line && this.line.speaker === 'B' ? '乙' : '甲'
		},
		kindText () {
			const f = this.line && this.line.flag
			if (f === 'no_source') return '原文未支持'
			if (f === 'term') return '读法待确认'
			return '需要确认'
		},
		problemText () {
			const f = this.line && this.line.flag
			if (f === 'no_source') return '这句没有对应的原文段落，可能是模型自己加的。要不要保留？'
			if (f === 'term') return '这句里出现了括号或特殊符号（已自动清除），确认一下读法对不对。'
			return '这句需要你确认一下。'
		}
	},
	methods: {
		startEdit () {
			/* 防御：line 虽然有 default(() => ({}))，但父组件传 undefined 时
			   仍会拿到 undefined，.text 直接抛错。写不写这层差别很大 ——
			   抛错是「点按钮整块卡死」，不抛只是草稿为空。 */
			this.draft = (this.line && this.line.text) || ''
			this.editing = true
		},
		cancelEdit () {
			this.editing = false
		},
		save () {
			const t = String(this.draft || '').trim()
			if (!t) {
				uni.showToast({ title: '台词不能为空', icon: 'none' })
				return
			}
			if (t === this.line.text) {
				this.editing = false
				return
			}
			this.editing = false
			this.$emit('save', t)
		}
	}
}
</script>

<style lang="scss" scoped>
/* 卡片：与全站同一种卡（更亮的纸 + 极细边），不再用整条朱色左边框 */
.sc {
	background-color: $dui-card;
	border: 1rpx solid $dui-line;
	border-radius: $dui-r-card;
	padding: $dui-s4;
}

.sc-head {
	display: flex;
	flex-direction: row;
	align-items: center;
	margin-bottom: $dui-s3;
}

/* ? 徽标：朱底白字圆 */
.sc-q {
	width: 40rpx;
	height: 40rpx;
	border-radius: $dui-r-pill;
	background-color: $dui-vm;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-right: $dui-s2;
}

.sc-q-text {
	font-size: $dui-fs-caption;
	font-weight: $dui-fw-bold;
	color: $dui-on-ink;
}

.sc-kind {
	flex: 1;
	font-size: $dui-fs-caption;
	font-weight: $dui-fw-semi;
	color: $dui-ink2;
	letter-spacing: 1rpx;
}

.sc-prog {
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	letter-spacing: $dui-ls-num;
	color: $dui-ink3;
}

.sc-line {
	display: block;
	font-size: $dui-fs-label;
	letter-spacing: $dui-ls-label;
	color: $dui-ink3;
	margin-bottom: $dui-s2;
}

.sc-quote {
	display: block;
	font-size: $dui-fs-bodyL;
	font-weight: $dui-fw-medium;
	line-height: $dui-lh-bodyL;
	color: $dui-ink;
	margin-bottom: $dui-s3;
}

.sc-desc {
	margin-bottom: $dui-s3;
}

.sc-desc-text {
	font-size: $dui-fs-body;
	line-height: $dui-lh-body;
	color: $dui-ink2;
}

/* 原文对照：卡片里的一块"内陷纸" */
.sc-ref {
	background-color: $dui-page;
	border-radius: $dui-r-card;
	padding: $dui-s3;
	margin-bottom: $dui-s4;
}

.sc-ref-label {
	display: block;
	font-family: $dui-font-serif;
	font-size: $dui-fs-label;
	letter-spacing: $dui-ls-label;
	color: $dui-ink3;
	margin-bottom: $dui-s1;
}

.sc-ref-text {
	font-size: $dui-fs-body;
	line-height: $dui-lh-body;
	color: $dui-ink2;
}

/* 动作 */
.sc-acts {
	display: flex;
	flex-direction: row;
	margin-bottom: $dui-s2;
}

/* 次要按钮：88rpx（此前 76rpx） */
.sc-btn-s {
	flex: 1;
	height: 88rpx;
	border-radius: $dui-r-pill;
	border: 1rpx solid $dui-line;
	background-color: $dui-page;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-right: $dui-s2;
}

.sc-acts .sc-btn-s:last-child {
	margin-right: 0;
}

.sc-btn-s-text {
	font-size: $dui-fs-caption;
	color: $dui-ink2;
}

/* 主按钮：96rpx（此前 80rpx，与其他主按钮一致） */
.sc-btn-p {
	height: 96rpx;
	border-radius: $dui-r-pill;
	background-color: $dui-ink;
	display: flex;
	align-items: center;
	justify-content: center;
}

.sc-btn-p.full {
	width: 100%;
	margin-top: $dui-s1;
}

.sc-btn-p-text {
	font-size: $dui-fs-body;
	font-weight: $dui-fw-medium;
	color: $dui-on-ink;
}

.sc-hover {
	opacity: 0.85;
}

/* 编辑态 */
.sc-edit {
	margin-top: $dui-s1;
}

.sc-input {
	width: 100%;
	min-height: 130rpx;
	background-color: $dui-page;
	border-radius: $dui-r-card;
	padding: $dui-s3;
	font-size: $dui-fs-body;
	line-height: $dui-lh-body;
	color: $dui-ink;
	box-sizing: border-box;
}

.sc-ph {
	color: $dui-ink4;
	font-size: $dui-fs-body;
}

.sc-edit-acts {
	display: flex;
	flex-direction: row;
	margin-top: $dui-s2;
}

.sc-edit-acts .sc-btn-p {
	flex: 2;
}

.sc-edit-acts .sc-btn-s {
	flex: 1;
	margin-right: $dui-s2;
}
</style>
