<template>
	<view class="page">
		<view class="topbar">
			<text class="back" @tap="back">←</text>
			<text class="nav">Banner 管理</text>
			<text class="spacer"></text>
		</view>

		<view class="add" hover-class="add-hover" @tap="addBanner">
			<text class="add-text">＋ 新增 Banner</text>
		</view>

		<view v-if="loading" class="center"><text class="t-hint">正在读 Banner…</text></view>

		<admin-table
			v-else
			title="首页横幅"
			:rows="rows"
			primary="title"
			:meta-cols="metaCols"
			:actions="actions"
			@action="onAction"
		/>

		<text class="foot">老师点名要求的功能。改完 C 端首页会立刻生效 —— 因为首页读的就是这张表。</text>
	</view>
</template>

<script>
/**
 * Banner 管理（老师点名要求的功能）
 *
 * 这个页面的价值在于**闭环**：在这里改完，C 端首页立刻变了。
 */
import { admin } from '@/api/index.js'
import AdminTable from '@/components/AdminTable/AdminTable.vue'

export default {
	components: { AdminTable },
	data () {
		return {
			loading: true,
			rows: [],
			metaCols: [
				{ key: 'sort', label: '排序' },
				{ key: 'enabled', label: '状态', type: 'bool' }
			],
			actions: [
				{ key: 'edit', label: '改标题' },
				{ key: 'toggle', label: '上下架' },
				{ key: 'remove', label: '删除', color: '#B83F28' }
			]
		}
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
				const d = await admin.banners('list', {})
				this.rows = (d && (d.list || d)) || []
			} catch (e) {
				this.rows = []
				this.fail(e)
			} finally {
				this.loading = false
			}
		},
		addBanner () {
			uni.showModal({
				title: '新增 Banner',
				editable: true,
				placeholderText: '写一句横幅文案，例如「通勤路上，用耳朵读完一篇」',
				success: async (r) => {
					if (!r.confirm) return
					const title = String(r.content || '').trim()
					if (!title) {
						uni.showToast({ title: '文案不能为空', icon: 'none' })
						return
					}
					try {
						await admin.banners('add', {
							title,
							image: '',
							link: '',
							sort: this.rows.length + 1,
							enabled: true
						})
						uni.showToast({ title: '已新增', icon: 'success' })
						this.load()
					} catch (e) { this.fail(e) }
				}
			})
		},
		onAction ({ key, row }) {
			if (key === 'edit') {
				uni.showModal({
					title: '改标题',
					editable: true,
					placeholderText: row.title || '',
					success: async (r) => {
						if (!r.confirm) return
						const title = String(r.content || '').trim()
						if (!title) return
						await this.write('update', { _id: row._id, title })
					}
				})
			} else if (key === 'toggle') {
				this.write('toggle', { _id: row._id, enabled: !row.enabled })
			} else if (key === 'remove') {
				uni.showModal({
					title: '删除这条 Banner？',
					content: '删掉之后 C 端首页就不再显示它。',
					confirmText: '删除',
					confirmColor: '#B83F28',
					success: (r) => { if (r.confirm) this.write('remove', { _id: row._id }) }
				})
			}
		},
		async write (action, payload) {
			try {
				await admin.banners(action, payload)
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

.add {
	height: 88rpx;
	border-radius: $dui-radius-pill;
	border: 1rpx dashed $dui-line;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-bottom: $dui-s4;
}

.add-hover { background-color: $dui-paper2; }
.add-text { font-size: 27rpx; color: $dui-ink2; }

.foot {
	display: block;
	font-size: 21rpx;
	color: $dui-ink5;
	margin-top: $dui-s5;
	line-height: 1.6;
}

.center { padding: $dui-s8 0; display: flex; justify-content: center; }
</style>
