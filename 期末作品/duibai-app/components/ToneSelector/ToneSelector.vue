<template>
	<view class="ts">
		<text class="sec-title">选择对谈口吻</text>

		<view class="grid">
			<view
				v-for="t in list"
				:key="t.code"
				class="chip"
				:class="{ active: t.code === current }"
				hover-class="chip-hover"
				@tap="pick(t)"
			>
				<text class="chip-text" :class="{ 'chip-text-active': t.code === current }">{{ t.name }}</text>
			</view>
		</view>

		<!-- ★ 选中即预览：不用等生成，就能看到这个口吻听起来是什么样 -->
		<view v-if="preview.tx" class="preview">
			<text class="pv-label">听起来是这样</text>
			<view class="pv-line">
				<text v-if="preview.sp" class="pv-sp">{{ preview.sp }}</text>
				<text class="pv-tx">{{ preview.tx }}</text>
			</view>
		</view>
	</view>
</template>

<script>
/**
 * ToneSelector 口吻选择
 *
 * 数据来自云数据库 tones 表（客户端可读）；读不到时用内置 6 种兜底。
 * ★ 关键设计：选中口吻后**立刻显示该口吻的示例**，用户不用等生成就能感知差别。
 */
import { TONE_FALLBACK } from '@/utils/format.js'
import { tone as toneApi } from '@/api/index.js'

export default {
	name: 'ToneSelector',
	emits: ['change'],
	props: {
		modelValue: { type: String, default: '' }
	},
	data () {
		return { list: [], current: this.modelValue }
	},
	computed: {
		selected () {
			return this.list.find(t => t.code === this.current) || null
		},
		preview () {
			const t = this.selected
			if (!t) return { sp: '', tx: '' }
			const s = String(t.sample || t.description || '')
			const i = s.indexOf('：')
			if (i > 0 && i < 6) return { sp: s.slice(0, i), tx: s.slice(i + 1) }
			return { sp: '', tx: s }
		}
	},
	created () {
		this.load()
	},
	methods: {
		async load () {
			let rows = []
			try {
				// 走云函数：客户端直读 tones 实测会静默返回空
				rows = (await toneApi.list()) || []
			} catch (e) {
				console.warn('[ToneSelector] 读取口吻失败，使用内置兜底：', e && (e.message || e.error))
			}
			this.list = rows.length ? rows : TONE_FALLBACK
			if (!this.current && this.list.length) {
				// ★ 优先用用户上次选的口吻（首页的时段场景行会写这个键），
				//   读不到才退回第一个 —— 否则"设了偏好却没生效"，等于没做。
				let saved = ''
				try { saved = uni.getStorageSync('duibai_default_tone') || '' } catch (e) { /* 读不到就算了 */ }
				const hit = saved && this.list.find(x => x.code === saved)
				this.current = hit ? hit.code : this.list[0].code
				this.$emit('update:modelValue', this.current)
				this.$emit('change', this.current)
			}
		},
		pick (t) {
			this.current = t.code
			this.$emit('update:modelValue', t.code)
			this.$emit('change', t.code)
		}
	}
}
</script>

<style lang="scss" scoped>
.ts {
	padding: $dui-s5 0 0;
}

.grid {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
}

.chip {
	/* 触摸目标 ≥88rpx(44pt)：口吻 chip 是可点容器，76rpx(38pt) 不达标 */
	padding: 0 $dui-s4;
	height: 88rpx;
	border-radius: $dui-radius-pill;
	background-color: transparent;
	border: 1rpx solid $dui-line;
	display: flex;
	align-items: center;
	margin-right: $dui-s2;
	margin-bottom: $dui-s2;
}

.chip-hover {
	background-color: $dui-paper2;
}

/* 选中 = 墨底白字（不是浅底描边，更克制也更明确） */
.active {
	background-color: $dui-ink;
	border-color: $dui-ink;
}

.chip-text {
	font-size: 27rpx;
	color: $dui-ink2;
}

.chip-text-active {
	color: $dui-on-ink;
	font-weight: 500;
}

.preview {
	margin-top: $dui-s3;
	padding-top: $dui-s3;
	border-top: 1rpx solid $dui-line;
}

.pv-label {
	font-size: $dui-fs-label;
	color: $dui-ink3;
	letter-spacing: 2rpx;
	display: block;
	margin-bottom: $dui-s2;
}

.pv-line {
	display: flex;
	flex-direction: row;
	align-items: flex-start;
}

.pv-sp {
	font-size: 26rpx;
	font-weight: 600;
	color: $dui-vm;
	margin-right: $dui-s2;
	flex-shrink: 0;
}

.pv-tx {
	font-size: 28rpx;
	line-height: 1.6;
	color: $dui-ink;
	flex: 1;
}
</style>
