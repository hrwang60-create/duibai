'use strict'

/**
 * admin-tones —— 口吻模板管理
 * 入参：{ token, action, payload }
 *   action: list | add | update | toggle | remove
 *
 * 为什么这个管理页有价值：口吻模板里的 prompt_template 直接决定生成质量，
 * 管理端能改它，说明管理端不只是通用 CRUD。
 */

const common = require('common')
const { ERR, ok, fail, assertAdmin } = common

const FIELDS = ['code', 'name', 'description', 'prompt_template', 'sample', 'enabled', 'sort']

function pick (payload) {
  const out = {}
  FIELDS.forEach(k => { if (payload && payload[k] !== undefined) out[k] = payload[k] })
  return out
}

exports.main = common.wrap(async (event) => {
  const { action, payload } = event || {}
  const db = uniCloud.database()
  await assertAdmin(db, event)

  const COL = db.collection('tones')
  const P = payload || {}

  if (action === 'list') {
    const r = await COL.orderBy('sort', 'asc').limit(50).get()
    return ok(r.data || [])
  }

  if (action === 'add') {
    const doc = pick(P)
    if (!doc.code || !doc.name) return fail(ERR.PARAM, 'code 与 name 必填')
    const dup = await COL.where({ code: doc.code }).count()
    if (dup.total) return fail(ERR.PARAM, '口吻编码已存在：' + doc.code)
    doc.enabled = doc.enabled !== false
    doc.sort = doc.sort || 0
    const r = await COL.add(doc)
    return ok({ _id: r.id })
  }

  if (action === 'update') {
    if (!P._id) return fail(ERR.PARAM, '缺少 _id')
    const doc = pick(Object.assign({}, P))
    delete doc._id
    const r = await COL.doc(P._id).update(doc)
    return ok({ updated: r.updated })
  }

  if (action === 'toggle') {
    if (!P._id) return fail(ERR.PARAM, '缺少 _id')
    const cur = await COL.doc(P._id).get()
    const doc = cur.data && cur.data[0]
    if (!doc) return fail(ERR.NOT_FOUND, '口吻不存在')
    const r = await COL.doc(P._id).update({ enabled: !doc.enabled })
    return ok({ enabled: !doc.enabled, updated: r.updated })
  }

  if (action === 'remove') {
    if (!P._id) return fail(ERR.PARAM, '缺少 _id')
    await COL.doc(P._id).remove()
    return ok({ removed: true })
  }

  return fail(ERR.PARAM, '未知 action：' + action)
})
