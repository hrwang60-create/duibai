'use strict'

/**
 * admin-banners —— Banner 管理
 * 入参：{ token, action, payload }
 *   action: list | add | update | remove | toggle
 * 所有写操作都要求管理员；云函数里的校验才是真正的安全边界，前端校验只算体验。
 */

const common = require('common')
const { ERR, ok, fail, assertAdmin } = common

const FIELDS = ['title', 'image', 'link', 'sort', 'enabled', 'start_at', 'end_at']

function pick (payload) {
  const out = {}
  FIELDS.forEach(k => { if (payload && payload[k] !== undefined) out[k] = payload[k] })
  return out
}

exports.main = common.wrap(async (event) => {
  const { action, payload } = event || {}
  const db = uniCloud.database()
  await assertAdmin(db, event)

  const COL = db.collection('banners')

  if (action === 'list') {
    const r = await COL.orderBy('sort', 'asc').limit(100).get()
    return ok(r.data || [])
  }

  if (action === 'add') {
    const doc = pick(payload)
    if (!doc.title || !doc.image) return fail(ERR.PARAM, 'title 与 image 必填')
    doc.sort = doc.sort || 0
    doc.enabled = doc.enabled !== false
    doc.created_at = Date.now()
    const r = await COL.add(doc)
    return ok({ _id: r.id })
  }

  if (action === 'update') {
    if (!payload || !payload._id) return fail(ERR.PARAM, '缺少 _id')
    const { _id, ...rest } = payload
    const r = await COL.doc(_id).update(pick(rest))
    return ok({ updated: r.updated })
  }

  if (action === 'toggle') {
    if (!payload || !payload._id) return fail(ERR.PARAM, '缺少 _id')
    const cur = await COL.doc(payload._id).get()
    const doc = cur.data && cur.data[0]
    if (!doc) return fail(ERR.NOT_FOUND, 'Banner 不存在')
    const r = await COL.doc(payload._id).update({ enabled: !doc.enabled })
    return ok({ enabled: !doc.enabled, updated: r.updated })
  }

  if (action === 'remove') {
    if (!payload || !payload._id) return fail(ERR.PARAM, '缺少 _id')
    await COL.doc(payload._id).remove()
    return ok({ removed: true })
  }

  return fail(ERR.PARAM, '未知 action：' + action)
})
