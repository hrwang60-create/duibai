# 「对白」Web 版 —— 实验4：软件基础功能开发 / 实验5：LLM、Context 与 RAG 实现

把一篇文章改写成**双人口语对谈**。本工程是《实验3：软件架构与界面设计》设计基线的落地实现：
**Next.js 15（App Router）+ React 19 + TypeScript + SQLite**，按**分层架构**组织。

> 技术栈与分层方式完全沿用实验3 的 ADR-1／ADR-2／ADR-3，未做替换。
> 实验5 在这套分层里补上了**真实模型调用**与**RAG 最小链路**（`src/ai/rag/`），
> 并新增一个知识问答入口（页面 `/ask` + 接口 `POST /api/ask` + 命令行 `scripts/rag-ask.mjs`）。

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
│   ├── llm/             大模型客户端
│   │   ├── index.ts       LlmClient 接口 + 按 LLM_PROVIDER 选择实现
│   │   ├── local.ts       确定性本地实现（默认，保证测试可复现）
│   │   ├── deepseek.mjs   **真实云端实现**（实验5 新增）：超时/重试/结构化输出校验/错误分类
│   │   └── prompt.mjs     对话稿生成的 Prompt 模板（任务要求与用户问题分离）
│   ├── tts/             语音合成客户端
│   └── rag/             **RAG 最小链路**（实验5 新增）
│       ├── chunk.mjs       切分：标题 → 段落 → 长度，带重叠与元数据
│       ├── token.mjs       词项切分（中文二元组 + 英文整词）与 Token 估算
│       ├── embed.mjs       本地确定性嵌入（char-ngram-hash-v1）+ IDF 加权 + 余弦
│       ├── bm25.mjs        关键词检索（BM25）
│       ├── retrieve.mjs    混合检索（向量 + BM25 → RRF 融合）+ 相关性判定
│       ├── prompt.mjs      QA Prompt v1/v2、相关性判定 Prompt、上下文组织与精简
│       ├── store.mjs       索引构建/读取（data/kb/index.json）
│       └── ask.mjs         最小链路编排：问题 → 检索 → 判定 → 上下文 → 模型 → 带出处回答
│
└── app/               表现层 —— 页面与接口
    ├── page.tsx                        首页 / 入口页（上传 + 口吻 + 历史）
    ├── ask/page.tsx                    **知识问答页**（实验5 新增）
    ├── confirm/[id]/page.tsx           生成与确认页（可疑处确认）
    ├── result/[id]/page.tsx            结果页（播放器 + 逐句文字稿 + 出处）
    ├── error/page.tsx                  错误与降级页
    └── api/                            对应实验3 表12 的接口清单
        ├── ask/                        **POST /api/ask 知识问答**（实验5 新增）
        ├── tones/
        ├── articles/ + articles/[id]/
        ├── scripts/ + scripts/[id]/ + scripts/[id]/audio/
        ├── lines/[id]/ + lines/[id]/confirm/
        └── paragraphs/[id]/

kb/                     知识库原始资料快照与清单（实验5 新增，**进版本库**）
├── manifest.json       每份资料的来源路径、sha256、使用权限、隐私处理、更新方法
└── source/             5 份 Markdown 快照（S1…S5）

scripts/
├── sample-data.json    样例数据（6 个口吻 + 3 篇样例文章）
├── seed-core.mjs       初始化/清空的核心逻辑（CLI 与测试共用，避免两份实现漂移）
├── seed.mjs            命令行入口：初始化 / 清空 / 恢复 / 查看
├── test.mjs            基础测试用例 18 项（实验4 §2.5）
├── kb-import.mjs       知识库资料导入（复制快照 + 生成 manifest + --verify 校验）
├── kb-build.mjs        索引构建（切分 + 嵌入 + BM25），支持 --list / --show
├── rag-ask.mjs         命令行问答入口（实验5 §2.6 的 CLI 形态）
├── exp5-probe.mjs      §2.1 模型调用证据（正常/缺信息/超范围 + 三类失败 + 结构化输出校验）
├── exp5-prompt.mjs     §2.2 Prompt 版本对比、多轮历史、上下文精简
├── exp5-calibrate.mjs  §2.4 相关性判定的阈值取值依据 + 判定准确率
└── exp5-compare.mjs    §2.5 对比测试（直接模型组 vs RAG 组，8 个固定问题）

data/                   运行期数据，不进版本库
├── duibai.db           SQLite 数据库
├── audio/              音频片段
├── kb/index.json       知识库检索索引（可重建）
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
- 无需任何 API Key：AI 能力层当前使用确定性本地实现，接口与真实模型一致，
  换成真实模型只需替换 `src/ai/` 下的适配器。

## 五、版本

| Tag | 内容 | 可演示的东西 |
| --- | --- | --- |
| `v0.1.0-initial` | **可运行初版**：分层骨架 + 数据库建表 + 仓储层 + 首页上传解析与历史读取 | 能启动、能上传解析一篇文章并读回段落、首页与 4 个接口入口可用 |
| `v0.2.0-revision` | **测试修订版**：补全非AI 核心业务闭环（生成 → 程序三校 → 人工确认 → 单句修正 → 合成降级），并修复测试中发现的 5 处问题 | 完整跑完「上传 → 生成 → 确认 → 结果」并能演示两条异常路径 |

两版之间改了什么的完整记录见实验4 报告 §2.1 与 §2.5。
