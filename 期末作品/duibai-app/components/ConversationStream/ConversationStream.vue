<template>
	<view class="stream" :class="{ dim: dim }">
		<!-- 左侧进度轨：细竖线 + 一个点 +「12 / 42」数字 -->
		<view class="rail">
			<view class="rail-line"></view>
			<view class="rail-dot" :style="{ top: dotTop }"></view>
			<text class="rail-num">{{ total ? (cur + 1) + ' / ' + total : '' }}</text>
		</view>

		<view class="body">
			<!-- 上方：已播过（越远越小越淡） -->
			<view class="zone">
				<view
					v-for="it in above"
					:key="it.i"
					class="ln done"
					:class="[distClass(it.d), it.speaker === 'B' ? 'b' : 'a']"
					hover-class="ln-hover"
					@tap="$emit('seek', it.i)"
				>
					<text class="sp" :aria-label="it.speaker === 'B' ? '乙说' : '甲说'">{{ it.speaker === 'B' ? '乙' : '甲' }}</text>
					<text class="tx">{{ it.text }}</text>
				</view>
			</view>

			<!-- 当前句：最大最亮，永远在视觉中心；左侧有竖轨指出"正在说这一句" -->
			<view v-if="curLine" class="cur">
				<view class="ln now" :class="curLine.speaker === 'B' ? 'b' : 'a'">
					<view class="now-bar rail-live"></view>
					<text class="sp" :aria-label="curLine.speaker === 'B' ? '乙说' : '甲说'">{{ curLine.speaker === 'B' ? '乙' : '甲' }}</text>
					<text class="tx">{{ curLine.text }}</text>
				</view>

				<view class="src">
					<text v-if="curLine.source_paragraph" class="src-label">出处</text>
					<view
						v-if="curLine.source_paragraph"
						class="src-p"
						hover-class="src-hit"
						@tap="$emit('source', curLine)"
					>
						<text class="src-p-t">P{{ curLine.source_paragraph }}</text>
					</view>
					<view class="src-edit" hover-class="src-hit" @tap="$emit('edit', curLine)">
						<text class="src-edit-t">改这句</text>
					</view>
				</view>
			</view>

			<!-- 下方：还没播（越远越小越淡） -->
			<view class="zone">
				<view
					v-for="it in below"
					:key="it.i"
					class="ln next"
					:class="[distClass(it.d), it.speaker === 'B' ? 'b' : 'a']"
					hover-class="ln-hover"
					@tap="$emit('seek', it.i)"
				>
					<text class="sp" :aria-label="it.speaker === 'B' ? '乙说' : '甲说'">{{ it.speaker === 'B' ? '乙' : '甲' }}</text>
					<text class="tx">{{ it.text }}</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
/**
 * ConversationStream —— **整个产品的主界面**
 *
 * 设计要点（依据 UI设计规范.md 的 Signature Interaction）：
 *   · 台词以纵向流呈现，**当前句永远在视觉中心，最大最亮**（宋体 + 半粗 + 左侧竖轨）
 *   · 上下句带**景深**：离当前越远，字号越小、颜色越淡（d1 > d2 > d3）
 *   · 说话人**不用头像、不用气泡，只用字的颜色区分** —— 当前句甲墨 / 乙朱
 *   · 左侧细竖轨 + 一个点表示进度，配「12 / 42」数字感（不是进度条）
 *   · **点任意一句 → 该句浮到中央并重播**（像把耳朵切回这里）
 *
 * ⚠️ 对比度硬伤已修（体验规范 §2.3 + 走查 1.1）：旧实现用 `ink5`（仅装饰级）
 *    做**已播/未播台词正文**，再叠 `opacity:0.45~0.7`，属功能性文字不可读。
 *    现在（对话流落在**页面底 #EDE7D9** 上，令牌要按页面底验，不是卡片底）：
 *      · 已播台词（done）→ `$dui-ink3`（页面底 **4.55:1** ✅ AA）
 *      · 未播台词（next）→ `$dui-ink2`（页面底 **5.85:1** ✅ AA）
 *      · **文字上零 opacity** —— 景深只靠字号阶梯（body 27 → caption 24 → label 22）表达"越远越轻"
 *    不能再退回 ink4：它压页面底只有 4.10:1（4.51 是压卡片底的值）。
 *
 * ⚠️ 实现取舍：不真滚动，而是只渲染当前句 ±3 行，靠 flex 居中让当前句稳在中央。
 *    这样避免小程序里算滚动偏移（难以精确），代价是切换时有轻微重排 —— 用 transition 缓冲
 *    （transition 已包进 reduced-motion）。
 */
export default {
	name: 'ConversationStream',
	emits: ['seek', 'source', 'edit'],
	props: {
		lines: { type: Array, default: () => [] },
		index: { type: Number, default: 0 },
		radius: { type: Number, default: 3 },   // 上下各渲染几行
		dim: { type: Boolean, default: false }  // 变暗：表示"谈话被打断"
	},
	computed: {
		total () {
			return this.lines.length
		},
		cur () {
			return Math.max(0, Math.min(this.index, this.total - 1))
		},
		curLine () {
			return this.lines[this.cur] || null
		},
		above () {
			const out = []
			for (let d = this.radius; d >= 1; d--) {
				const i = this.cur - d
				if (i >= 0) out.push({ i, d, text: this.lines[i].text, speaker: this.lines[i].speaker })
			}
			return out
		},
		below () {
			const out = []
			for (let d = 1; d <= this.radius; d++) {
				const i = this.cur + d
				if (i < this.total) out.push({ i, d, text: this.lines[i].text, speaker: this.lines[i].speaker })
			}
			return out
		},
		dotTop () {
			// 点的位置 = 整体进度（不是屏幕位置）。这样"说到哪了"一眼可见。
			if (this.total <= 1) return '0%'
			const p = this.cur / (this.total - 1)
			return (p * 100).toFixed(2) + '%'
		}
	},
	methods: {
		distClass (d) {
			return d === 1 ? 'd1' : (d === 2 ? 'd2' : 'd3')
		}
	}
}
</script>

<style lang="scss" scoped>
.stream {
	position: relative;
	height: 100%;
	display: flex;
	flex-direction: column;
	justify-content: center;
	padding-left: 56rpx;
	padding-right: $dui-s3;
}

/* ---------- 左侧进度轨 ---------- */
.rail {
	position: absolute;
	left: 14rpx;
	top: 60rpx;
	bottom: 60rpx;
	width: 40rpx;
}

.rail-line {
	position: absolute;
	left: 6rpx;
	top: 0;
	bottom: 0;
	width: 2rpx;
	background-color: $dui-line;
}

.rail-dot {
	position: absolute;
	left: 2rpx;
	width: 10rpx;
	height: 10rpx;
	border-radius: 5rpx;
	background-color: $dui-vm;
}

.rail-num {
	position: absolute;
	left: -4rpx;
	top: -44rpx;
	/* 进度数字用等宽 —— 和首页的 01/07、时长是同一套数字语言 */
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	letter-spacing: $dui-ls-num;
	color: $dui-ink3;
	white-space: nowrap;
}

/* ---------- 台词 ---------- */
.body {
	display: flex;
	flex-direction: column;
	justify-content: center;
}

.zone {
	display: flex;
	flex-direction: column;
}

/* 单句整块可点（点句重听）：热区 ≥88rpx，用 padding 撑起，不改行距观感 */
.ln {
	display: flex;
	flex-direction: row;
	align-items: center;
	min-height: 88rpx;
	padding: $dui-s1 0;
	margin-bottom: $dui-s2;
	box-sizing: border-box;
}

.sp {
	width: 36rpx;
	flex-shrink: 0;
	font-weight: $dui-fw-bold;
	line-height: 1.7;
}

.tx {
	flex: 1;
	line-height: 1.7;
}

/* 说话人：只用颜色区分 —— 甲墨、乙朱（仅当前句）；
   景深台词两色都退成灰阶，靠"已播/未播"分深浅 */
.a .sp, .a .tx { color: $dui-ink3; }
.b .sp, .b .tx { color: $dui-ink3; }

/* ---------- 景深：色阶按「页面纸」实算选值 ----------
   对话流落在**页面底 #EDE7D9** 上（.stage 无底色，result 与 confirm 都是页面底）。
   已播 done = ink3（页面底 4.55 ✅）；未播 next = ink2（页面底 5.85 ✅）。
   ⚠️ 不能用 ink4：#756E61 压卡片底是 4.51，但压**页面底**只有 4.10 ❌ ——
      令牌当初按卡片底验的，而这里在页面底上，所以整体上调一档。
   ⚠️ 景深不再叠 opacity：改由**字号阶梯**承担（body→caption→label 本身就够表达"越远越轻"），
      避免任何一次透明度叠加把对比度拖到 4.5 以下。 */
.done .sp, .done .tx { color: $dui-ink3; }
.next .sp, .next .tx { color: $dui-ink2; }

/* 距离越远，字号越小（色值统一、不做透明度） */
.d1 .tx, .d1 .sp { font-size: $dui-fs-body; }
.d2 .tx, .d2 .sp { font-size: $dui-fs-caption; }
.d3 .tx, .d3 .sp { font-size: $dui-fs-label; }

/* ---------- 当前句 ---------- */
.cur {
	margin: $dui-s4 0;
}

.now .tx {
	font-family: $dui-font-serif;
	font-size: $dui-fs-h1;
	font-weight: $dui-fw-semi;
	line-height: $dui-lh-h1;
	letter-spacing: $dui-ls-h1;
}

.now .sp {
	font-size: $dui-fs-caption;
	line-height: 1.7;
}

/* 当前句的竖轨：甲墨 / 乙朱。它是"正在说这一句"的指针，
   比加粗更安静；配 `.rail-live` 会缓慢呼吸（reduced-motion 下自动关）。 */
.now-bar {
	width: 6rpx;
	min-height: 44rpx;
	border-radius: 3rpx;
	align-self: stretch;
	margin-right: $dui-s2;
	flex-shrink: 0;
}

.now.a .now-bar { background-color: $dui-ink; }
.now.b .now-bar { background-color: $dui-vm; }

.now.a .tx, .now.a .sp { color: $dui-ink; }
.now.b .tx, .now.b .sp { color: $dui-vm; }

/* ---------- 出处行 ---------- */
.src {
	display: flex;
	flex-direction: row;
	align-items: center;
	padding-left: 36rpx;
}

.src-label {
	font-size: $dui-fs-label;
	letter-spacing: $dui-ls-label;
	color: $dui-ink3;
	margin-right: $dui-s1;
}

/* 出处 P1：等宽 + 朱色（可点，热区 ≥88rpx） */
.src-p {
	min-height: 88rpx;
	display: flex;
	align-items: center;
	padding: 0 $dui-s2;
}

.src-p-t {
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	letter-spacing: $dui-ls-num;
	color: $dui-vm;
	border-bottom: 1rpx solid $dui-vm-soft;
	padding-bottom: 2rpx;
}

/* 「改这句」（可点，热区 ≥88rpx） */
.src-edit {
	min-height: 88rpx;
	display: flex;
	align-items: center;
	padding: 0 $dui-s2;
	margin-left: $dui-s2;
}

.src-edit-t {
	font-size: $dui-fs-label;
	color: $dui-ink3;
	border-bottom: 1rpx solid $dui-line;
	padding-bottom: 2rpx;
}

/* 按压反馈：出处 / 改这句按下变淡（下划线加深由朱/墨色天然承担） */
.src-hit {
	opacity: 0.55;
}

/* 单句按下：整句淡一下（like 把耳朵按下去） */
.ln-hover {
	opacity: 0.6;
}

/* ---------- 变暗：可疑处让对话「停住」时的状态 ----------
   同样**不用文字 opacity**（会叠穿 4.5:1），改由色阶表达退后：
   深度行统一 ink3（页面底 4.55 ✅）、当前行 ink2（5.85 ✅）仍最显眼。
   ⚠️ confirm 页未绑定 seek/source/edit，dim 下"出处 / 改这句"既不可点又低对比 → 直接隐藏。 */
.dim .done .sp, .dim .done .tx,
.dim .next .sp, .dim .next .tx {
	color: $dui-ink3;
}

.dim .now.a .tx, .dim .now.a .sp,
.dim .now.b .tx, .dim .now.b .sp {
	color: $dui-ink2;
}

.dim .now.a .now-bar,
.dim .now.b .now-bar {
	background-color: $dui-ink5;
}

.dim .rail-dot { background-color: $dui-ink5; }

.dim .src { display: none; }

/* ---------- 动效：一律包 reduced-motion ---------- */
@media (prefers-reduced-motion: no-preference) {
	/* 切换时的重排缓冲（不参与理解，减动效时直接跳位） */
	.ln {
		transition: opacity 300ms ease-out;
	}

	/* 进度点移动（减动效时直接跳位，更符合预期） */
	.rail-dot {
		transition: top 360ms ease-out;
	}

	/* 巧思 3 · 标记"正在说这一句"的朱点会轻微呼吸。
	   周期 2.4s —— 是呼吸，不是闪烁。 */
	.rail-dot {
		animation: dui-rail-breathe $dui-dur-slow ease-in-out infinite;
	}
}

@keyframes dui-rail-breathe {
	0%, 100% { transform: scale(1); }
	50%      { transform: scale(1.45); }
}
</style>
