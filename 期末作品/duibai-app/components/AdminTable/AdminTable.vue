<template>
	<view class="at">
		<view class="at-head">
			<text class="at-title">{{ title }}</text>
			<text class="at-count">{{ rows.length }} 条</text>
		</view>

		<view v-if="!rows.length" class="at-empty">
			<text class="at-empty-text">暂无数据</text>
		</view>

		<view v-for="(r, i) in rows" :key="r._id || i" class="at-row">
			<view class="at-main">
				<text class="at-primary">{{ r[primary] || '—' }}</text>
				<view class="at-meta">
					<text v-for="c in metaCols" :key="c.key" class="at-meta-item">
						{{ c.label }}：{{ format(r[c.key], c) }}
					</text>
				</view>
			</view>
			<view class="at-acts">
				<text
					v-for="a in actions"
					:key="a.key"
					class="at-act"
					:style="{ color: a.color || '#5A5750' }"
					@tap="$emit('action', { key: a.key, row: r })"
				>{{ a.label }}</text>
			</view>
		</view>
	</view>
</template>

<script>
/**
 * AdminTable 管理端表格
 *
 * ⚠️ 小程序里塞不下横向表格，所以做成**纵向行**：
 *   主字段当标题，其余字段合并成一行小字，操作放右侧。
 *   这样在手机上也能看清，不用左右拖。
 */
export default {
	name: 'AdminTable',
	emits: ['action'],
	props: {
		title: { type: String, default: '' },
		rows: { type: Array, default: () => [] },
		/** 哪一列当主标题 */
		primary: { type: String, default: 'title' },
		/** 其余列 */
		metaCols: { type: Array, default: () => [] },
		/** 右侧操作 */
		actions: { type: Array, default: () => [] }
	},
	methods: {
		format (v, col) {
			if (v === undefined || v === null || v === '') return '—'
			if (col.type === 'bool') return v ? '开启' : '关闭'
			if (col.type === 'time' && typeof v === 'number') {
				const d = new Date(v)
				const p = n => (n < 10 ? '0' + n : '' + n)
				return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
			}
			if (col.type === 'text') {
				const s = String(v)
				return s.length > 18 ? s.slice(0, 18) + '…' : s
			}
			return String(v)
		}
	}
}
</script>

<style lang="scss" scoped>
.at {
	padding-top: $dui-s2;
}

.at-head {
	display: flex;
	flex-direction: row;
	align-items: baseline;
	justify-content: space-between;
	margin-bottom: $dui-s3;
}

.at-title {
	font-size: $dui-fs-label;
	font-weight: 700;
	letter-spacing: 3rpx;
	color: $dui-ink3;
}

.at-count {
	font-size: 21rpx;
	color: $dui-ink5;
}

.at-empty {
	padding: $dui-s6 0;
	display: flex;
	justify-content: center;
}

.at-empty-text {
	font-size: 24rpx;
	color: $dui-ink5;
}

.at-row {
	display: flex;
	flex-direction: row;
	align-items: center;
	padding: $dui-s3 0;
	border-top: 1rpx solid $dui-line;
}

.at-main {
	flex: 1;
	min-width: 0;
}

.at-primary {
	display: block;
	font-size: 28rpx;
	color: $dui-ink;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	margin-bottom: 6rpx;
}

.at-meta {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
}

.at-meta-item {
	font-size: 21rpx;
	color: $dui-ink3;
	margin-right: $dui-s3;
}

.at-acts {
	display: flex;
	flex-direction: row;
	flex-shrink: 0;
	margin-left: $dui-s2;
}

.at-act {
	font-size: 23rpx;
	margin-left: $dui-s3;
}
</style>
