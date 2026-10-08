<script>
export default {
	onLaunch: function () {
		console.log('[对白] App Launch')
	},
	onShow: function () {
		console.log('[对白] App Show')
	},
	onHide: function () {
		console.log('[对白] App Hide')
	}
}
</script>

<style lang="scss">
/**
 * 全局样式 —— 纸与墨
 *
 * 三条基本规则（改任何页面都别破坏它们）：
 *   1. 纸阶只有两层：页面 $dui-page → 卡片/主功能 $dui-card
 *   2. 分区靠「卡片的边界」与「标签行」，不靠画满屏的分隔线
 *   3. 朱色只出现在小面积、高信息密度处（批注色，不铺大块）
 */

page {
	background-color: $dui-page;
	color: $dui-ink;
	font-family: $dui-font-sans;
	font-size: $dui-fs-body;
	line-height: $dui-lh-body;
	-webkit-font-smoothing: antialiased;
	/* 文字无障碍基线：不允许 iOS 旋转屏幕时自动放大字号，
	   否则正文会脱离设计稿的 27rpx 阶梯、破坏栅格。 */
	-webkit-text-size-adjust: 100%;
}

/* ============================================================
   容器 —— 左右安全边距 20pt（全站统一，这是所有页面的左轴）
   ============================================================ */
.page {
	min-height: 100vh;
	padding: 0 $dui-s5;
	box-sizing: border-box;
}

/* tab 页内容底部要留出 tabBar 的高度 */
.tab-space {
	height: 104rpx;
}

/* ============================================================
   分区手段
   ============================================================ */
/* 一条发丝线 —— 只在卡片内部的"行间"用，不做大面积分区 */
.rule {
	height: 1rpx;
	background-color: $dui-line2;
}

/* 卡片：比页面亮一档的纸 + 一条极细边。无阴影 —— 靠明度差分层。 */
.card {
	background-color: $dui-card;
	border: 1rpx solid $dui-line;
	border-radius: $dui-r-card;
	/* 卡片常带内边距，统一用 border-box 让 1rpx 边框不撑破布局宽度 */
	box-sizing: border-box;
}

/* 标签行：宽字距的小标签 + 右侧等宽计数。它是块与块之间的呼吸位，
   也保证每个内容块的开头结构一致。 */
.sec-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	height: 60rpx;
	padding-top: 18rpx;
}

.sec-label {
	font-family: $dui-font-serif;
	font-size: $dui-fs-label;
	letter-spacing: $dui-ls-label;
	color: $dui-ink3;
}

.sec-count {
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	letter-spacing: $dui-ls-num;
	color: $dui-ink3;
}

/* 兼容旧名（早期页面用的是 .sec-title） */
.sec-title {
	font-family: $dui-font-serif;
	font-size: $dui-fs-label;
	letter-spacing: $dui-ls-label;
	color: $dui-ink3;
}

/* ============================================================
   文字 —— 三种字体各司其职
   ============================================================ */
.t-display {
	font-family: $dui-font-serif;
	font-size: $dui-fs-display;
	font-weight: $dui-fw-semi;
	line-height: $dui-lh-display;
	letter-spacing: $dui-ls-display;
	color: $dui-ink;
}

.t-title {
	font-family: $dui-font-serif;
	font-size: $dui-fs-title;
	font-weight: $dui-fw-semi;
	line-height: $dui-lh-title;
	letter-spacing: $dui-ls-title;
	color: $dui-ink;
}

.t-h1 {
	font-family: $dui-font-serif;
	font-size: $dui-fs-h1;
	font-weight: $dui-fw-semi;
	line-height: $dui-lh-h1;
	letter-spacing: $dui-ls-h1;
	color: $dui-ink;
}

.t-h2 {
	font-size: $dui-fs-h2;
	font-weight: $dui-fw-semi;
	line-height: $dui-lh-h2;
	color: $dui-ink;
}

/* 台词：主 */
.t-line {
	font-size: $dui-fs-bodyL;
	line-height: $dui-lh-bodyL;
	color: $dui-ink;
}

.t-body {
	font-size: $dui-fs-body;
	line-height: $dui-lh-body;
	color: $dui-ink;
}

.t-sub {
	font-size: $dui-fs-caption;
	line-height: $dui-lh-caption;
	color: $dui-ink2;
}

.t-hint {
	font-size: $dui-fs-caption;
	line-height: $dui-lh-caption;
	color: $dui-ink3;
}

/* 数字：一律等宽 —— 精确感来自等宽，不是来自特效 */
.t-num {
	font-family: $dui-font-mono;
	font-size: $dui-fs-num;
	letter-spacing: $dui-ls-num;
	color: $dui-ink3;
}

.t-label {
	font-family: $dui-font-serif;
	font-size: $dui-fs-label;
	letter-spacing: $dui-ls-label;
	color: $dui-ink3;
}

.t-vm { color: $dui-vm; }

/* 动作文字：朱色 + 半粗。全站统一，避免每个页面各写一套 */
.act {
	display: inline-flex;
	align-items: center;
	font-size: $dui-fs-caption;
	font-weight: $dui-fw-semi;
	color: $dui-vm;
}

/* ============================================================
   按钮（胶囊，只有两档）
   ============================================================ */
.btn {
	height: 96rpx;
	border-radius: $dui-r-pill;
	background-color: $dui-ink;
	color: $dui-on-ink;
	font-size: 30rpx;
	font-weight: $dui-fw-medium;
	letter-spacing: 1rpx;
	display: flex;
	align-items: center;
	justify-content: center;
}

.btn-ghost {
	background-color: transparent;
	border: 1rpx solid $dui-line;
	color: $dui-ink;
}

.btn[disabled],
.btn.disabled {
	background-color: $dui-ink4;
	color: $dui-on-ink;
}

/* 小号按钮变体（当前全站未使用）。
   高度仍须 ≥88rpx(44pt) —— 不为"小"牺牲触控下限。 */
.btn-sm {
	height: 88rpx;
	font-size: 26rpx;
}

/* ============================================================
   触摸目标（1rpx = 0.5pt，故 88rpx = 44pt —— 微信推荐最小触控值）
   ------------------------------------------------------------
   视觉尺寸可以小，但热区不能小。文字链接 / 纯符号按钮挂上 .tap-88，
   用透明内边距把热区撑到 88rpx×88rpx，不改动视觉大小。
   ============================================================ */
.tap-88 {
	min-height: 88rpx;
	min-width: 88rpx;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

/* ============================================================
   ★ 小巧思（四处）
   ------------------------------------------------------------
   全部用 @media (prefers-reduced-motion: no-preference) 包裹 ——
   系统开了"减少动态效果"就自动关掉，不打扰任何人。
   ============================================================ */

/* 巧思 1 · 按压反馈 —— 全站统一的可复用类 .press
   同一个"被按下"的信息，用两种方式表达，二者取一（按系统偏好）：
     · 允许动效 → 缩放（纸上的按钮"陷一下"再弹回）
     · 减少动效 → 背景色深一档（$dui-press），不产生任何运动
   任何可点元素都挂 .press；两条分支必须都在，不能 reduce 下什么都不给
   （那样按钮会像"坏了"）。 */
@media (prefers-reduced-motion: no-preference) {
	.press {
		transition: transform $dui-dur-fast $dui-ease-out;
	}

	.press:active {
		transform: scale(0.94);
	}
}

/* 减少动效：不缩放，改用颜色表达按压，确保按下仍有反馈。
   规则顺序即优先级（同特异性下后者胜），依次兜底：
   ① 浅底/透明底元素（文本链接、幽灵按钮、朱色描边按钮）→ 换成深一档的纸
   ② 实心墨底按钮（.btn，白字）→ 纸底会让白字失去对比，故保持墨底、
      改用不透明度表达按压（与页面既有 .btn-hover: opacity .88 同一语言）
   ③ 幽灵按钮是透明底，仍回到纸底表达按压（覆盖 ②） */
@media (prefers-reduced-motion: reduce) {
	.press:active {
		background-color: $dui-press;
	}

}

/* 墨底元素专用按压类（两种模式下都用 opacity，无位移）。
   为什么不复用 .press：.press 在 reduce 下靠「底色变深」表达，而 $dui-press 是纸色系 ——
   墨底元素一旦挂 .press，减动效下会从墨底变浅底、文字仍是 $dui-on-ink（近白），对比度直接塌。
   所以墨底元素一律用 .press-ink：
     .press      只挂纸底元素
     .press-ink  只挂墨底元素（background-color: $dui-ink 的按钮）
   opacity 让白字与墨底同比衰减，实测对比度仍达标。 */
.press-ink {
	transition: opacity $dui-dur-fast $dui-ease-out;
}

.press-ink:active {
	opacity: 0.88;
}

/* 巧思 2 · 待确认的状态点：空心朱圈 + 极慢脉动
   表示"这里在等你"，但周期 2.4s、幅度很小 —— 是呼吸，不是闪烁。 */
.dot-todo {
	width: 6rpx;
	height: 6rpx;
	border-radius: 999rpx;
	border: 2rpx solid $dui-vm;
	background-color: transparent;
	box-sizing: border-box;
}

@media (prefers-reduced-motion: no-preference) {
	.dot-todo {
		animation: dui-breathe $dui-dur-slow ease-in-out infinite;
	}
}

@keyframes dui-breathe {
	0%, 100% { transform: scale(1); opacity: 0.9; }
	50%      { transform: scale(1.35); opacity: 0.45; }
}

/* 巧思 3 · 当前句的竖轨会呼吸地变淡一点
   比"加粗字体"更安静，但同样能指出"正在说这一句"。 */
@media (prefers-reduced-motion: no-preference) {
	.rail-live {
		animation: dui-rail $dui-dur-slow ease-in-out infinite;
	}
}

@keyframes dui-rail {
	0%, 100% { opacity: 1; }
	50%      { opacity: 0.62; }
}

/* 巧思 4 · 主张末尾的「朱点」
   正文是墨、收笔的一点是朱 —— 像稿纸上一笔写完后落下的那一点。
   整页只有这一处，多一点都不行。 */
.t-enddot {
	color: $dui-vm;
}
</style>
