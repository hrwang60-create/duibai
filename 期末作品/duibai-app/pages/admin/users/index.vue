<template>
	<view class="page">
		<view class="topbar">
			<text class="back" @tap="back">←</text>
			<text class="nav">用户管理</text>
			<text class="spacer"></text>
		</view>

		<view class="search">
			<input
				class="s-input"
				v-model="keyword"
				placeholder="搜昵称或 openid"
				placeholder-class="s-ph"
				confirm-type="search"
				@confirm="doSearch"
			/>
			<text class="s-btn" @tap="doSearch">搜索</text>
			<text v-if="keyword" class="s-clear" @tap="clearSearch">清除</text>
		</view>

		<view v-if="loading" class="center"><text class="t-hint">正在读用户…</text></view>

		<admin-table
			v-else
			title="用户"
			:rows="rows"
			primary="nickname"
			:meta-cols="metaCols"
			:actions="actions"
			@action="onAction"
		/>

		<text class="foot">共 {{ total }} 人{{ keyword ? '（搜索结果）' : '' }} · 封禁后该用户无法再发起生成</text>
	</view>
</template>

<script>
/**
 * 用户管理
 *
 * 权限校验**在云函数里**（`assertAdmin`）—— 前端隐藏入口只是体验，不是安全边界。
 */
import { admin } from '@/api/index.js'
import AdminTable from '@/components/AdminTable/AdminTable.vue'

export default {
	components: { AdminTable },
	data () {
		return {
			loading: true,
			keyword: '',
			rows: [],
			total: 0,
			metaCols: [
				{ key: 'openid', label: 'openid', type: 'text' },
				{ key: 'created_at', label: '注册', type: 'time' },
				{ key: 'role', label: '角色' },
				{ key: 'status', label: '状态', type: 'bool' }
			],
			actions: [
				{ key: 'setRole', label: '改角色' },
				{ key: 'setStatus', label: '封禁/解封', color: '#B83F28' }
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
				const d = await admin.users('list', { page: 1, size: 50 })
				this.rows = d.list || []
				this.total = d.total || 0
			} catch (e) {
				this.rows = []
				this.fail(e)
			} finally {
				this.loading = false
			}
		},
		async doSearch () {
			const kw = String(this.keyword || '').trim()
			if (!kw) { this.load(); return }
			this.loading = true
			try {
				const list = await admin.users('search', { keyword: kw })
				this.rows = list || []
				this.total = (list || []).length
			} catch (e) {
				this.rows = []
				this.fail(e)
			} finally {
				this.loading = false
			}
		},
		clearSearch () {
			this.keyword = ''
			this.load()
		},
		onAction ({ key, row }) {
			if (key === 'setRole') {
				const next = row.role === 'admin' ? 'user' : 'admin'
				uni.showModal({
					title: '修改角色',
					content: `把「${row.nickname || '该用户'}」改成 ${next === 'admin' ? '管理员' : '普通用户'}？`,
					success: (r) => { if (r.confirm) this.write('setRole', { uid: row._id, role: next }) }
				})
			} else if (key === 'setStatus') {
				const next = row.status === 1 ? 0 : 1
				uni.showModal({
					title: next === 0 ? '封禁用户' : '解除封禁',
					content: next === 0 ? '封禁后该用户无法再发起生成。' : '解除后该用户恢复正常使用。',
					confirmColor: next === 0 ? '#B83F28' : '#1A1A18',
					success: (r) => { if (r.confirm) this.write('setStatus', { uid: row._id, status: next }) }
				})
			}
		},
		async write (action, payload) {
			try {
				await admin.users(action, payload)
				uni.showToast({ title: '已更新', icon: 'success' })
				this.load()
			} catch (e) {
				this.fail(e)
			}
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

.search {
	display: flex;
	flex-direction: row;
	align-items: center;
	margin-bottom: $dui-s4;
}

.s-input {
	flex: 1;
	/* 输入框也撑到 88rpx，与全站触摸目标一致 */
	height: 88rpx;
	background-color: $dui-paper2;
	border-radius: $dui-radius-pill;
	padding: 0 $dui-s4;
	font-size: 26rpx;
	color: $dui-ink;
	box-sizing: border-box;
}

.s-ph { color: $dui-ink5; font-size: 26rpx; }

.s-btn {
	font-size: 25rpx;
	color: $dui-ink;
	margin-left: $dui-s3;
}

.s-clear {
	font-size: 25rpx;
	color: $dui-ink3;
	margin-left: $dui-s3;
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
