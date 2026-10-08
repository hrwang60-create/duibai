<template>
	<view class="empty">
		<view class="badge">
			<text class="badge-text">{{ glyph }}</text>
		</view>
		<text class="title">{{ title }}</text>
		<text v-if="desc" class="desc">{{ desc }}</text>
		<view v-if="actionText" class="action press-ink" @tap="$emit('action')">
			<text class="action-text">{{ actionText }}</text>
		</view>
	</view>
</template>

<script>
/**
 * EmptyState 空状态
 * 数据为空时给引导，不留一片空白。
 * 视觉：圆形底 + 汉字字形（不用图标，避免图标库依赖）。
 */
export default {
	name: 'EmptyState',
	emits: ['action'],
	props: {
		title: { type: String, default: '这里还什么都没有' },
		desc: { type: String, default: '' },
		actionText: { type: String, default: '' },
		glyph: { type: String, default: '空' }
	}
}
</script>

<style lang="scss" scoped>
.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: $dui-s7 $dui-s5;
}

.badge {
	width: 112rpx;
	height: 112rpx;
	border-radius: 56rpx;
	background-color: $dui-paper2;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-bottom: $dui-s4;
}

.badge-text {
	font-size: 44rpx;
	font-weight: 500;
	color: $dui-ink3;
}

.title {
	font-size: 30rpx;
	color: $dui-ink;
	margin-bottom: $dui-s1;
}

.desc {
	font-size: 25rpx;
	color: $dui-ink3;
	text-align: center;
	line-height: 1.6;
}

/* 动作按钮：墨底胶囊 → 按压用 .press-ink（墨底专用）。
   理由：.press-ink 用 opacity，让白字与墨底同比衰减，对比度仍达标；
   若错挂纸底类 .press，减动效下底色会由墨变浅、文字仍近白，对比度直接塌。
   触控目标 @1.2.1 要求 ≥88rpx。 */
.action {
	margin-top: $dui-s5;
	padding: 0 $dui-s5;
	height: 88rpx;
	border-radius: $dui-radius-pill;
	background-color: $dui-ink;
	display: flex;
	align-items: center;
}

.action-text {
	font-size: 27rpx;
	color: $dui-on-ink;
}
</style>
