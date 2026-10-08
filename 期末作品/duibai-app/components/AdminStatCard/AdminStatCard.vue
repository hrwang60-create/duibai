<template>
	<view class="sc">
		<text class="sc-value">{{ display }}</text>
		<text class="sc-label">{{ label }}</text>
	</view>
</template>

<script>
/**
 * AdminStatCard 统计卡（管理首页）
 * 管理端是**加分项**，视觉从简：一个大数字 + 一行标签，不加图标不加动效。
 */
export default {
	name: 'AdminStatCard',
	props: {
		label: { type: String, default: '' },
		value: { type: [Number, String], default: 0 },
		suffix: { type: String, default: '' }
	},
	computed: {
		display () {
			return String(this.value) + this.suffix
		}
	}
}
</script>

<style lang="scss" scoped>
.sc {
	flex: 1;
	padding: $dui-s4 0;
	border-top: 4rpx solid $dui-ink;
	margin-right: $dui-s4;
}

.sc:last-child {
	margin-right: 0;
}

.sc-value {
	display: block;
	font-size: 48rpx;
	font-weight: 500;
	color: $dui-ink;
	letter-spacing: 1rpx;
	margin-bottom: 6rpx;
}

.sc-label {
	font-size: 22rpx;
	color: $dui-ink3;
	letter-spacing: 1rpx;
}
</style>
