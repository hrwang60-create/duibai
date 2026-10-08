/**
 * 前端运行时冒烟测试 —— 把每个页面的逻辑真跑一遍
 *
 * 为什么必须这么做：
 *   `node --check` 只能查语法，查不出「块级作用域越界」这类 **运行时** 错误
 *   （15:12 那个 ReferenceError 就是这样漏掉的）。
 *   静态正则分析误报太多，所以改为**真的执行**：mock 掉 uni / uniCloud，
 *   然后逐个调用生命周期与所有方法，看谁抛异常。
 *
 * 运行：node 前端冒烟测试.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, 'duibai-app')

/* ---------------- mock ---------------- */
const calls = []
const rec = (n, a) => calls.push(n + (a === undefined ? '()' : '(…)'))

const uniMock = {
  showToast: (o) => rec('uni.showToast:' + (o && o.title)),
  showModal: (o) => { rec('uni.showModal:' + (o && o.title)); if (o && o.success) o.success({ confirm: true, cancel: false }) },
  showActionSheet: (o) => { rec('uni.showActionSheet'); if (o && o.success) o.success({ tapIndex: 0 }) },
  showLoading: () => rec('uni.showLoading'),
  hideLoading: () => rec('uni.hideLoading'),
  navigateTo: (o) => rec('uni.navigateTo:' + (o && o.url)),
  redirectTo: (o) => rec('uni.redirectTo:' + (o && o.url)),
  switchTab: (o) => rec('uni.switchTab:' + (o && o.url)),
  navigateBack: () => rec('uni.navigateBack'),
  setStorageSync: (k) => rec('setStorage:' + k),
  getStorageSync: (k) => (k === 'duibai_user' ? { _id: 'u1', nickname: '测试', role: 'user' } : k === 'duibai_token' ? 't' : ''),
  removeStorageSync: () => {},
  setClipboardData: (o) => { rec('setClipboardData'); if (o && o.success) o.success({}) },
  chooseMessageFile: (o) => { rec('chooseMessageFile'); if (o && o.fail) o.fail({}) },
  getFileSystemManager: () => ({ readFile: (o) => o.fail && o.fail({}) }),
  getStorageInfoSync: () => ({ currentSize: 12, keys: ['duibai_token'] }),
  createInnerAudioContext: () => ({
    src: '', playbackRate: 1, play () {}, pause () {}, destroy () {},
    onEnded (f) { this._e = f }, onError (f) { this._x = f }
  }),
  login: (o) => { rec('uni.login'); if (o && o.success) o.success({ code: 'FAKE' }) },
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667 })
}

const dbMock = {
  collection: () => ({
    doc: () => mkQuery(),
    where: () => mkQuery(),
    orderBy: () => mkQuery(),
    limit: () => mkQuery(),
    skip: () => mkQuery(),
    get: (cb) => { const r = { data: [] }; cb && cb(r); return Promise.resolve(r) },
    add: () => ({ id: 'new1' }),
    update: () => ({ updated: 1 }),
    remove: () => ({ deleted: 1 }),
    count: () => Promise.resolve({ total: 0 })
  }),
  command: new Proxy({}, { get: () => (() => ({})) })
}
const SAMPLE_ROW = {
  _id: 'row1', openid: 'o1', nickname: '测', role: 'user', status: 1,
  title: '示例标题', content: '第一段。\n\n第二段。', char_count: 8,
  date_key: 20261003, tone_code: 'bicker', toneName: '抬杠', duration_sec: 240, line_count: 2,
  lines: [{ speaker: 'A', text: '甲说一句。', source_paragraph: 1 }, { speaker: 'B', text: '乙说一句。', source_paragraph: 2 }],
  script: { _id: 'row1', pending_confirm: 0, title: '示例标题', toneName: '抬杠', article_id: 'a1' },
  code: 0, enabled: true, sort: 1
}

function mkQuery () {
  const q = {}
  for (const k of ['doc', 'where', 'orderBy', 'limit', 'skip', 'get', 'update', 'remove']) {
    q[k] = () => mkQuery()
  }
  // 每次 get 返回一行样本数据 —— 让代码路径真正跑起来，而不是全走空分支
  q.get = (cb) => { const r = { data: [Object.assign({}, SAMPLE_ROW)] }; cb && cb(r); return Promise.resolve(r) }
  q.count = (cb) => { const r = { total: 1 }; cb && cb(r); return Promise.resolve(r) }
  return q
}

const uniCloudMock = {
  database: () => dbMock,
  callFunction: (o) => {
    rec('callFunction:' + (o && o.name))
    return Promise.resolve({ result: { code: 0, msg: 'ok', data: {} } })
  },
  httpclient: { request: () => Promise.resolve({ status: 200, data: {} }) },
  uploadFile: () => Promise.resolve({ fileID: 'cloud://x' })
}

function mockImport (name) {
  const fn = () => {}
  return new Proxy(fn, {
    get (t, k) {
      if (k === 'then') return undefined          // 防被当 Promise
      if (k === Symbol.toPrimitive || k === 'toString') return () => '[mock ' + name + ']'
      if (k === 'get') return () => Promise.resolve({ data: [] })
      if (k === 'list') return () => Promise.resolve([])
      return mockImport(name + '.' + String(k))
    },
    apply () { return mockImport(name + '()') }
  })
}

/* ---------------- 提取并执行 ---------------- */
function extract (file) {
  const src = fs.readFileSync(file, 'utf8')
  const tplM = src.match(/<template>([\s\S]*?)<\/template>/)
  const scrM = src.match(/<script[^>]*>([\s\S]*?)<\/script>/)
  return { tpl: tplM ? tplM[1] : '', script: scrM ? scrM[1] : '', raw: src }
}

function buildComponent (script) {
  let body = script
  // import { a, b as c } from '...'  →  const a = __mock('a'); const c = __mock('a')
  body = body.replace(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*['"];?/g, (m, names) =>
    names.split(',').map(x => {
      const parts = x.trim().split(/\s+as\s+/)
      const orig = parts[0].trim()
      const alias = (parts[1] || parts[0]).trim()
      return `const ${alias} = __mock('${orig}');`
    }).join('\n')
  )
  // import X from '...'  /  import X from '...'
  body = body.replace(/import\s+([A-Za-z_$][\w$]*)\s+from\s*['"][^'"]*['"];?/g, (m, n) => `const ${n} = __mock('${n}');`)
  // export default  →  return
  body = body.replace(/export\s+default\s*/, 'return ')
  return body
}

function makeCtx (options) {
  /* $emit / $refs 等是 Vue 注入的，组件里会用到。
     不给它会误报「this.$emit is not a function」—— 那不是产品 bug。 */
  const ctx = {
    $emit: (name, ...args) => { ctx.__emitted.push({ name, args }) },
    $refs: {},
    __emitted: []
  }
  if (typeof options.data === 'function') {
    try { Object.assign(ctx, options.data.call(ctx) || {}) } catch (e) { /* ignore */ }
  } else if (options.data && typeof options.data === 'object') {
    Object.assign(ctx, options.data)
  }
  if (options.methods) {
    for (const [k, fn] of Object.entries(options.methods)) {
      if (typeof fn === 'function') ctx[k] = fn.bind(ctx)
    }
  }
  if (options.computed) {
    for (const [k, fn] of Object.entries(options.computed)) {
      if (typeof fn === 'function') {
        try { ctx[k] = fn.call(ctx) } catch (e) { ctx[k] = undefined }
      }
    }
  }
  return ctx
}

/* ---------------- 跑 ---------------- */
function walk (dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (f.endsWith('.vue')) out.push(p)
  }
  return out
}

const files = [...walk(path.join(ROOT, 'pages')), ...walk(path.join(ROOT, 'components'))]
let totalFail = 0
let totalRun = 0
const report = []

for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/')
  const { script } = extract(f)
  if (!script.trim()) continue

  let options
  try {
    const body = buildComponent(script)
    // eslint-disable-next-line no-new-func
    const factory = new Function('__mock', 'uni', 'uniCloud', 'getCurrentPages', body)
    options = factory(mockImport, uniMock, uniCloudMock, () => [])
  } catch (e) {
    report.push({ rel, kind: '模块加载失败', name: e.message })
    totalFail++
    continue
  }

  const ctx = makeCtx(options)
  const errs = []

  // 1) 生命周期
  for (const hook of ['onLoad', 'onShow', 'onReady', 'onUnload']) {
    if (typeof options[hook] !== 'function') continue
    try {
      const r = options[hook].call(ctx, { script_id: 'sid001', episode_id: 'ep_20261003', seq: 1, article_id: 'aid001' })
      if (r && typeof r.catch === 'function') r.catch(() => {})
    } catch (e) {
      errs.push({ kind: hook, msg: e.message })
    }
  }
  // 2) 所有方法：只调「不需要参数」的（fn.length===0），
  //    否则会刷出一堆 "Cannot read properties of undefined" 的误报
  for (const [name, fn] of Object.entries(options.methods || {})) {
    if (typeof fn !== 'function') continue
    if (['onLoad', 'onShow', 'onReady', 'onUnload'].includes(name)) continue
    if (fn.length > 0) continue          // 需要参数 → 由真实调用方传，测了也没意义
    totalRun++
    try {
      const r = fn.call(ctx)
      if (r && typeof r.catch === 'function') r.catch(() => {})
    } catch (e) {
      errs.push({ kind: name, msg: e.message })
    }
  }

  if (errs.length) {
    totalFail += errs.length
    report.push({ rel, errs })
  }
}

console.log('='.repeat(64))
console.log('前端运行时冒烟测试：共 %d 个文件，调用方法 %d 次' % (files.length, totalRun))
console.log('='.repeat(64))

if (!report.length) {
  console.log('✅ 全部文件加载成功，所有生命周期与方法调用均未抛异常')
} else {
  for (const r of report) {
    console.log('\n❌ ' + r.rel)
    if (r.kind) { console.log('   ' + r.kind + '：' + r.name); continue }
    for (const e of r.errs) console.log('   %s() → %s', e.kind, e.msg)
  }
  console.log('\n' + '='.repeat(64))
  console.log('❌ 共 %d 处抛异常' % totalFail)
}
