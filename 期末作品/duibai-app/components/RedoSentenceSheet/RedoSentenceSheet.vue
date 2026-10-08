<template>
	<view v-if="visible" class="rs-wrap">
		<view class="rs-mask" @tap="$emit('close')"></view>

		<view class="rs-sheet">
			<text class="rs-title">重新聊这一句</text>

			<view class="rs-origin">
				<text class="rs-origin-label">原句</text>
				<text class="rs-origin-text">{{ text }}</text>
			</view>

			<text class="sec-title" style="margin-top:32rpx">换一种说法</text>
			<view class="rs-opts">
				<!-- 未选中是纸底 → .press；选中是墨底白字 → .press-ink。
				     两者互斥，按底色判：绝不能把纸底类 .press 挂到墨底上（减动效下白字塌对比）。 -->
				<view
					v-for="o in options"
					:key="o.key"
					class="rs-opt"
					:class="{ on: o.key === picked, press: o.key !== picked, 'press-ink': o.key === picked }"
					@tap="picked = o.key"
				>
					<text class="rs-opt-text" :class="{ 'on-text': o.key === picked }">{{ o.label }}</text>
				</view>
			</view>

			<view class="rs-btn press-ink" @tap="$emit('submit', picked)">
				<text class="rs-btn-text">重新生成这一句</text>
			</view>

			<view class="rs-cancel press" hover-class="rs-cancel-hover" @tap="$emit('close')">
				<text class="rs-cancel-text">取消</text>
			</view>

			<text class="rs-note">只重做这一句，其余音频不动</text>
		</view>
	</view>
</template>

<script>
/**
 * RedoSentenceSheet 单句重做浮层
 *
 * 设计要点：**不给自由文本编辑器**，只给三个方向（更自然 / 更简洁 / 更严谨）。
 * 理由：用户此刻的需求是"这句听着别扭，换个说法"，不是"我要写文案"。
 * 降低认知成本，也让重做结果更可预期。
 */
export default {
	name: 'RedoSentenceSheet',
	emits: ['close', 'submit'],
	props: {
		visible: { type: Boolean, default: false },
		text: { type: String, default: '' }
	},
	data () {
		return {
			picked: 'natural',
			options: [
				{ key: 'natural', label: '更自然' },
				{ key: 'concise', label: '更简洁' },
				{ key: 'rigorous', label: '更严谨' }
			]
		}
	}
}
</script>

<style lang="scss" scoped>
.rs-wrap {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 110;
}

.rs-mask {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	background-color: $dui-scrim;
}

.rs-sheet {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: $dui-paper;
	border-radius: 28rpx 28rpx 0 0;
	padding: $dui-s5 $dui-s4 $dui-s5;
	box-sizing: border-box;
}

.rs-title {
	display: block;
	font-size: 32rpx;
	font-weight: 500;
	color: $dui-ink;
	margin-bottom: $dui-s4;
}

.rs-origin {
	padding: $dui-s3;
	background-color: $dui-paper2;
	border-radius: $dui-radius;
}

.rs-origin-label {
	display: block;
	font-size: $dui-fs-label;
	color: $dui-ink3;
	letter-spacing: 2rpx;
	margin-bottom: $dui-s1;
}

.rs-origin-text {
	font-size: 28rpx;
	line-height: 1.6;
	color: $dui-ink2;
}

.rs-opts {
	display: flex;
	flex-direction: row;
	margin-bottom: $dui-s5;
}

/* 选项行：触控 ≥88rpx（原 76rpx 偏小）。纸底按压用 .press（见模板 class 绑定） */
.rs-opt {
	padding: 0 $dui-s4;
	height: 88rpx;
	border-radius: $dui-radius-pill;
	border: 1rpx solid $dui-line;
	display: flex;
	align-items: center;
	margin-right: $dui-s2;
}

.rs-opt.on {
	background-color: $dui-ink;
	border-color: $dui-ink;
}

.rs-opt-text {
	font-size: 27rpx;
	color: $dui-ink2;
}

.on-text {
	color: $dui-on-ink;
	font-weight: 500;
}

/* 主行动：墨底白字 → 按压用 .press-ink（opacity 让白字与墨底同比衰减，对比度仍达标） */
.rs-btn {
	height: 96rpx;
	border-radius: $dui-radius-pill;
	background-color: $dui-ink;
	display: flex;
	align-items: center;
	justify-content: center;
}

.rs-btn-text {
	font-size: 30rpx;
	font-weight: 500;
	color: $dui-on-ink;
	letter-spacing: 1rpx;
}

/* 取消：纸底 → .press；触控 ≥88rpx（原 80rpx） */
.rs-cancel {
	height: 88rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-top: $dui-s2;
}

.rs-cancel-hover {
	opacity: 0.7;
}

.rs-cancel-text {
	font-size: 27rpx;
	color: $dui-ink3;
}

/* ink5 只允许做装饰线条，不承载文字 → 改 ink3（已按对比度修正） */
.rs-note {
	display: block;
	text-align: center;
	font-size: 21rpx;
	color: $dui-ink3;
	margin-top: $dui-s2;
}
</style>
