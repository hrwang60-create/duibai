'use strict'

/**
 * admin-users —— 用户管理
 * 入参：{ token, action, payload }
 *   action: list | search | setStatus | setRole | stat
 */

const common = require('common')
const { ERR, ok, fail, assertLogin, assertAdmin } = common

exports.main = common.wrap(async (event) => {
  const { action, payload } = event || {}
  const db = uniCloud.database()
  const _ = db.command
  const COL = db.collection('users')
  const P = payload || {}

  // 首次开通：**只在系统里一个管理员都没有时**，允许调用者把自己升级为 admin。
  // 之后永远返回拒绝 —— 所以不构成提权漏洞（这是一次性引导，不是后门）。
  if (action === 'bootstrap') {
    const uid = assertLogin(event)
    const adminCnt = await COL.where({ role: 'admin' }).count()
    if (adminCnt.total > 0) {
      return fail(ERR.FORBIDDEN, '已存在管理员，请让管理员在后台操作')
    }
    const r = await COL.doc(uid).update({ role: 'admin' })
    return ok({ role: 'admin', updated: r.updated })
  }

  await assertAdmin(db, event)

  if (action === 'list') {
    const page = Math.max(1, parseInt(P.page, 10) || 1)
    const size = Math.min(50, parseInt(P.size, 10) || 20)
    const cnt = await COL.count()
    const r = await COL.orderBy('created_at', 'desc')
      .skip((page - 1) * size).limit(size).get()
    return ok({ total: cnt.total, page, size, list: r.data || [] })
  }

  if (action === 'search') {
    if (!P.keyword) return fail(ERR.PARAM, '缺少 keyword')
    const re = new RegExp(String(P.keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const r = await COL.where(_.or([{ nickname: re }, { openid: P.keyword }]))
      .limit(50).get()
    return ok(r.data || [])
  }

  if (action === 'setStatus') {
    if (!P.uid) return fail(ERR.PARAM, '缺少 uid')
    const status = Number(P.status) === 1 ? 1 : 0
    const r = await COL.doc(P.uid).update({ status })
    return ok({ status, updated: r.updated })
  }

  if (action === 'setRole') {
    if (!P.uid) return fail(ERR.PARAM, '缺少 uid')
    const role = P.role === 'admin' ? 'admin' : 'user'
    const r = await COL.doc(P.uid).update({ role })
    return ok({ role, updated: r.updated })
  }

  // 管理首页用：用户数 / 生成任务数 / 成功率 / 平均耗时
  if (action === 'stat') {
    const userCnt = await COL.count()
    const scripts = db.collection('scripts')
    const scriptCnt = await scripts.count()
    const logs = db.collection('gen_logs')
    const okCnt = await logs.where({ ok: true }).count()
    const totalCnt = await logs.count()
    const recent = await logs.orderBy('created_at', 'desc').limit(200).get()
    const msList = (recent.data || []).map(x => x.ms).filter(x => typeof x === 'number')
    const avgMs = msList.length ? Math.round(msList.reduce((a, b) => a + b, 0) / msList.length) : 0
    return ok({
      users: userCnt.total,
      scripts: scriptCnt.total,
      success_rate: totalCnt.total ? +(okCnt.total / totalCnt.total * 100).toFixed(1) : 0,
      avg_ms: avgMs
    })
  }

  return fail(ERR.PARAM, '未知 action：' + action)
})
