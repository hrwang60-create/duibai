<template>
	<view class="uc">
		<textarea
			class="input"
			v-model="text"
			:maxlength="max"
			placeholder="粘贴文章内容…"
			placeholder-class="ph"
			auto-height
			:show-confirm-bar="false"
		/>

		<view class="tools">
			<view class="tool press" hover-class="tool-hover" @tap="pickFile">
				<text class="tool-text">选择文件</text>
			</view>
			<view class="tool press" hover-class="tool-hover" @tap="pickFile">
				<text class="tool-text">从聊天选</text>
			</view>
			<view v-if="text" class="tool press" hover-class="tool-hover" @tap="clear">
				<text class="tool-text vm">清空</text>
			</view>
		</view>

		<view class="meta">
			<text class="count" :class="{ over: over }">{{ count }} 字</text>
			<text class="dot">·</text>
			<text class="est">{{ estimateText }}</text>
			<text v-if="over" class="over-tip">超出 {{ max }} 字上限</text>
		</view>
	</view>
</template>

<script>
/**
 * UploadCard 文章输入
 *
 * 设计：**不做成大卡片**（那是"普通小程序"的样子）。
 *      就是一块安静的输入区 + 两个小胶囊 + 一行字数反馈。
 *
 * 小程序里读本地文件不自由，所以给两条路：
 *   ① 直接粘贴文本（最通用）
 *   ② 从微信聊天里选文件（uni.chooseMessageFile，仅微信小程序）
 */
const SAMPLE = `光合作用分为光反应和暗反应两个阶段。

光反应在类囊体薄膜上进行，需要光直接参与，产物是 ATP 和 NADPH。

暗反应在叶绿体基质中进行，不需要光直接参与，但要用掉光反应产出的 ATP 和 NADPH。

中午光照最强时，气孔关闭导致二氧化碳供应不足，光合作用反而下降，这叫"光合午休"。`

export default {
	name: 'UploadCard',
	emits: ['change', 'update:modelValue'],
	props: {
		modelValue: { type: String, default: '' },
		max: { type: Number, default: 3000 }
	},
	data () {
		return { text: this.modelValue }
	},
	computed: {
		count () {
			return this.text ? this.text.length : 0
		},
		over () {
			return this.count > this.max
		},
		/**
		 * 时长估算：对白比原文略长（口语化会展开），按每分钟约 260 字估算。
		 * 这是粗略启发式，所以文案写「预计约」，不给精确数字。
		 */
		estimateText () {
			if (!this.count) return '支持 Markdown / txt'
			const min = Math.max(1, Math.round(this.count / 260 * 1.3))
			return '预计约 ' + min + ' 分钟'
		}
	},
	watch: {
		text (v) {
			this.$emit('update:modelValue', v)
			this.$emit('change', v)
		},
		modelValue (v) {
			if (v !== this.text) this.text = v
		}
	},
	methods: {
		clear () {
			this.text = ''
		},
		fillSample () {
			this.text = SAMPLE
		},
		pickFile () {
			// #ifdef MP-WEIXIN
			uni.chooseMessageFile({
				count: 1,
				type: 'file',
				extension: ['md', 'txt', 'markdown'],
				success: (res) => {
					const f = res.tempFiles && res.tempFiles[0]
					if (!f) return
					if (f.size > 2 * 1024 * 1024) {
						uni.showToast({ title: '文件超过 2MB', icon: 'none' })
						return
					}
					uni.getFileSystemManager().readFile({
						filePath: f.path,
						encoding: 'utf-8',
						success: (r) => { this.text = String(r.data || '').slice(0, this.max) },
						fail: () => uni.showToast({ title: '读取失败，请改用粘贴', icon: 'none' })
					})
				},
				fail: () => { /* 用户取消 */ }
			})
			// #endif

			// #ifndef MP-WEIXIN
			uni.showToast({ title: '当前端请直接粘贴文本', icon: 'none' })
			// #endif
		}
	}
}
</script>

<style lang="scss" scoped>
.uc {
	padding-top: $dui-s2;
}

.input {
	width: 100%;
	min-height: 260rpx;
	background-color: $dui-paper2;
	border-radius: $dui-radius;
	padding: $dui-s3;
	font-size: 28rpx;
	line-height: 1.7;
	color: $dui-ink;
	box-sizing: border-box;
}

/* 占位文字承载"该做什么"的引导（功能信息，不是装饰）→ 必须过对比度。
   底是卡片 $dui-paper2(#F5F2EA)，ink4 = 4.51 ✅；ink5(1.60) 几乎看不见，不许用。 */
.ph {
	color: $dui-ink4;
	font-size: 28rpx;
}

.tools {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	margin-top: $dui-s3;
}

/* 工具胶囊：透明底（落在页面底）→ 按压用 .press（纸底类）。
   触控目标 @1.2.1 要求 ≥88rpx（原 68rpx 偏小）。 */
.tool {
	padding: 0 $dui-s3;
	height: 88rpx;
	border-radius: $dui-radius-pill;
	border: 1rpx solid $dui-line;
	display: flex;
	align-items: center;
	margin-right: $dui-s2;
	margin-bottom: $dui-s1;
}

.tool-hover {
	background-color: $dui-paper2;
}

.tool-text {
	font-size: 25rpx;
	color: $dui-ink2;
}

.vm {
	color: $dui-vm;
}

.meta {
	display: flex;
	flex-direction: row;
	align-items: center;
	margin-top: $dui-s2;
}

.count {
	font-size: 23rpx;
	color: $dui-ink3;
}

.over {
	color: $dui-vm;
}

/* ★ 判据（"画出来的" vs "打出来的"）：
   · 用字符渲染的（· / — / / 当分隔用）→ 它是【文字】，承担字段边界语义，必须过对比度，ink5 不许用；
   · 用 CSS 画的（<view> 的 1rpx 线、背景色块）→ 才是【装饰】，ink5 才合法。
   分隔符「·」在 meta 行分隔"播客对谈 / 23 句 / 01:48"，看不见则字段边界丢失 → 用 ink4(卡片底 4.51 ✅)。
   想让分隔"更轻"：换形态（CSS 画个小点），而不是降对比度 —— "轻"靠形态，不靠透明度。 */
.dot {
	font-size: 23rpx;
	color: $dui-ink4;
	margin: 0 10rpx;
}

.est {
	font-size: 23rpx;
	color: $dui-ink3;
}

.over-tip {
	font-size: 23rpx;
	color: $dui-vm;
	margin-left: auto;
}
</style>
