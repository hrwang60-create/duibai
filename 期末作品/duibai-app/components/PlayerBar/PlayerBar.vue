<template>
	<view class="pb">
		<!-- 降级提示：没有音频时明确说明，不假装有声音 -->
		<view v-if="mode === 'read'" class="pb-note">
			<text class="pb-note-text">音频未生成 · 当前按阅读节奏演示</text>
		</view>

		<view class="speeds" role="radiogroup">
			<view
				v-for="s in speedList"
				:key="s"
				class="sp-item"
				:class="{ on: s === speed }"
				role="radio"
				:aria-label="'播放速度 ' + s + ' 倍'"
				:aria-checked="s === speed ? 'true' : 'false'"
				:hover-class="s === speed ? 'sp-hover-ink' : 'sp-hover'"
				@tap="$emit('speed', s)"
			>
				<text class="sp-text">{{ s }}×</text>
			</view>
		</view>

		<view class="keys">
			<view class="k" hover-class="k-hover" aria-label="上一句" @tap="$emit('prev')">
				<text class="k-text">⟨</text>
			</view>
			<view class="k main" hover-class="k-hover" :aria-label="playing ? '暂停' : '播放'" @tap="$emit('toggle')">
				<text class="k-main-text">{{ playing ? '‖' : '▶' }}</text>
			</view>
			<view class="k" hover-class="k-hover" aria-label="下一句" @tap="$emit('next')">
				<text class="k-text">⟩</text>
			</view>
		</view>

		<text class="pb-hint">点任意一句可重听 · 侧滑可改</text>
	</view>
</template>

<script>
/**
 * PlayerBar 播放控制
 *
 * 设计立场：**播放器是辅助，对话流才是主体** —— 所以刻意做小、靠底、
 * 不加进度条（进度已经是左侧竖轨的职责了）。
 *
 * 两种模式：
 *   · audio：真实音频播放（TTS 接入后）
 *   · read ：**降级模式** —— 没有音频时按阅读节奏逐句推进。
 *            ⚠️ 必须显式标注「音频未生成」，不能让用户以为在放声音。
 *
 * 体验规范 §1：倍速项此前约 43rpx（远低于 88rpx 触控线）→ 已撑到 88rpx。
 * 体验规范 §4.3：纯符号按钮（上/下一句、播放）全部补 `aria-label`；
 *   倍速项用 `role="radio"` + `aria-checked` 让读屏能报"当前选中的速度"。
 */
export default {
	name: 'PlayerBar',
	emits: ['prev', 'next', 'toggle', 'speed'],
	props: {
		playing: { type: Boolean, default: false },
		speed: { type: Number, default: 1 },
		mode: { type: String, default: 'read' } // audio | read
	},
	data () {
		return { speedList: [0.8, 1.0, 1.25, 1.5] }
	}
}
</script>

<style lang="scss" scoped>
/* 播放条做成一张卡片：靠"更亮的纸"分层，和上面的对话流分得开 */
.pb {
	margin: 0 0 $dui-s3;
	padding: $dui-s3 $dui-s4;
	background-color: $dui-card;
	border: 1rpx solid $dui-line;
	border-radius: $dui-r-card;
	box-sizing: border-box;
}

.pb-note {
	background-color: $dui-page;
	border-radius: $dui-r-pill;
	padding: 12rpx $dui-s3;
	margin-bottom: $dui-s3;
	display: flex;
	justify-content: center;
}

.pb-note-text {
	font-size: $dui-fs-label;
	color: $dui-ink2;
	letter-spacing: $dui-ls-caption;
}

.speeds {
	display: flex;
	flex-direction: row;
	justify-content: center;
	margin-bottom: $dui-s2;
}

/* 倍速项：热区 88rpx（此前约 43rpx，太低） */
.sp-item {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 88rpx;
	min-width: 88rpx;
	padding: 0 $dui-s2;
	margin: 0 4rpx;
	border-radius: $dui-r-pill;
	color: $dui-ink3;
}

.sp-text {
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	letter-spacing: $dui-ls-num;
}

.sp-item.on {
	color: $dui-on-ink;
	background-color: $dui-ink;
}

/* 按压反馈按选中态条件挂（单一表达式产出互斥对，照 history.vue 筛选 chip）：
   · 未选中是纸底（底色可承受"变深一档"）→ .sp-hover 变 $dui-press
   · 选中是**墨底白字**（底色不能变浅，否则白字对比度塌）→ .sp-hover-ink 只用 opacity 衰减
   —— 与全站 .press / .press-ink 同一原则。 */
.sp-hover {
	background-color: $dui-press;
}

.sp-hover-ink {
	opacity: 0.88;
}

.keys {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: center;
	margin-top: $dui-s1;
}

.k {
	width: 88rpx;
	height: 88rpx;
	border-radius: $dui-r-pill;
	border: 1rpx solid $dui-line;
	display: flex;
	align-items: center;
	justify-content: center;
	margin: 0 $dui-s3;
}

.k-hover {
	opacity: 0.7;
}

.k-text {
	font-size: $dui-fs-bodyL;
	color: $dui-ink2;
}

.main {
	width: 112rpx;
	height: 112rpx;
	background-color: $dui-ink;
	border-color: $dui-ink;
}

.k-main-text {
	font-size: 34rpx;
	color: $dui-on-ink;
}

.pb-hint {
	display: block;
	text-align: center;
	font-size: $dui-fs-label;
	color: $dui-ink3;
	margin-top: $dui-s3;
	letter-spacing: $dui-ls-caption;
}
</style>
