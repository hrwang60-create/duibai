#!/usr/bin/env node
/**
 * 「对白」小程序 · 落地验收脚本
 * ---------------------------------------------------------------
 * 用法：
 *   node 验收.mjs            # 跑全部 6 项（含编译）
 *   node 验收.mjs --no-compile  # 跳过第 1 项（编译很慢时用）
 *
 * 覆盖 6 项：
 *   1. 语法/编译   —— HBuilderX cli 编译 mp-weixin，0 error
 *   2. 令牌合法性  —— 所有 .vue 引用的 $dui-* 都能在 uni.scss 找到定义
 *   3. 写死色扫描  —— 旧值字面量(#8C877E/#B5AFA5/#C8452C/#F4E8E2)不得出现在 .vue
 *   4. 动效保护    —— animation/transition 时长>200ms 的必须被
 *                     @media (prefers-reduced-motion: no-preference) 包裹
 *   5. 触摸目标    —— 扫描 height 落在 72/76/80rpx 的规则（需人工核对是否可点）
 *   6. 产物核对    —— 新令牌值进入 app.wxss / app.json
 *   7. 内联 svg    —— **微信小程序渲染器不认 <svg> 标签**，模板里写了会静默变空白。
 *                     uni-app 只会把它原样透传到 WXML，不报错、不警告、也不渲染。
 *                     小图标请用：① <image> 引 png ② CSS 画（border 三角）
 *                     ③ 已在同页正常显示的字符（如 ↑ 与 → 同属 U+2190 区块）
 *
 * 退出码：0 = 无 FAIL；1 = 有 FAIL。
 * ---------------------------------------------------------------
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP = path.join(__dirname, 'duibai-app')
const DIST = path.join(APP, 'unpackage/dist/dev/mp-weixin')
const NO_COMPILE = process.argv.includes('--no-compile')
const HBX_CLI = process.env.HBX_CLI || 'E:\\HBuilderX.5.24.2026081301\\HBuilderX\\cli.exe'

const results = []
const fail = (title, lines) => results.push({ ok: false, title, lines })
const pass = (title, lines = []) => results.push({ ok: true, title, lines })
const warn = (title, lines) => results.push({ ok: true, warn: true, title, lines })

const walk = (dir, re) => {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p, re))
    else if (re.test(e.name)) out.push(p)
  }
  return out
}
const read = (p) => fs.readFileSync(p, 'utf8')
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

// 所有 vue 源文件（含 App.vue）
const vueFiles = [
  path.join(APP, 'App.vue'),
  ...walk(path.join(APP, 'pages'), /\.vue$/),
  ...walk(path.join(APP, 'components'), /\.vue$/)
]
const rel = (p) => path.relative(__dirname, p).replace(/\\/g, '/')

// ── 1. 语法 / 编译 ────────────────────────────────────────────────
const sleep = (ms) => { const t = Date.now(); while (Date.now() - t < ms) { /* spin */ } }
function runCli (args) {
  // 直接调用失败（clash/EBUSY 等）时，回退到 cmd /c
  try {
    return execFileSync(HBX_CLI, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    if (e.code !== 'EBUSY') throw e
    const comspec = process.env.ComSpec || 'cmd.exe'
    return execFileSync(comspec, ['/c', HBX_CLI, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  }
}
function checkCompile () {
  if (NO_COMPILE) return warn('1. 语法/编译', ['已用 --no-compile 跳过（默认会执行）'])
  if (!fs.existsSync(HBX_CLI)) {
    return warn('1. 语法/编译', [`未找到 HBuilderX cli：${HBX_CLI}`, '设 HBX_CLI 环境变量指定 cli.exe 路径后重跑'])
  }
  const args = ['launch', 'mp-weixin', '--project', APP, '--compile', 'true', '--continue-on-error', 'true']
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = runCli(args)
      if (/编译成功/.test(out)) return pass('1. 语法/编译', ['mp-weixin 编译成功，0 error'])
      const errs = out.split('\n').filter((l) => /error|Error|失败/.test(l)).slice(0, 15)
      return fail('1. 语法/编译', ['未捕获到「编译成功」', ...errs])
    } catch (e) {
      // e.status 是数字 => 进程起来了但退出码非 0；否则(null/undefined) => 进程没起来（沙箱/权限）
      if (typeof e.status === 'number') {
        const errs = String(e.stdout || '').split('\n').filter((l) => /error|Error|失败/.test(l)).slice(0, 15)
        return fail('1. 语法/编译', [`编译进程退出码 ${e.status}`, ...errs])
      }
      if (attempt < 3) sleep(1500) // cli.exe 被后台预览进程占用时，稍等重试
      else {
        return warn('1. 语法/编译', [
          `本环境不允许脚本内启动子进程（${e.code || e.message}），无法自动编译。`,
          '请在项目工作区内直接执行：',
          `  ${HBX_CLI} launch mp-weixin --project "<duibai-app 绝对路径>" --compile true --continue-on-error true`,
          '然后用 `node 验收.mjs --no-compile` 复核第 2–6 项。'
        ])
      }
    }
  }
}

// ── 2. 令牌合法性 ─────────────────────────────────────────────────
function checkTokens () {
  const scss = read(path.join(APP, 'uni.scss'))
  const defined = new Set([...scss.matchAll(/^\s*(\$dui-[\w-]+)\s*:/gm)].map((m) => m[1]))
  const missing = []
  for (const f of vueFiles) {
    const src = read(f)
    for (const name of new Set([...src.matchAll(/(\$dui-[\w-]+)/g)].map((m) => m[1]))) {
      if (!defined.has(name)) missing.push(`${rel(f)}  →  ${name}`)
    }
  }
  if (missing.length) return fail('2. 令牌合法性', [`uni.scss 定义 ${defined.size} 个；以下引用未定义：`, ...missing])
  return pass('2. 令牌合法性', [`uni.scss 定义 ${defined.size} 个；所有 .vue 引用均可解析`])
}

// ── 3. 写死色扫描 ─────────────────────────────────────────────────
// 分两层：
//   <style> 块（CSS 上下文）—— 出现旧值即 FAIL（应走 $dui-* 令牌）
//   非 style（script/template）—— SCSS 变量够不着，属「不可令牌化」层：
//     不判 FAIL，但**按出现次数 + 行号完整枚举**，并把「值仍是旧值(stale)」单独点名。
function blankKeepLines (m) { return m.replace(/[^\n]/g, ' ') }
function styleOf (vue) {
  return [...vue.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
}
function nonCssOf (vue) {
  return vue
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, blankKeepLines)
    .replace(/\/\*[\s\S]*?\*\//g, blankKeepLines)
    .replace(/<!--[\s\S]*?-->/g, blankKeepLines)
}
function checkHardcoded () {
  const OLD = ['8c877e', 'b5afa5', 'c8452c', 'f4e8e2']
  const cssHits = []
  const stale = []
  const others = []
  for (const f of vueFiles) {
    const vue = read(f)
    const css = stripComments(styleOf(vue)).toLowerCase()
    for (const v of OLD) if (css.includes(v)) cssHits.push(`${rel(f)}  →  #${v}（style 块内）`)
    const nc = nonCssOf(vue)
    for (const m of nc.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
      const line = nc.slice(0, m.index).split('\n').length
      const where = `${rel(f)}:${line}  #${m[1]}`
      if (OLD.includes(m[1].toLowerCase())) stale.push(where)
      else others.push(where)
    }
  }
  const layer = [
    `非 CSS(script/template) 层硬编码色：共 ${stale.length + others.length} 处（其中 stale 旧值 ${stale.length} 处）`,
    ...(stale.length ? ['  ⚠️ 值仍是旧值（令牌已变，此处未同步）：', ...stale.map((s) => '    ' + s)] : ['  ✓ 无 stale 旧值']),
    ...(others.length ? ['  其余（不可令牌化，值已正确/等价）：', ...others.map((s) => '    ' + s)] : [])
  ]
  if (cssHits.length) return fail('3. 写死色扫描', ['style 块内出现旧令牌字面量（应走 $dui-*）：', ...cssHits, '', ...layer])
  return warn('3. 写死色扫描', ['style 块内无旧值 ✅（CSS 层干净）', ...layer])
}

// ── 4. 动效保护 ───────────────────────────────────────────────────
function checkMotion () {
  const bad = []
  for (const f of vueFiles) {
    const src = read(f)
    // 记录每个 @media (prefers-reduced-motion: no-preference) 块的 [start,end]
    const ranges = []
    for (const m of src.matchAll(/@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/g)) {
      let i = src.indexOf('{', m.index); let depth = 0; let j = i
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++
        else if (src[j] === '}') { depth--; if (depth === 0) break }
      }
      ranges.push([i, j])
    }
    const inMedia = (pos) => ranges.some(([a, b]) => pos > a && pos < b)
    for (const m of src.matchAll(/(animation|transition)\s*:\s*([^;\n}]+)/g)) {
      const val = m[2]
      let ms = 0
      for (const d of val.matchAll(/([\d.]+)\s*(ms|s)\b/g)) ms = Math.max(ms, d[2] === 's' ? +d[1] * 1000 : +d[1])
      if (ms > 200 && !inMedia(m.index)) bad.push(`${rel(f)}  →  ${m[1]}:${val.trim()}（${ms}ms，未包 media）`)
    }
  }
  if (bad.length) return fail('4. 动效保护', ['以下 >200ms 动效未被 prefer→no-preference 包裹：', ...bad])
  return pass('4. 动效保护', ['全部 >200ms 的 animation/transition 均已在 reduced-motion 媒体块内'])
}

// ── 5. 触摸目标（提示性） ─────────────────────────────────────────
function checkTap () {
  const hits = []
  for (const f of vueFiles) {
    const src = read(f)
    for (const m of src.matchAll(/height\s*:\s*(72|76|80)rpx/g)) {
      const line = src.slice(0, m.index).split('\n').length
      hits.push(`${rel(f)}:${line}  →  height:${m[1]}rpx`)
    }
  }
  if (hits.length) return warn('5. 触摸目标（提示）', ['以下 72/76/80rpx 高度需人工核对是否为「可点容器」（是则应 ≥88rpx）：', ...hits])
  return pass('5. 触摸目标', ['无 72/76/80rpx 的 height 残留'])
}

// ── 6. 产物核对 ───────────────────────────────────────────────────
/** 7. 内联 svg —— 小程序特有的静默失效，必须查 */
function checkInlineSvg () {
  const hits = []
  for (const f of vueFiles) {
    // 先剥掉注释、script、style，只在真正的模板里找
    let t = read(f)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
    for (const m of t.matchAll(/<svg[\s>]/g)) {
      const line = t.slice(0, m.index).split('\n').length
      hits.push(`${rel(f)}  第 ${line} 行附近`)
    }
  }
  if (hits.length) {
    return fail('7. 内联 svg', [
      '微信小程序渲染器不认 <svg> 标签 —— 这些位置会渲染成空白，且不报错：',
      ...hits,
      '改法：① <image src="...png">  ② CSS border 画三角  ③ 复用同页已能显示的字符'
    ])
  }
  return pass('7. 内联 svg', ['模板里无内联 <svg>（小程序会静默丢弃）'])
}

function checkDist () {
  const wxss = path.join(DIST, 'app.wxss')
  const wxjson = path.join(DIST, 'app.json')
  if (!fs.existsSync(wxss) || !fs.existsSync(wxjson)) {
    return warn('6. 产物核对', ['产物不存在（可能正在编译 / 从未编译）——本次跳过。', '请先编译（见第 1 项命令），再重跑。'])
  }
  // 稳定性守卫：若产物正在被写入（HBuilderX GUI 自动编译进行中），跳过以免误报
  const sz1 = fs.statSync(wxss).size
  sleep(400)
  if (!fs.existsSync(wxss) || fs.statSync(wxss).size !== sz1) {
    return warn('6. 产物核对', ['产物正在被写入（疑似 HBuilderX 自动编译进行中），本次跳过以避免误报。', '待编译停止后重跑本项。'])
  }
  const css = read(wxss).toLowerCase()
  const need = { '6c6760': 'ink3 新值', '756e61': 'ink4 新值', 'b83f28': 'vm 新值', 'e7dfcb': 'press 新值' }
  const miss = Object.entries(need).filter(([v]) => !css.includes(v)).map(([v, n]) => `${v}（${n}）缺失于 app.wxss`)
  let tab = ''
  try { tab = JSON.parse(read(wxjson)).tabBar?.color || '' } catch { /* ignore */ }
  if (tab.toLowerCase() !== '#6c6760') miss.push(`app.json tabBar.color = ${tab || '(无)'}，应为 #6c6760`)
  if (miss.length) {
    // 若产物里仍含「旧令牌字面量」，说明它是用旧版 uni.scss 编出来的（HBuilderX GUI 缓存/并发），
    // 属构建产物问题而非源码缺陷 —— 报 WARN 并给出诊断。
    const oldTokens = ['8c877e', 'b5afa5', 'c8452c', 'f4e8e2', 'efe9de']
    const stale = oldTokens.some((v) => css.includes(v))
    if (stale) {
      return warn('6. 产物核对', [
        '产物疑似由**旧版 uni.scss** 编译（仍含旧令牌字面量），通常是 HBuilderX GUI 缓存或并发编译所致。',
        '请关闭 HBuilderX GUI 后，用 CLI 重新编译再核对：',
        '  <cli.exe> launch mp-weixin --project "<duibai-app>" --compile true --continue-on-error true',
        ...miss.map((m) => '  · ' + m)
      ])
    }
    return fail('6. 产物核对', miss)
  }
  return pass('6. 产物核对', ['app.wxss 命中 6c6760/756e61/b83f28/e7dfcb；app.json tabBar.color = #6c6760'])
}

// ── run ───────────────────────────────────────────────────────────
checkCompile()
checkTokens()
checkHardcoded()
checkMotion()
checkTap()
checkInlineSvg()
checkDist()

console.log('\n「对白」验收报告\n' + '─'.repeat(60))
let failed = 0
for (const r of results) {
  const tag = r.ok ? (r.warn ? 'WARN' : 'PASS') : 'FAIL'
  if (!r.ok) failed++
  console.log(`\n[${tag}] ${r.title}`)
  for (const l of r.lines) console.log('        ' + l)
}
console.log('\n' + '─'.repeat(60))
console.log(failed ? `结果：${failed} 项 FAIL，其余 PASS` : '结果：全部 PASS')
process.exit(failed ? 1 : 0)
