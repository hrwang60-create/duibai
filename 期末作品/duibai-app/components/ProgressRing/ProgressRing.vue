<template>
	<view class="wrap" :style="{ width: size + 'rpx', height: size + 'rpx' }">
		<view class="track" :style="ringStyle"></view>
		<view class="arc" :style="arcStyle"></view>
		<view class="center">
			<slot>
				<text class="center-text">{{ text }}</text>
			</slot>
		</view>
	</view>
</template>

<script>
/**
 * ProgressRing 环形活动指示器
 *
 * ⚠️ 诚实设计：调用大模型是单次黑盒请求，**拿不到真实进度百分比**。
 *    所以这里做的是「不确定进度」的环（转动的弧 + 中心内容），
 *    而不是画一个假的百分比环。中心区域用 slot 放「已用时间 / 阶段文案」。
 */
export default {
	name: 'ProgressRing',
	props: {
		size: { type: Number, default: 220 },   // rpx
		stroke: { type: Number, default: 10 },  // rpx
		text: { type: String, default: '' }
	},
	computed: {
		ringStyle () {
			return {
				width: this.size + 'rpx',
				height: this.size + 'rpx',
				borderWidth: this.stroke + 'rpx'
			}
		},
		arcStyle () {
			return {
				width: this.size + 'rpx',
				height: this.size + 'rpx',
				borderWidth: this.stroke + 'rpx'
			}
		}
	}
}
</script>

<style lang="scss" scoped>
.wrap {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
}

.track {
	position: absolute;
	border-radius: 50%;
	border-style: solid;
	border-color: $dui-line;
	box-sizing: border-box;
}

.arc {
	position: absolute;
	border-radius: 50%;
	border-style: solid;
	border-color: transparent;
	border-top-color: $dui-vm;
	border-right-color: $dui-vm;
	box-sizing: border-box;
}

/* 尊重系统"减少动态效果"：只有 no-preference 才转。
   减动效时保留静态的环（弧仍显示，只是不旋转），信息不丢失。 */
@media (prefers-reduced-motion: no-preference) {
	.arc {
		animation: dui-spin 900ms linear infinite;
	}
}

.center {
	position: absolute;
	left: 0;
	top: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
}

.center-text {
	font-size: 40rpx;
	font-weight: 500;
	color: $dui-ink;
	letter-spacing: 1rpx;
}

@keyframes dui-spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}
</style>
