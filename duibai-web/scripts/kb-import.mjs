/**
 * 实验5 · 知识库资料导入
 *
 * 做两件事：
 *   1. 把**选定的原始资料**复制到 kb/source/（快照），记录其来源路径与哈希；
 *   2. 生成 kb/manifest.json —— 资料数量、格式、使用权限、隐私处理、更新方法。
 *
 * 为什么是"复制快照"而不是"直接读原文件"：
 *   知识库要可复现。原文件在后续实验里还会被继续修改（实验6、实验7 都可能改文档），
 *   若索引指向原文件，报告里"这份片段来自哪一版资料"就说不清了。
 *   存入 manifest 的 sha256 可在任何时候校验快照是否被改动过。
 *
 * 运行：node scripts/kb-import.mjs        （校验模式：node scripts/kb-import.mjs --verify）
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const WEB_ROOT = path.resolve(__dirname, '..')
export const REPO_ROOT = path.resolve(WEB_ROOT, '..')

const sha256 = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex')

/** 选定的资料清单。id 会出现在片段编号里（S1-C03），所以一旦定下就不改。 */
const SOURCES = [
  {
    id: 'S1',
    title: '「对白」项目方案',
    origin_path: 'docs/项目方案.md',
    local_path: 'kb/source/S1-项目方案.md',
    covers: '产品定位、用户画像、正常与异常场景、竞品对比、功能边界、MVP 范围、AI 必要性'
  },
  {
    id: 'S2',
    title: '「对白」需求说明 V1',
    origin_path: 'docs/需求说明V1.md',
    local_path: 'kb/source/S2-需求说明V1.md',
    covers: '用户故事、验收条件 AC1–AC5、用例、非功能需求、模型输入输出约束、三级降级方案'
  },
  {
    id: 'S3',
    title: '「对白」界面原型',
    origin_path: 'docs/design/界面原型.md',
    local_path: 'kb/source/S3-界面原型.md',
    covers: '页面结构与导航、首页/确认页/结果页三张原型与交互约束'
  },
  {
    id: 'S4',
    title: '「对白」数据与接口设计',
    origin_path: 'docs/design/数据与接口设计.md',
    local_path: 'kb/source/S4-数据与接口设计.md',
    covers: '核心数据模型、主要接口清单、错误码与失败情况、核心任务顺序图'
  },
  {
    id: 'S5',
    title: '「对白」架构设计',
    origin_path: 'docs/design/架构设计.md',
    local_path: 'kb/source/S5-架构设计.md',
    covers: '分层架构、模块职责与依赖、用户—程序—模型职责划分'
  }
]

const MANIFEST = {
  name: '「对白」产品与设计知识库',
  purpose: '回答"「对白」是什么、怎么用、为什么这样设计"这类问题（实验5 的知识问答任务）',
  format: 'Markdown（.md），UTF-8 无 BOM',
  count: SOURCES.length,
  permission:
    '均为本人（本项目作者）自己撰写的课程文档，位于本项目公开仓库内，可自由使用；不引用任何第三方受版权保护的内容。',
  privacy:
    '已逐一检查并确认：不含姓名、学号、手机号、邮箱、AppSecret、API Key 等任何个人信息与凭证；' +
    '资料内容已在实验2 提交时按公开发布标准脱敏，可安全发送至外部模型接口。',
  sensitive_data_policy:
    '知识库只收产品与设计文档，**不收代码、不收密钥、不收用户上传的文章与音频**；' +
    '不向外部模型发送任何用户内容。',
  update_method:
    '改完原始文档后依次执行 `npm run kb:import`、`npm run kb:build`；' +
    'import 会刷新快照与哈希，build 会全量重建索引（片段几十条，全量重建 < 1 秒，不做增量）。',
  chunk_params: {
    target_chars: 320,
    max_chars: 520,
    overlap_chars_max: 60,
    drop: '代码块（含 mermaid 与 ASCII 原型图）整体丢弃；表头分隔行丢弃',
    split_order: '标题 → 空行段落 → 长度'
  },
  sources: SOURCES
}

function run() {
  const verify = process.argv.includes('--verify')
  fs.mkdirSync(path.join(WEB_ROOT, 'kb/source'), { recursive: true })

  const out = { ...MANIFEST, generated_at: new Date().toISOString(), sources: [] }
  let changed = 0
  let mismatch = 0

  for (const s of SOURCES) {
    const originAbs = path.join(REPO_ROOT, s.origin_path)
    const localAbs = path.join(WEB_ROOT, s.local_path)
    if (!fs.existsSync(originAbs)) {
      console.error(`✗ 源文件不存在：${originAbs}`)
      process.exitCode = 1
      continue
    }
    const originText = fs.readFileSync(originAbs, 'utf8')
    const originHash = sha256(originText)

    let snapshotHash = null
    if (verify) {
      if (fs.existsSync(localAbs)) {
        snapshotHash = sha256(fs.readFileSync(localAbs, 'utf8'))
        if (snapshotHash !== originHash) {
          mismatch++
          console.error(`✗ ${s.id} 快照与源文件不一致（源文件已改动，请重新执行 npm run kb:import）`)
        }
      } else {
        mismatch++
        console.error(`✗ ${s.id} 快照缺失`)
      }
    } else {
      fs.writeFileSync(localAbs, originText, 'utf8')
      snapshotHash = originHash
      changed++
    }

    out.sources.push({
      ...s,
      chars: originText.length,
      sha256: originHash,
      snapshot_sha256: snapshotHash,
      verified: originHash === snapshotHash
    })
  }

  const manifestAbs = path.join(WEB_ROOT, 'kb/manifest.json')
  if (!verify) {
    fs.writeFileSync(manifestAbs, JSON.stringify(out, null, 2) + '\n', 'utf8')
  }

  console.log(verify ? '— 校验模式 —' : '— 导入模式 —')
  for (const s of out.sources) {
    console.log(`${s.verified ? '✓' : '✗'} ${s.id}  ${s.title}  ${String(s.chars).padStart(6)} 字符  ${s.sha256.slice(0, 12)}…`)
  }
  console.log(`\n资料 ${out.sources.length} 份，共 ${out.sources.reduce((n, s) => n + s.chars, 0)} 字符`)
  if (verify) {
    console.log(mismatch ? `✗ ${mismatch} 份不一致` : '✓ 全部快照与源文件一致')
  } else {
    console.log(`✓ 已写入 ${changed} 份快照与 kb/manifest.json`)
  }
}

// 仅在被直接执行时运行（被其它脚本 import 时不自动跑）
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) run()
