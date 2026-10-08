<template>
	<view v-if="visible" class="sp-wrap">
		<view class="sp-mask" @tap="$emit('close')"></view>
		<view class="sp-panel">
			<view class="sp-head">
				<text class="sp-tag">原文 P{{ paragraph.seq }}</text>
				<view class="sp-close press" aria-label="关闭" @tap="$emit('close')">
					<text class="sp-close-text">关闭</text>
				</view>
			</view>

			<text class="sp-text">{{ paragraph.text }}</text>

			<view class="sp-foot press" @tap="$emit('full', paragraph)">
				<text class="sp-full">查看完整原文 ›</text>
			</view>
		</view>
	</view>
</template>

<script>
/**
 * SourcePopover 出处浮层
 *
 * 作用：**证明这段对话不是凭空编的** —— 点「出处 P1」就地把原文摆出来，
 * 不用跳页就能核对；想细看再点「查看完整原文」。
 *
 * 为什么不做成跳页：核对出处是高频动作，跳页会打断听的过程。
 */
export default {
	name: 'SourcePopover',
	emits: ['close', 'full'],
	props: {
		visible: { type: Boolean, default: false },
		paragraph: { type: Object, default: () => ({ seq: 0, text: '' }) }
	}
}
</script>

<style lang="scss" scoped>
.sp-wrap {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 100;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0 $dui-s5;
	box-sizing: border-box;
}

.sp-mask {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	background-color: $dui-scrim;
}

.sp-panel {
	position: relative;
	width: 100%;
	background-color: $dui-on-ink;
	border-radius: $dui-radius;
	padding: $dui-s4;
	box-sizing: border-box;
}

.sp-head {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	margin-bottom: $dui-s3;
}

.sp-tag {
	font-size: $dui-fs-label;
	font-weight: 700;
	letter-spacing: 3rpx;
	color: $dui-vm;
}

/* 关闭：视觉小字，热区撑到 88rpx（透明内边距，右对齐不改变观感）。
   浮层是纸底 → 按压用 .press（纸底按压类）。 */
.sp-close {
	min-width: 88rpx;
	min-height: 88rpx;
	display: flex;
	align-items: center;
	justify-content: flex-end;
}

.sp-close-text {
	font-size: 23rpx;
	color: $dui-ink3;
}

.sp-text {
	display: block;
	font-size: 28rpx;
	line-height: 1.7;
	color: $dui-ink;
}

/* 「查看完整原文」是浮层内的可点行：纸底 → .press；热区 ≥88rpx */
.sp-foot {
	margin-top: $dui-s4;
	padding-top: $dui-s3;
	border-top: 1rpx solid $dui-line;
	min-height: 88rpx;
	display: flex;
	align-items: center;
}

.sp-full {
	font-size: 25rpx;
	color: $dui-ink2;
}
</style>
