/**
 * 定点复现：「从历史页点条目 → 结果页能否拿到台词」整条链路
 *
 * 背景：用户报「点历史那条，结果页是空的」。
 *       已确认后端 script.get 正常返回 23 条 → 必然是前端传参或载入环节的问题。
 *       本脚本把这条链路在 Node 里**完整跑一遍**，不用麻烦用户点模拟器。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, 'duibai-app')

let NAV = []

/* ---------- 造一条真实的 script.list 记录（字段照云端实际返回的来） ---------- */
const SCRIPT_ID = '6ac0a49b4b9247e4653e6824'
const LIST_ITEM = {
  _id: SCRIPT_ID,
  article_id: '6ac0a4937ae7087f84470f3a',
  tone_code: 'podcast',
  toneName: '播客对谈',
  status: 'generated',
  line_count: 23,
  pending_confirm: 0,
  title: '3.1 数据链路层概述',
  preview: ['咱们今天聊数据链路层概述吧。', '好啊，这层听着就挺重要的。']
}
const LINES = Array.from({ length: 23 }, (_, i) => ({
  _id: 'line' + (i + 1),
  script_id: SCRIPT_ID,
  seq: i + 1,
  speaker: i % 2 === 0 ? 'A' : 'B',
  text: (i % 2 === 0 ? '甲' : '乙') + '的第 ' + (i + 1) + ' 句。',
  source_paragraph: (i % 3) + 1,
  flag: '',
  confirmed: true
}))

/* ---------- mock uniCloud ---------- */
let CALLS = []
function mockUniCloud () {
  const dispatch = (name, data) => {
    if (name === 'data' && data.action === 'script.list') {
      return { code: 0, data: { list: [LIST_ITEM], total: 1 } }
    }
    if (name === 'data' && data.action === 'script.get') {
      return { code: 0, data: { script: Object.assign({}, LIST_ITEM), lines: LINES, segments: [] } }
    }
    if (name === 'data' && data.action === 'daily.list') {
      return { code: 0, data: { today: null, list: [] } }
    }
    if (name === 'tts-synthesize') return { code: 0, data: { count: 0, batches: 0 } }
    return { code: 0, data: {} }
  }
  return {
    database: () => mkQuery(),
    callFunction: (opts) => {
      // ⚠️ uniCloud 是【回调风格】：api 层用 success/fail，不是 then。
      //    mock 必须真的去调 success，否则 Promise 永远不 resolve。
      CALLS.push(opts.name + ':' + ((opts.data && opts.data.action) || opts.data))
      const r = dispatch(opts.name, opts.data || {})
      setTimeout(() => { opts.success && opts.success({ result: r }) }, 0)
      return undefined
    }
  }
}
function mkQuery () {
  const q = {}
  for (const k of ['doc', 'where', 'orderBy', 'limit', 'skip', 'update', 'remove']) q[k] = () => mkQuery()
  q.get = cb => { const r = { data: [] }; cb && cb(r); return Promise.resolve(r) }
  q.count = cb => { const r = { total: 0 }; cb && cb(r); return Promise.resolve(r) }
  return q
}

function mockUni () {
  return {
    navigateTo: ({ url, fail }) => { NAV.push({ ok: true, url }); setTimeout(() => fail && fail({ errMsg: 'ok' }), 0) },
    redirectTo: ({ url }) => { NAV.push({ ok: false, url }) },
    navigateBack: () => {},
    switchTab: () => {},
    showToast: () => {},
    showModal: (o) => o && o.success && o.success({ confirm: false }),
    showActionSheet: () => {},
    setStorageSync: () => {},
    getStorageSync: (k) => (k === 'duibai_token' ? 'FAKE_TOKEN' : (k === 'duibai_user' ? { _id: 'u1' } : '')),
    removeStorageSync: () => {},
    getStorageInfoSync: () => ({ currentSize: 0, keys: [] })
  }
}

/* ---------- 模块注册表：把【真实的 api / utils 层】装进来，不能 mock 掉 ---------- */
const REG = {}
const normalize = n => String(n).replace(/^@\//, '')

/** 装载一个只依赖全局（uni / uniCloud）的真实模块，如 api/index.js、utils/nav.js */
function loadRealModule (rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const names = []
  const body = src.replace(
    /export\s+(const|function)\s+([A-Za-z_$][\w$]*)/g,
    (m, kind, n) => { names.push(n); return kind + ' ' + n }
  )
  // eslint-disable-next-line no-new-func
  const f = new Function('uni', 'uniCloud', body + '\n;return { ' + names.join(', ') + ' }')
  return f(mockUni(), mockUniCloud())
}

function mockImport (name) {
  const key = normalize(name)
  if (REG[key]) return REG[key]          // ← 真实模块优先
  const fn = () => {}
  return new Proxy(fn, {
    get (t, k) {
      if (k === 'then') return undefined
      if (k === Symbol.toPrimitive || k === 'toString') return () => '[mock]'
      return mockImport(name + '.' + String(k))
    },
    apply () { return mockImport(name + '()') }
  })
}

/** 按「模块路径 + 导出名」取真实实现；取不到才给通用 mock */
function mockOf (from, name) {
  const mod = REG[normalize(from)]
  if (mod && mod[name]) return mod[name]
  return mockImport(from + '#' + name)
}

function loadComponent (rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const scr = src.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]
  let body = scr
    .replace(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g, (m, names, from) =>
      names.split(',').map(x => {
        const parts = x.trim().split(/\s+as\s+/)
        const orig = parts[0].trim()
        const alias = (parts[1] || parts[0]).trim()
        return `const ${alias} = __mockOf(${JSON.stringify(from)}, ${JSON.stringify(orig)});`
      }).join('\n')
    )
    .replace(/import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"];?/g,
      (m, n, from) => `const ${n} = __mockOf(${JSON.stringify(from)}, 'default');`)
    .replace(/export\s+default\s*/, 'return ')
  // eslint-disable-next-line no-new-func
  const factory = new Function('__mockOf', 'uni', 'uniCloud', 'getCurrentPages', body)
  return factory(mockOf, mockUni(), mockUniCloud(), () => [])
}

function ctxOf (options) {
  const c = {}
  if (options.data) Object.assign(c, options.data.call(c) || {})
  for (const [k, fn] of Object.entries(options.methods || {})) if (typeof fn === 'function') c[k] = fn.bind(c)
  for (const [k, fn] of Object.entries(options.computed || {})) if (typeof fn === 'function') { try { c[k] = fn.call(c) } catch (e) {} }
  return c
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const withTimeout = (p, ms, tag) =>
  Promise.race([Promise.resolve(p), new Promise((_, rej) => setTimeout(() => rej(new Error('超时：' + tag)), ms))])
let fails = 0
const ok = (cond, msg, extra) => {
  console.log('  ' + (cond ? '✅' : '❌') + ' ' + msg + (extra ? '  → ' + extra : ''))
  if (!cond) fails++
}

console.log('='.repeat(66))
console.log('定点复现：从历史页点条目 → 结果页能否拿到 23 条台词')
console.log('='.repeat(66))

// ★ 关键：把真实的 api / utils 层装进注册表，组件里才不会被 mock 掉
REG['api/index.js'] = loadRealModule('api/index.js')
REG['utils/nav.js'] = loadRealModule('utils/nav.js')
console.log('\n已装载真实模块：api 导出 ' + Object.keys(REG['api/index.js']).length + ' 个，nav 导出 ' + Object.keys(REG['utils/nav.js']).join(','))

/* ===== 第 1 段 ===== */
console.log('\n【1】历史页 载入列表')
const hist = loadComponent('pages/history/history.vue')
const hctx = ctxOf(hist)
console.log('  可用钩子：onLoad=' + typeof hist.onLoad + ' onShow=' + typeof hist.onShow + ' reload=' + typeof hctx.reload)
try {
  if (typeof hctx.reload === 'function') await withTimeout(hctx.reload(), 3000, 'reload')
} catch (e) { console.log('  ⚠️ ' + e.message) }
await sleep(50)
const item = (hctx.list || [])[0]
ok(Array.isArray(hctx.list) && hctx.list.length > 0, '列表拿到记录', '共 ' + (hctx.list || []).length + ' 条')
ok(item && item._id === SCRIPT_ID, '记录的 _id 正确', item && String(item._id))
ok(item && item.title === LIST_ITEM.title, '记录的标题正确', item && String(item.title))

/* ===== 第 2 段：点它 → 跳转 URL 对不对 ===== */
console.log('\n【2】点该条目 → 跳转 URL')
NAV = []
hctx.open(item)
await sleep(30)
ok(NAV.length >= 1, '触发了一次跳转',
  NAV.length + ' 次调用' + (NAV.length > 1 ? '（navigateTo 失败后由 redirectTo 兜底，属预期）' : ''))
const url = (NAV[0] && NAV[0].url) || ''
ok(url.indexOf('script_id=' + SCRIPT_ID) >= 0, 'URL 里的 script_id 正确', url)
const q = {}
url.split('?')[1] && url.split('?')[1].split('&').forEach(kv => { const [a, b] = kv.split('='); q[a] = b })
ok(q.script_id === SCRIPT_ID, '解析出的 query.script_id 正确', q.script_id)

/* ===== 第 3 段：结果页用这个 query 载入 ===== */
console.log('\n【3】结果页 onLoad({script_id}) → 能否拿到台词')
const res = loadComponent('pages/result/result.vue')
const rctx = ctxOf(res)
try { await withTimeout(rctx.load(), 3000, 'result.load') } catch (e) { console.log('  ⚠️ ' + e.message) }
if (typeof res.onLoad === 'function') {
  try { await withTimeout(res.onLoad.call(rctx, { script_id: q.script_id }), 3000, 'result.onLoad') } catch (e) { console.log('  ⚠️ ' + e.message) }
}
await sleep(100)
ok(rctx.scriptId === SCRIPT_ID, '结果页收到的 scriptId 正确', rctx.scriptId)
ok(rctx.lines.length === 23, '台词载入成功（应为 23）', '实际 ' + rctx.lines.length + ' 条')
ok(rctx.title === LIST_ITEM.title, '标题正确', rctx.title)
ok(!!rctx.headerText, '页面标题非空（空的话会显示 EmptyState）', rctx.headerText)
ok(rctx.canSynthesize === true, '应显示「生成声音」入口', String(rctx.canSynthesize))
ok(rctx.mode === 'read', '无音频时为阅读节奏模式', rctx.mode)

console.log('\n' + '='.repeat(66))
console.log('【4】脏 id 必须被拦截（不许产生 ?script_id=undefined 这种 URL）')
const nav = REG['utils/nav.js']
const cases = [
  [{ scriptId: undefined, tag: 't' }, false, 'undefined'],
  [{ scriptId: '', tag: 't' }, false, '空串'],
  [{ scriptId: null, tag: 't' }, false, 'null'],
  [{ scriptId: 'undefined', tag: 't' }, false, '字符串 "undefined"'],
  [{ scriptId: 'abc123', tag: 't' }, true, '正常 script_id'],
  [{ episodeId: 'ep_20261003', tag: 't' }, true, '正常 episode_id'],
  [{ id: 'from_id_field', tag: 't' }, true, '容错：id 字段']
]
for (const [arg, shouldNav, label] of cases) {
  NAV = []
  nav.goDialogue(arg)
  const navigated = NAV.length > 0
  ok(navigated === shouldNav, (shouldNav ? '放行' : '拦截') + '：' + label,
    navigated ? NAV[0].url : '（无跳转）')
}

console.log('\n' + '='.repeat(66))
console.log(fails === 0 ? '✅ 全链路通过：历史 → 结果页 的传参与载入都正常，且脏 id 会被拦住' : '❌ 有 ' + fails + ' 处失败')
console.log('='.repeat(66))
process.exit(fails === 0 ? 0 : 1)
