<template>
	<view class="page">
		<view class="topbar">
			<text class="back" @tap="back">←</text>
			<text class="nav">口吻模板</text>
			<text class="spacer"></text>
		</view>

		<text class="lead">这 6 个口吻的提示词直接决定生成质量。改完不用重启，下一次生成就生效。</text>

		<view v-if="loading" class="center"><text class="t-hint">正在读口吻…</text></view>

		<view v-else class="list">
			<view v-for="t in rows" :key="t._id" class="row">
				<view class="row-main">
					<text class="row-title">{{ t.name }}</text>
					<text class="row-code">{{ t.code }} · 排序 {{ t.sort }} · {{ t.enabled ? '开启' : '关闭' }}</text>
					<text class="row-sample">{{ t.sample || '（还没有示例）' }}</text>
				</view>
				<view class="row-acts">
					<text class="act" @tap="editPrompt(t)">改提示词</text>
					<text class="act" @tap="toggle(t)">{{ t.enabled ? '关闭' : '开启' }}</text>
				</view>
			</view>
		</view>

		<text class="foot">提示词写的是「怎么说话」，不是「说什么」—— 具体内容由文章决定。</text>
	</view>
</template>

<script>
/**
 * 口吻模板管理
 *
 * 为什么这个页面有价值：`prompt_template` 直接决定生成质量。
 * 改这里比改代码快得多，也是「管理端」最实用的一个功能。
 */
import { admin } from '@/api/index.js'

export default {
	data () {
		return { loading: true, rows: [] }
	},
	onLoad () {
		this.load()
	},
	methods: {
		back () {
			uni.navigateBack({ delta: 1 })
		},
		async load () {
			this.loading = true
			try {
				const d = await admin.tones('list', {})
				this.rows = (d && (d.list || d)) || []
			} catch (e) {
				this.rows = []
				this.fail(e)
			} finally {
				this.loading = false
			}
		},
		editPrompt (t) {
			uni.showModal({
				title: '改「' + t.name + '」的提示词',
				editable: true,
				placeholderText: '例如：两个人互相挑毛病，但都在讲事实',
				success: async (r) => {
					if (!r.confirm) return
					const prompt_template = String(r.content || '').trim()
					if (!prompt_template) return
					try {
						await admin.tones('update', { _id: t._id, prompt_template })
						uni.showToast({ title: '已更新', icon: 'success' })
						this.load()
					} catch (e2) { this.fail(e2) }
				}
			})
		},
		async toggle (t) {
			try {
				await admin.tones('toggle', { _id: t._id, enabled: !t.enabled })
				uni.showToast({ title: '已更新', icon: 'success' })
				this.load()
			} catch (e) { this.fail(e) }
		},
		fail (e) {
			uni.showModal({
				title: '操作失败',
				content: (e && (e.message || e.error)) || '请稍后重试',
				showCancel: false
			})
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	padding: 0 $dui-s5 $dui-s8;
	box-sizing: border-box;
}

.topbar { height: 88rpx; display: flex; flex-direction: row; align-items: center; }
.back { font-size: 32rpx; color: $dui-ink2; width: 48rpx; }
.nav { flex: 1; font-size: 26rpx; color: $dui-ink2; text-align: center; }
.spacer { width: 48rpx; }

.lead {
	display: block;
	font-size: 24rpx;
	line-height: 1.7;
	color: $dui-ink2;
	margin-bottom: $dui-s4;
}

.row {
	display: flex;
	flex-direction: row;
	align-items: center;
	padding: $dui-s4 0;
	border-top: 1rpx solid $dui-line;
}

.row-main { flex: 1; min-width: 0; }

.row-title {
	display: block;
	font-size: 30rpx;
	font-weight: 500;
	color: $dui-ink;
	margin-bottom: 6rpx;
}

.row-code {
	display: block;
	font-size: 21rpx;
	color: $dui-ink3;
	margin-bottom: 6rpx;
}

.row-sample {
	display: block;
	font-size: 23rpx;
	color: $dui-ink3;
	line-height: 1.5;
}

.row-acts {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	flex-shrink: 0;
	margin-left: $dui-s3;
}

.act {
	font-size: 23rpx;
	color: $dui-ink2;
	margin-bottom: $dui-s2;
}

.foot {
	display: block;
	font-size: 21rpx;
	color: $dui-ink5;
	margin-top: $dui-s5;
	line-height: 1.6;
}

.center { padding: $dui-s8 0; display: flex; justify-content: center; }
</style>
