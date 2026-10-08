<template>
	<view class="page">
		<view class="hero">
			<text class="logo">对白</text>
			<text class="slogan">把文章，聊给你听。</text>
		</view>

		<view class="actions">
			<view
				v-if="canWeixin"
				class="btn press-ink"
				:class="{ disabled: busy }"
				:hover-class="busy ? 'none' : 'btn-hover'"
				aria-label="微信一键登录"
				@tap="loginByWeixin"
			>
				<text class="btn-text">{{ busy ? '登录中…' : '微信一键登录' }}</text>
			</view>

			<view class="btn btn-ghost press" hover-class="ghost-hover" aria-label="先随便看看" @tap="useTrial">
				<text class="ghost-text">先随便看看</text>
			</view>

			<text class="note">登录后你的对谈会自动保存。</text>

			<!-- 隐私说明：视觉小字，但热区撑到 88rpx。点开是「简要说明」，非完整法律文本 -->
			<view class="privacy tap-88" hover-class="privacy-hover" aria-label="查看隐私简要说明" @tap="showPrivacy">
				<text class="privacy-text">登录即表示同意《用户协议》与《隐私政策》</text>
			</view>
		</view>
	</view>
</template>

<script>
/**
 * 登录页
 *
 * 设计原则：**越简单越好**。只做一件事 —— 微信授权。
 * 不做账号密码注册，不塞任何多余入口。
 * 非微信端保底留一个「先随便看看」出口，不让用户卡死在这一页。
 *
 * ⚠️ 上线前处理：原先失败弹窗写死了 WX_SECRET 开发配置说明（面向开发者）。
 *    现在改为通用文案「登录没成功，请重试」；开发期提示只在非生产环境出现。
 */
import { auth } from '@/api/index.js'

export default {
	data () {
		return { busy: false }
	},
	computed: {
		canWeixin () {
			// #ifdef MP-WEIXIN
			return true
			// #endif
			// #ifndef MP-WEIXIN
			return false
			// #endif
		}
	},
	methods: {
		async loginByWeixin () {
			if (this.busy) return
			this.busy = true
			uni.showLoading({ title: '登录中…', mask: true })
			try {
				await auth.login()
				uni.hideLoading()
				uni.showToast({ title: '登录成功', icon: 'success' })
				setTimeout(() => uni.navigateBack({ delta: 1 }), 700)
			} catch (e) {
				uni.hideLoading()
				// 对用户只给通用文案；开发期额外把**真实错误**显示出来 ——
				// 之前这段只提示"去配 WX_SECRET"，但真实原因可能是 uni.login 失败、
				// 云函数没调到、网络不通… 不显示真���就永远只能猜。
				const content = '登录没成功，请重试。'
				uni.showModal({
					title: '登录失败',
					content,
					showCancel: false
				})
			} finally {
				this.busy = false
			}
		},
		useTrial () {
			uni.navigateBack({ delta: 1 })
		},
		showPrivacy () {
			uni.showModal({
				title: '隐私简要说明',
				content: '这是简要说明，不是完整的法律文本。\n\n'
					+ '「对白」只用你的微信昵称和头像来标识账号，不会读取或上传其它信息；'
					+ '你的文章与对谈只和你自己的账号关联。\n\n'
					+ '正式的《用户协议》与《隐私政策》会在上线时补齐。',
				showCancel: false,
				confirmText: '知道了'
			})
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

.hero {
	padding-top: 220rpx;
	padding-bottom: $dui-s7;
}

.logo {
	display: block;
	font-family: $dui-font-serif;
	font-size: $dui-fs-title;
	font-weight: $dui-fw-semi;
	letter-spacing: 12rpx;
	color: $dui-ink;
	margin-bottom: $dui-s3;
}

.slogan {
	display: block;
	font-size: $dui-fs-bodyL;
	color: $dui-ink2;
	letter-spacing: 1rpx;
}

.actions {
	padding-top: $dui-s3;
}

/* 主/次按钮样式由全局 .btn / .btn-ghost 提供，这里只补行距 */
.btn {
	margin-bottom: $dui-s2;
}

.btn-hover {
	opacity: 0.88;
}

.ghost-hover {
	background-color: $dui-press;
}

.btn-text {
	font-size: 30rpx;
	font-weight: $dui-fw-medium;
	color: $dui-on-ink;
	letter-spacing: 1rpx;
}

.ghost-text {
	font-size: 28rpx;
	color: $dui-ink;
}

.note {
	display: block;
	font-size: $dui-fs-num;
	color: $dui-ink3;
	text-align: center;
	margin-top: $dui-s4;
	line-height: 1.6;
}

.privacy {
	display: flex;
	align-items: center;
	justify-content: center;
	margin-top: $dui-s1;
	padding: 0 $dui-s3;
}

.privacy-hover {
	opacity: 0.6;
}

.privacy-text {
	font-size: $dui-fs-label;
	color: $dui-ink3;
	text-align: center;
	line-height: 1.5;
}
</style>
