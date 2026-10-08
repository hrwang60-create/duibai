<template>
	<view class="page">
		<!-- ========== 生成中 ========== -->
		<view v-if="state === 'running'" class="stage" aria-live="polite">
			<progress-ring :size="240" :stroke="10" :text="elapsed + 's'" />

			<text class="headline">正在把它聊开…</text>
			<text class="sub">两个人正在逐段读过去，把它聊成一场对白</text>

			<view v-if="elapsed >= 45" class="warn">
				<text class="warn-text">比平时慢一些，可能正在排队，请再等一会儿</text>
			</view>

			<!-- 对话预演：让用户不干等，同时强化"在形成一场对话"的认知 -->
			<view class="rehearsal">
				<text class="re-label">正在形成</text>
				<view class="rl"><text class="rl-sp">甲</text><text class="rl-tx">所以你的意思是……</text></view>
				<view class="rl b"><text class="rl-sp">乙</text><text class="rl-tx">简单来说，就是……</text></view>
				<view class="rl dim"><text class="rl-sp">甲</text><text class="rl-tx">等等，这里是不是……</text></view>
			</view>

			<view class="cancel" hover-class="cancel-hover" @tap="cancel">
				<text class="cancel-text">取消</text>
			</view>
		</view>

		<!-- ========== 失败 ========== -->
		<view v-else-if="state === 'error'" class="stage" aria-live="polite">
			<view class="err-badge">
				<text class="err-glyph">{{ errGlyph }}</text>
			</view>
			<text class="headline">{{ errTitle }}</text>
			<text class="sub">{{ errMsg }}</text>

			<view class="actions">
				<view v-if="errLogin" class="btn" hover-class="btn-hover" @tap="goLogin">
					<text class="btn-text">去登录</text>
				</view>
				<view v-else-if="canRetry" class="btn" hover-class="btn-hover" @tap="retry">
					<text class="btn-text">重试</text>
				</view>
				<view class="btn btn-ghost" hover-class="ghost-hover" @tap="goHome">
					<text class="ghost-text">返回首页</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
/**
 * 生成中页
 *
 * 进来立刻调 generate-dialogue → 成功后 redirectTo 确认页或结果页。
 *
 * ⚠️ 诚实设计：这是一次**单次黑盒请求**，拿不到真实阶段与百分比。
 *    所以这里只显示「已用时间 + 活动指示器 + 对话预演」，**不编造假的进度百分比**。
 *    要真实阶段需把长任务拆成可轮询的多阶段（后端改造，见执行计划 B3 备注）。
 *
 * ⚠️ 失败态：`UNAUTHORIZED`（登录已过期）时不给「重试」（重试也没用），
 *    改给「去登录」主按钮（体验规范 §3.4）。
 * ⚠️ 开发期提示（DEEPSEEK_API_KEY 等）只在非生产环境出现（§5 上线前清单）。
 */
import { script } from '@/api/index.js'
import ProgressRing from '@/components/ProgressRing/ProgressRing.vue'

export default {
	components: { ProgressRing },
	data () {
		return {
			state: 'running', // running | error
			elapsed: 0,
			articleId: '',
			toneCode: '',
			errTitle: '生成失败',
			errMsg: '',
			errGlyph: '!',
			canRetry: true,
			errLogin: false
		}
	},
	onLoad (options) {
		this.articleId = (options && options.article_id) || ''
		this.toneCode = (options && options.tone_code) || 'teacher_student'
		this.startTimer()
		this.run()
	},
	onUnload () {
		this.stopTimer()
	},
	methods: {
		startTimer () {
			this.stopTimer()
			this.timer = setInterval(() => { this.elapsed += 1 }, 1000)
		},
		stopTimer () {
			if (this.timer) { clearInterval(this.timer); this.timer = null }
		},
		async run () {
			this.state = 'running'
			this.elapsed = 0
			if (!this.articleId) {
				this.failWith('PARAM_INVALID', '缺少文章信息')
				return
			}
			try {
				const d = await script.generate(this.articleId, this.toneCode)
				this.stopTimer()
				const url = d.pending_confirm > 0
					? `/pages/confirm/confirm?script_id=${d.script_id}`
					: `/pages/result/result?script_id=${d.script_id}`
				uni.redirectTo({ url })
			} catch (e) {
				this.stopTimer()
				this.failWith((e && e.error) || 'UNKNOWN', (e && (e.message || e.reason)) || '请稍后重试')
			}
		},
		failWith (code, msg) {
			const map = {
				NOT_SUITABLE_FOR_AUDIO: { title: '这篇文章暂时聊不起来', glyph: '形', retry: false },
				UNAUTHORIZED: { title: '登录已过期', glyph: '权', retry: false, login: true },
				FORBIDDEN: { title: '没有权限', glyph: '权', retry: false },
				INTERNAL_ERROR: { title: '服务端未配置完成', glyph: '配', retry: true },
				BACKEND_UNAVAILABLE: { title: '服务暂时不可用', glyph: '忙', retry: true }
			}
			const m = map[code] || { title: '生成失败', glyph: '!', retry: true }
			this.errTitle = m.title
			this.errGlyph = m.glyph
			this.canRetry = m.retry
			this.errLogin = !!m.login
			// 开发期提示（环境变量等）只在非生产环境出现，上线前不外泄
			const devHint = process.env.NODE_ENV !== 'production'
				? '（若提示未配置 DEEPSEEK_API_KEY，请在 uniCloud 控制台给 generate-dialogue 配好环境变量）'
				: ''
			this.errMsg = code === 'INTERNAL_ERROR' ? msg + devHint : msg
			this.state = 'error'
		},
		retry () {
			this.startTimer()
			this.run()
		},
		cancel () {
			this.stopTimer()
			uni.switchTab({ url: '/pages/index/index' })
		},
		goHome () {
			uni.switchTab({ url: '/pages/index/index' })
		},
		goLogin () {
			uni.navigateTo({ url: '/pages/login/login' })
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	padding: 0 $dui-s5;
	box-sizing: border-box;
}

.stage {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding-top: 160rpx;
}

.headline {
	font-family: $dui-font-serif;
	font-size: $dui-fs-h2;
	font-weight: $dui-fw-semi;
	line-height: $dui-lh-h2;
	letter-spacing: $dui-ls-h2;
	color: $dui-ink;
	margin-top: $dui-s5;
	text-align: center;
}

.sub {
	font-size: $dui-fs-caption;
	color: $dui-ink3;
	line-height: $dui-lh-caption;
	text-align: center;
	margin-top: $dui-s2;
}

.warn {
	margin-top: $dui-s4;
	padding: $dui-s2 $dui-s3;
	background-color: $dui-vm-soft;
	border-radius: $dui-r-card;
}

.warn-text {
	font-size: $dui-fs-caption;
	color: $dui-vm;
}

/* 对话预演 */
.rehearsal {
	width: 100%;
	margin-top: $dui-s6;
	padding-top: $dui-s4;
	border-top: 1rpx solid $dui-line;
}

.re-label {
	display: block;
	font-family: $dui-font-serif;
	font-size: $dui-fs-label;
	letter-spacing: $dui-ls-label;
	color: $dui-ink3;
	margin-bottom: $dui-s3;
}

.rl {
	display: flex;
	flex-direction: row;
	align-items: flex-start;
	margin-bottom: $dui-s2;
}

/* 预演台词是"还没定型"的内容，退到 ink4；
   ⚠️ 不用 ink5 —— 它只做装饰线，不承载文字。 */
.rl-sp {
	font-size: $dui-fs-caption;
	font-weight: $dui-fw-semi;
	width: 32rpx;
	flex-shrink: 0;
	line-height: 1.6;
	color: $dui-ink4;
}

.rl.b .rl-sp {
	color: $dui-vm;
}

.rl-tx {
	font-size: $dui-fs-body;
	line-height: $dui-lh-body;
	color: $dui-ink4;
	flex: 1;
}

.rl.dim .rl-tx {
	opacity: 0.72;
}

/* 取消：热区 88rpx（此前 76rpx） */
.cancel {
	margin-top: $dui-s6;
	padding: 0 $dui-s5;
	height: 88rpx;
	border-radius: $dui-r-pill;
	display: flex;
	align-items: center;
	justify-content: center;
}

.cancel-hover {
	background-color: $dui-press;
}

.cancel-text {
	font-size: $dui-fs-body;
	color: $dui-ink3;
}

/* 失败态 */
.err-badge {
	width: 132rpx;
	height: 132rpx;
	border-radius: $dui-r-pill;
	background-color: $dui-vm-soft;
	display: flex;
	align-items: center;
	justify-content: center;
}

.err-glyph {
	font-size: 52rpx;
	font-weight: $dui-fw-medium;
	color: $dui-vm;
}

.actions {
	margin-top: $dui-s7;
	width: 100%;
}

.btn {
	height: 96rpx;
	border-radius: $dui-r-pill;
	background-color: $dui-ink;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-bottom: $dui-s2;
}

.btn-ghost {
	background-color: transparent;
	border: 1rpx solid $dui-line;
}

.btn-hover {
	opacity: 0.88;
}

.ghost-hover {
	background-color: $dui-press;
}

.btn-text {
	font-size: $dui-fs-bodyL;
	font-weight: $dui-fw-medium;
	color: $dui-on-ink;
}

.ghost-text {
	font-size: $dui-fs-body;
	color: $dui-ink2;
}
</style>
