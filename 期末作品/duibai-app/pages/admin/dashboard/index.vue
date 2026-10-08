<template>
	<view class="page">
		<view class="topbar">
			<text class="back" @tap="back">←</text>
			<text class="nav">对白后台</text>
			<text class="spacer"></text>
		</view>

		<!-- 非管理员：提供一次性自助开通（仅当系统里还没有管理员时生效） -->
		<view v-if="needBootstrap" class="boot">
			<text class="boot-title">还没有管理员</text>
			<text class="boot-desc">这是第一次进后台。如果你就是这台服务的拥有者，可以把自己设为管理员 —— 之后这个入口会自动关闭。</text>
			<view class="btn" hover-class="btn-hover" @tap="doBootstrap">
				<text class="btn-text">把自己设为管理员</text>
			</view>
		</view>

		<template v-else>
			<view v-if="loading" class="center"><text class="t-hint">正在读取数据…</text></view>

			<template v-else>
				<view class="stats">
					<admin-stat-card label="用户总数" :value="stat.users || 0" />
					<admin-stat-card label="对谈场次" :value="stat.scripts || 0" />
				</view>
				<view class="stats" style="margin-top:32rpx">
					<admin-stat-card label="生成成功率" :value="stat.success_rate || 0" suffix="%" />
					<admin-stat-card label="平均耗时" :value="stat.avg_ms || 0" suffix="ms" />
				</view>

				<view class="sec">
					<text class="sec-title">管理</text>
					<section-row label="用户管理" :value="(stat.users || 0) + ' 人'" :first="true" @tap="go('users')" />
					<section-row label="Banner 管理" value="首页横幅" @tap="go('banners')" />
					<section-row label="口吻模板" value="决定生成质量" @tap="go('tones')" />
				</view>
			</template>
		</template>
	</view>
</template>

<script>
/**
 * 管理首页
 *
 * ⚠️ 做的是**加分项**，所以视觉从简，但功能要真能用：
 *    统计来自 `admin-users --action stat`（真实数库，不是写死的假数字）。
 */
import { admin } from '@/api/index.js'
import AdminStatCard from '@/components/AdminStatCard/AdminStatCard.vue'
import SectionRow from '@/components/SectionRow/SectionRow.vue'

export default {
	components: { AdminStatCard, SectionRow },
	data () {
		return { loading: true, stat: {}, needBootstrap: false }
	},
	onShow () {
		this.load()
	},
	methods: {
		back () {
			uni.navigateBack({ delta: 1 })
		},
		go (p) {
			uni.navigateTo({ url: `/pages/admin/${p}/index` })
		},
		async load () {
			this.loading = true
			try {
				this.stat = await admin.users('stat', {})
				this.needBootstrap = false
			} catch (e) {
				const code = e && e.error
				// 没有管理员权限 → 给出一次性自助开通入口
				this.needBootstrap = (code === 'FORBIDDEN')
				if (!this.needBootstrap) {
					console.warn('[admin] stat 失败：', code)
				}
			} finally {
				this.loading = false
			}
		},
		async doBootstrap () {
			try {
				await admin.users('bootstrap', {})
				uni.showToast({ title: '已设为管理员', icon: 'success' })
				// 本地用户信息里的 role 也要更新，否则「我的」页不显示入口
				const u = uni.getStorageSync('duibai_user')
				if (u) { u.role = 'admin'; uni.setStorageSync('duibai_user', u) }
				setTimeout(() => this.load(), 600)
			} catch (e) {
				uni.showModal({
					title: '开通失败',
					content: (e && (e.message || e.error)) || '请稍后重试',
					showCancel: false
				})
			}
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

.topbar {
	height: 88rpx;
	display: flex;
	flex-direction: row;
	align-items: center;
}

.back { font-size: 32rpx; color: $dui-ink2; width: 48rpx; }
.nav { flex: 1; font-size: 26rpx; color: $dui-ink2; text-align: center; }
.spacer { width: 48rpx; }

.stats {
	display: flex;
	flex-direction: row;
	padding-top: $dui-s3;
}

.sec {
	padding-top: $dui-s7;
}

.boot {
	padding-top: 160rpx;
}

.boot-title {
	display: block;
	font-size: 38rpx;
	font-weight: 500;
	color: $dui-ink;
	margin-bottom: $dui-s3;
}

.boot-desc {
	display: block;
	font-size: 26rpx;
	line-height: 1.7;
	color: $dui-ink2;
	margin-bottom: $dui-s6;
}

.btn {
	height: 96rpx;
	border-radius: $dui-radius-pill;
	background-color: $dui-ink;
	display: flex;
	align-items: center;
	justify-content: center;
}

.btn-hover { opacity: 0.88; }
.btn-text { font-size: 30rpx; font-weight: 500; color: $dui-on-ink; }

.center {
	padding: $dui-s8 0;
	display: flex;
	justify-content: center;
}
</style>
