# 「对白」Web 版 —— 实验4：软件基础功能开发

把一篇文章改写成**双人口语对谈**。本工程是《实验3：软件架构与界面设计》设计基线的落地实现：
**Next.js 15（App Router）+ React 19 + TypeScript + SQLite**，按**分层架构**组织。

> 技术栈与分层方式完全沿用实验3 的 ADR-1／ADR-2／ADR-3，未做替换。

---

## 一、目录职责（对照实验3 图2 的分层架构）

```
src/
├── domain/            领域层 —— 实体与规则。不依赖任何框架、数据库、网络
│   ├── types.ts         Article / Paragraph / DialogueScript / DialogueLine / Tone / AudioSegment
│   ├── errors.ts        错误码 AppError 及各错误的 HTTP 状态码映射
│   └── paragraph.ts     文章归一化、切分与段落编号、内容形态占比判断
│
├── infrastructure/    基础设施层 —— 存储、日志、HTTP 出口
│   ├── schema.mjs       SQLite 建表语句（Next 与初始化脚本共用同一份）
│   ├── db.ts            连接、PRAGMA、单例
│   ├── repository.ts    全部 SQL 集中于此，应用层不写 SQL
│   ├── logger.ts        双写日志：文件（JSON Lines）+ app_logs 表
│   └── http.ts          统一成功/失败响应形状
│
├── application/       应用服务层 —— 流程编排
│   ├── articleService.ts   上传 → 校验 → 切分 → 落库
│   ├── scriptService.ts    生成编排 → 程序校验 → 落库
│   ├── confirmService.ts   可疑处确认、单句修正
│   └── audioService.ts     音频合成调度与降级
│
├── ai/                AI 能力层 —— 唯一直接与外部模型交互的一层，全部为可替换适配器
│   ├── llm/             大模型客户端（本次为确定性本地实现，接口不变）
│   └── tts/             语音合成客户端
│
└── app/               表现层 —— 页面与接口
    ├── page.tsx                        首页 / 入口页（上传 + 口吻 + 历史）
    ├── confirm/[id]/page.tsx           生成与确认页（可疑处确认）
    ├── result/[id]/page.tsx            结果页（播放器 + 逐句文字稿 + 出处）
    ├── error/page.tsx                  错误与降级页
    └── api/                            对应实验3 表12 的接口清单
        ├── tones/
        ├── articles/ + articles/[id]/
        ├── scripts/ + scripts/[id]/ + scripts/[id]/audio/
        ├── lines/[id]/ + lines/[id]/confirm/
        └── paragraphs/[id]/

scripts/
├── sample-data.json    样例数据（6 个口吻 + 1 篇正常样例 + 1 篇内容形态异常样例）
├── seed.mjs            初始化 / 清空 / 恢复样例数据
└── test.mjs            基础测试用例（实验4 §2.5）

data/                   运行期数据，不进版本库
├── duibai.db           SQLite 数据库
├── audio/              音频片段
└── logs/app-YYYY-MM-DD.log   运行日志（JSON Lines）
```

**依赖方向**：`app → application → domain / infrastructure / ai`，单向，不回指。
AI 能力层与基础设施层均不依赖表现层 —— 这是模型服务可被替换的前提（实验3 表8）。

---

## 二、跑起来

```bash
npm install

# 1) 初始化样例数据（可重复执行；--reset 先清空）
npm run seed

# 2) 启动
npm run dev          # http://localhost:3210
```

清空 / 恢复：

```bash
node scripts/seed.mjs --clear     # 只清空
node scripts/seed.mjs --reset     # 清空后重新初始化
node scripts/seed.mjs --status    # 查看各表记录数
```

## 三、测试

```bash
npm test              # 基础测试用例（需要 dev 或 start 已在运行）
```

## 四、环境要求

- Node.js ≥ 22.5（使用内置 `node:sqlite`，**不需要任何原生编译或二进制下载**）
- 无需任何 API Key：AI 能力层在实验4 阶段使用确定性本地实现，接口与真实模型一致，
  换成真实模型只需替换 `src/ai/` 下的适配器。
