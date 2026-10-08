<template>
	<view class="sr" :class="{ first: first }" hover-class="sr-hover" @tap="$emit('tap')">
		<text class="sr-label">{{ label }}</text>
		<text v-if="value" class="sr-value">{{ value }}</text>
		<text v-if="arrow" class="sr-arrow">›</text>
	</view>
</template>

<script>
/**
 * SectionRow 设置行
 *
 * 设计：**不做成卡片，也不做成分组块** —— 一行一条，靠分隔线区隔。
 * 高度、左右边距、字号全部统一，保证「我的」页看起来是一个整体而不是拼装。
 */
export default {
	name: 'SectionRow',
	emits: ['tap'],
	props: {
		label: { type: String, default: '' },
		value: { type: String, default: '' },
		arrow: { type: Boolean, default: true },
		first: { type: Boolean, default: false } // 首行不画顶部分隔线
	}
}
</script>

<style lang="scss" scoped>
.sr {
	display: flex;
	flex-direction: row;
	align-items: center;
	height: 104rpx;
	border-top: 1rpx solid $dui-line;
}

.first {
	border-top: none;
}

.sr-hover {
	opacity: 0.65;
}

.sr-label {
	flex: 1;
	font-size: 29rpx;
	color: $dui-ink;
}

.sr-value {
	font-size: 25rpx;
	color: $dui-ink3;
	margin-right: $dui-s2;
}

.sr-arrow {
	font-size: 30rpx;
	color: $dui-ink5;
}
</style>
