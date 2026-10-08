# 对白听文 · uni-app 工程

> 脚手架已完成，**可编译运行**；业务逻辑与界面待实现。
> 需求拆解见上级目录 `期末作品-项目要求规划.md`，开发前置见 `开发前准备清单.md`。

---

## 一、怎么打开

1. 打开 **HBuilderX** → `文件 → 打开目录` → 选中本目录（`duibai-app`）
2. 左侧会看到 `pages / components / static / uniCloud-aliyun` 等
3. 首次使用需在 HBuilderX 里**登录 DCloud 账号**（免费注册）

**运行到微信开发者工具**：`运行 → 运行到小程序模拟器 → 微信开发者工具`

> ⚠️ 先设置微信开发者工具路径：HBuilderX `工具 → 设置 → 运行配置` →
> 微信开发者工具路径填 `E:\微信web开发者工具\`

---

## 二、打开前必须配的两件事

### 1. 创建 uniCloud 服务空间

HBuilderX 左侧 `uniCloud` → `新建服务空间` → 选 **阿里云版**（有免费空间，腾讯云版需付费）。

创建后右键项目 → `uniCloud` → 关联该服务空间。

### 2. 配置云函数环境变量

uniCloud 控制台 → 云函数 → 对应函数 → 环境变量：

| 云函数 | 变量名 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| `login` | `WX_SECRET` | **必填** | 小程序后台生成的 AppSecret（微信登录用） |
| `login` | `TOKEN_SECRET` | 建议填 | 令牌签名密钥；**不填会用代码里的开发默认值**，上线前务必换成随机长串 |
| `generate-dialogue` | `DEEPSEEK_API_KEY` | **必填** | DeepSeek 的 Key（生成对话稿用） |
| `tts-synthesize` | `TTS_PROVIDER` | 接入时填 | 供应商标识 |
| `tts-synthesize` | `TTS_VOICE_A` / `TTS_VOICE_B` | 接入时填 | 两个音色 ID |

> `WX_APPID` **不需要配**——已作为默认值写在 `login/index.js` 里（AppID 不是密钥，可以公开）。

🔒 **这些值只存在云函数环境变量里，前端拿不到。** 不要写进任何代码文件。

---

## 三、不用点界面也能编译和部署（HBuilderX CLI）

HBuilderX 自带命令行工具，`agent` 或你都能用它**跳过 GUI**：

```bash
CLI="/e/HBuilderX.5.24.2026081301/HBuilderX/cli.exe"     # 需 HBuilderX 处于运行状态

# 编译到微信小程序并输出报错（最常用）
"$CLI" launch mp-weixin --project "本目录绝对路径" --compile true --continue-on-error true

# 查资源：不加 --cloud 是本地，加了是云端
"$CLI" cloud functions --list db --prj duibai-app --provider aliyun --cloud
"$CLI" cloud functions --info --prj duibai-app --provider aliyun

# 上传（★ 逐个传，不要用 allcloudfunctions，它是空转的）
"$CLI" cloud functions --upload db --prj duibai-app --provider aliyun --name users.schema.json
"$CLI" cloud functions --upload common --prj duibai-app --provider aliyun --name common
"$CLI" cloud functions --upload cloudfunction --prj duibai-app --provider aliyun --name data

# 导入种子数据
"$CLI" cloud functions --initdatabase --prj duibai-app --provider aliyun
```

⚠️ 注意：`--upload db` 的 `--name` **必须带 `.schema.json` 后缀**；
成功提示是「**上传完成**」不是「上传成功」。

---

## 四、数据库初始化

`uniCloud-aliyun/database/` 下：

- `*.schema.json` —— 10 张表的结构与权限
- `db_init.json` —— 种子数据（**6 个口吻 + 2 条 banner**）

**导入方式**：右键 `database` 目录 → `上传所有 DB Schema`；再右键 `db_init.json` → `初始化云数据库`。

### 权限策略（重要）

**客户端不直连数据库，所有业务读写都走云函数。** 这样不必引入 uni-id，权限判断集中在服务端。

| 表 | 客户端权限 | 说明 |
| --- | --- | --- |
| `banners`、`tones` | 可读 | 公开展示数据，直接读省一次云函数往返 |
| 其余 8 张表 | 全部关闭 | 只能通过云函数访问 |

---

## 五、目录说明

```
duibai-app/
├── pages/                13 个页面（都在 pages.json 注册好了）
│   ├── index/ login/ generate/ confirm/ result/
│   ├── history/ article/ profile/ error/
│   └── admin/{dashboard,users,banners,tones}/
├── components/           16 个组件的落位（common / business / media）
├── static/               images / icons / styles
├── store/modules/        状态管理
├── api/index.js          ★ 云函数调用统一封装（页面里直接用这个）
├── utils/
└── uniCloud-aliyun/
    ├── cloudfunctions/   8 个云函数
    └── database/         10 张表 schema + 种子数据
```

### 云函数一览

| 云函数 | 职责 | 状态 |
| --- | --- | --- |
| `common` | 公共模块：响应体、错误码、令牌签发校验、登录/管理员守卫 | ✅ 完整 |
| `login` | 微信登录：code 换 openid、建档、签发令牌 | ✅ 完整 |
| `data` | 业务数据网关：文章/段落/对话稿/条目/反馈 | ✅ 完整 |
| `generate-dialogue` | 对话生成编排：Prompt → 大模型 → 三项校验 → 落库 | ✅ 逻辑完整，需配 Key |
| `tts-synthesize` | 音频合成调度：分句 TTS → 云存储 → 落库 | ⚠️ **TTS 适配器待接入** |
| `admin-users` | 用户管理（含管理端统计） | ✅ 完整 |
| `admin-banners` | Banner 管理 | ✅ 完整 |
| `admin-tones` | 口吻模板管理 | ✅ 完整 |

`api/index.js` 已按业务分好组（`auth` / `article` / `script` / `line` / `admin` / `publicData`），
页面里 `import { script } from '@/api/index.js'` 即可。

---

## 六、已完成 / 未完成

**已完成**
- [x] `pages.json` —— **13 个页面全部注册**（2a 要求 ≥6）
- [x] `manifest.json` —— 已填 AppID，`urlCheck:false`（开发期免配域名白名单）
- [x] `main.js` / `App.vue` / `uni.scss`（含设计令牌）
- [x] 10 张表 schema + 种子数据（含老师点名的 `users`、`banners`）
- [x] 8 个云函数，核心链路逻辑完整
- [x] `api/index.js` 统一封装
- [x] `utils/format.js` 通用格式化
- [x] **首页 `pages/index/index.vue`** —— 轮播 + 上传 + 口吻 + 开始生成 + 最近生成
- [x] **登录页 `pages/login/login.vue`** —— 微信一键登录 / 不登录试用
- [x] **5 个组件**：`DuiBanner`（含子组件 `SlideCard`）、`UploadCard`、`ToneSelector`、
      `EmptyState`、`TaskListItem`

**未完成**
- [ ] 其余 **11 个页面**仍是占位骨架（生成中 / 确认 / 结果 / 历史 / 原文 / 我的 / 错误 + 管理端 4 页）
- [ ] 其余 **11 个组件**：`ProgressRing`、`SuspectCard`、`LineItem`、`AudioPlayer`、
      `LyricSync`、`SourcePopover`、`AdminTable`、`AdminStatCard`、`StatusTag`、`DuiButton`、`DuiDialog`
- [ ] TTS 供应商适配器（火山引擎/腾讯云 SDK 调用）
- [ ] ColorUI / uni-ui 引入（是否引入待定）
- [ ] 管理端页面的入口（目前没有从「我的」进管理端的跳转）
- [ ] 把第一个用户手工改成 `admin`（改 `users` 表 `role` 字段）

### 组件约定（重要）★

组件放在 **`components/组件名/组件名.vue`**，但**必须显式 import + 注册**，不要依赖 easycom 自动扫描：

```js
import DuiBanner from '@/components/DuiBanner/DuiBanner.vue'
import UploadCard from '@/components/UploadCard/UploadCard.vue'

export default {
  components: { DuiBanner, UploadCard },
  // ...
}
```

**为什么：** 本项目实测 **easycom autoscan 未生效** —— 症状是页面其他部分正常、
**组件区域一片空白**，产物里没有 `components/` 目录、`pages/*/*.json` 的
`usingComponents` 是 `{}`。微信端遇到未注册的自定义标签会**静默不渲染、不报错**，很容易误判成样式问题。
改用显式 import 后立刻恢复正常。

**排查口诀**：组件不显示 → 先看产物 `pages/x/x.json` 的 `usingComponents` 是不是空的。

仅供某组件内部使用的子组件（如 `DuiBanner/SlideCard.vue`）**在父组件里 import** 即可，不单独占目录。

---

## 七、已知约束（别踩）

| 约束 | 后果 | 做法 |
| --- | --- | --- |
| 云函数超时 | 大模型生成可能超时 | `generate-dialogue` 已设 `timeout:60`；若仍不够，改「提交任务→轮询」 |
| 小程序主包 2MB | 传不上去 | 音频/图片一律走云存储，不进包 |
| 密钥不能进前端 | 泄露 | 全部放云函数环境变量 |
| 开发期域名白名单 | 请求被拦 | `manifest.json` 里 `urlCheck:false`；**生产必须改回并配置合法域名** |
| tabBar 无图标 | 目前只显示文字 | 需要 `static/icons/` 下补图标文件（`iconPath`）|
