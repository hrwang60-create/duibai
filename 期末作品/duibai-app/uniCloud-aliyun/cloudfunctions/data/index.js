'use strict'

/**
 * data —— 业务数据网关
 *
 * 为什么要有这个函数：客户端 schema 权限全部关闭，所有业务读写都过这里，
 * 权限统一在服务端判断（配合 common 里的令牌校验），不依赖 uni-id。
 *
 * 入参：{ token, action, payload }
 * action:
 *   article.add         新建文章（含段落切分落库）
 *   article.list        我的文章列表
 *   article.get         文章详情
 *   paragraph.list      某文章的段落
 *   paragraph.get       单个段落（出处回溯用）
 *   script.get          对话稿 + 对话条目
 *   script.list         我的对话稿列表
 *   line.update         修正单句台词
 *   line.confirm        确认可疑处
 *   feedback.add        提交反馈
 */

const common = require('common')
const { ERR, ok, fail, assertLogin } = common

/** 把文章正文切成段落（按空行优先，其次按句号聚合） */
function splitParagraphs (content) {
  const chunks = String(content)
    .split(/\r?\n\s*\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
  const out = []
  for (const c of chunks) {
    if (c.length <= 200) { out.push(c); continue }
    // 长段落按句号切，每段不超过约 200 字
    let buf = ''
    for (const s of c.split(/(?<=[。！？；])/)) {
      if ((buf + s).length > 200 && buf) { out.push(buf); buf = s } else { buf += s }
    }
    if (buf) out.push(buf)
  }
  return out
}

exports.main = common.wrap(async (event) => {
  const { action, payload } = event || {}
  const P = payload || {}
  const db = uniCloud.database()
  const _ = db.command

  /* ============================================================
   * ★ 公开只读接口 —— 必须在 assertLogin **之前** 处理。
   *
   * 为什么：这四个接口只返回运营预置的公开内容（Banner / 口吻模板 / 每日一集），
   * **不含任何用户数据**，所以不需要登录。
   * 如果放在 assertLogin 之后，未登录用户会：
   *   · 今日一集永远显示组件兜底数据
   *   · Banner 轮播整块不出现
   *   · 口吻列表退回内置兜底
   * 而「不用上传、打开就能听」正是本产品的冷启动承诺 ——
   * 让它对未登录用户失效，等于把产品的第一印象砸了。
   * ============================================================ */
  if (action === 'banner.list') {
    const r = await db.collection('banners').where({ enabled: true })
      .orderBy('sort', 'asc').limit(10).get()
    return ok((r.data || []).map(b => ({ _id: b._id, title: b.title || '', link: b.link || '' })))
  }
  if (action === 'tone.list') {
    const r = await db.collection('tones').where({ enabled: true })
      .orderBy('sort', 'asc').limit(20).get()
    return ok(r.data || [])
  }
  if (action === 'daily.list') {
    const now = new Date()
    const p2 = n => (n < 10 ? '0' + n : '' + n)
    const today = Number('' + now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()))
    const COL = db.collection('daily_episodes')
    let hit = await COL.where({ date_key: today, enabled: true }).orderBy('date_key', 'asc').limit(1).get()
    let todayRow = (hit.data && hit.data[0]) || null
    if (!todayRow) {
      hit = await COL.where({ enabled: true }).orderBy('date_key', 'desc').limit(1).get()
      todayRow = (hit.data && hit.data[0]) || null
    }
    const all = await COL.where({ enabled: true }).orderBy('date_key', 'desc').limit(30).get()
    const rows = (all.data || []).filter(x => !todayRow || x._id !== todayRow._id)
    return ok({ today: todayRow, list: rows, total: rows.length + (todayRow ? 1 : 0) })
  }
  if (action === 'daily.get') {
    if (!P._id) return fail(ERR.PARAM, '缺少 _id')
    const r = await db.collection('daily_episodes').doc(P._id).get()
    const e = r.data && r.data[0]
    if (!e) return fail(ERR.NOT_FOUND, '这一集还没准备好，换一集看看')
    return ok(e)
  }

  const uid = assertLogin(event)

  switch (action) {
    /* ---------------- 文章 ---------------- */
    case 'article.add': {      if (!P.content || !String(P.content).trim()) return fail(ERR.PARAM, '内容不能为空')
      const content = String(P.content)
      if (content.length > 20000) return fail(ERR.PARAM, '内容过长')
      // 标题：优先用调用方传入的；没传就取正文**第一行**（去掉 markdown 井号），
      //      而不是截断全文 —— 否则标题会变成「3.1 xxx\n\nxxx」这种带换行的怪东西
      let title = String(P.title || '').trim()
      if (!title) {
        const firstLine = String(content).split(/\r?\n/).map(s => s.trim()).find(Boolean) || ''
        title = firstLine.replace(/^#{1,6}\s*/, '').slice(0, 30) || '未命名'
      }
      const paras = splitParagraphs(content)
      const art = await db.collection('articles').add({
        user_id: uid, title, content,
        char_count: content.length, created_at: Date.now()
      })
      const COL = db.collection('paragraphs')
      for (let i = 0; i < paras.length; i++) {
        await COL.add({ article_id: art.id, user_id: uid, seq: i + 1, text: paras[i] })
      }
      return ok({ article_id: art.id, title, paragraphs: paras.length, char_count: content.length })
    }

    case 'article.list': {
      const page = Math.max(1, parseInt(P.page, 10) || 1)
      const size = Math.min(50, parseInt(P.size, 10) || 20)
      const cnt = await db.collection('articles').where({ user_id: uid }).count()
      const r = await db.collection('articles').where({ user_id: uid })
        .orderBy('created_at', 'desc').skip((page - 1) * size).limit(size).get()
      return ok({ total: cnt.total, list: r.data || [] })
    }

    case 'article.get': {
      if (!P._id) return fail(ERR.PARAM, '缺少 _id')
      const r = await db.collection('articles').doc(P._id).get()
      const doc = r.data && r.data[0]
      if (!doc) return fail(ERR.NOT_FOUND, '文章不存在')
      if (doc.user_id !== uid) return fail(ERR.FORBIDDEN, '无权访问')
      return ok(doc)
    }

    /* ---------------- 段落 ---------------- */
    case 'paragraph.list': {
      if (!P.article_id) return fail(ERR.PARAM, '缺少 article_id')
      const a = await db.collection('articles').doc(P.article_id).get()
      const art = a.data && a.data[0]
      if (!art || art.user_id !== uid) return fail(ERR.FORBIDDEN, '无权访问')
      const r = await db.collection('paragraphs').where({ article_id: P.article_id })
        .orderBy('seq', 'asc').limit(300).get()
      return ok(r.data || [])
    }

    case 'paragraph.get': {
      if (!P._id) return fail(ERR.PARAM, '缺少 _id')
      const r = await db.collection('paragraphs').doc(P._id).get()
      const doc = r.data && r.data[0]
      if (!doc) return fail(ERR.NOT_FOUND, '段落不存在')
      if (doc.user_id !== uid) return fail(ERR.FORBIDDEN, '无权访问')
      return ok(doc)
    }

    /* ---------------- 对话稿 ---------------- */
    case 'script.remove': {
      if (!P.script_id) return fail(ERR.PARAM, '缺少 script_id')
      const sr = await db.collection('scripts').doc(P.script_id).get()
      const sc = sr.data && sr.data[0]
      if (!sc) return fail(ERR.NOT_FOUND, '对话稿不存在')
      if (sc.user_id !== uid) return fail(ERR.FORBIDDEN, '无权删除')
      // 级联删除：台词 → 音频分段 → 稿件本体
      await db.collection('dialogue_lines').where({ script_id: P.script_id }).remove()
      await db.collection('audio_segments').where({ script_id: P.script_id }).remove()
      await db.collection('scripts').doc(P.script_id).remove()
      return ok({ deleted: true })
    }

    case 'script.get': {
      if (!P.script_id) return fail(ERR.PARAM, '缺少 script_id')
      const s = await db.collection('scripts').doc(P.script_id).get()
      const script = s.data && s.data[0]
      if (!script) return fail(ERR.NOT_FOUND, '对话稿不存在')
      if (script.user_id !== uid) return fail(ERR.FORBIDDEN, '无权访问')
      const lines = await db.collection('dialogue_lines')
        .where({ script_id: P.script_id }).orderBy('seq', 'asc').limit(500).get()
      const segs = await db.collection('audio_segments')
        .where({ script_id: P.script_id }).limit(500).get()

      // 补上文章标题与口吻名（结果页顶部要显示），避免前端再查两次
      let title = '未命名文章'
      let toneName = script.tone_code
      if (script.article_id) {
        const a = await db.collection('articles').doc(script.article_id)
          .field({ title: true }).get()
        if (a.data && a.data[0]) title = a.data[0].title || title
      }
      const t = await db.collection('tones').where({ code: script.tone_code })
        .field({ name: true }).limit(1).get()
      if (t.data && t.data[0]) toneName = t.data[0].name || toneName

      return ok({
        script: Object.assign({}, script, { title, toneName }),
        lines: lines.data || [],
        segments: segs.data || []
      })
    }

    case 'script.list': {
      const page = Math.max(1, parseInt(P.page, 10) || 1)
      const size = Math.min(50, parseInt(P.size, 10) || 20)
      const cnt = await db.collection('scripts').where({ user_id: uid }).count()
      const r = await db.collection('scripts').where({ user_id: uid })
        .orderBy('created_at', 'desc').skip((page - 1) * size).limit(size).get()
      const list = r.data || []

      // 一次性补上文章标题与口吻名，避免前端逐条再查一次（N+1）
      const aids = [...new Set(list.map(x => x.article_id).filter(Boolean))]
      const tcs = [...new Set(list.map(x => x.tone_code).filter(Boolean))]
      const arts = aids.length
        ? ((await db.collection('articles').where({ _id: _.in(aids) })
            .field({ title: true }).limit(100).get()).data || [])
        : []
      const tones = tcs.length
        ? ((await db.collection('tones').where({ code: _.in(tcs) })
            .field({ code: true, name: true }).limit(50).get()).data || [])
        : []
      const amap = {}
      arts.forEach(a => { amap[a._id] = a.title })
      const tmap = {}
      tones.forEach(t => { tmap[t.code] = t.name })

      return ok({
        total: cnt.total,
        list: list.map(s => Object.assign({}, s, {
          title: amap[s.article_id] || '未命名文章',
          toneName: tmap[s.tone_code] || s.tone_code
        }))
      })
    }

    /* ---------------- 单句修正与确认 ---------------- */
    case 'line.update': {
      if (!P._id) return fail(ERR.PARAM, '缺少 _id')
      const text = String(P.text == null ? '' : P.text).trim()
      if (!text) return fail(ERR.PARAM, '台词不能为空')
      if (text.length > 500) return fail(ERR.PARAM, '台词过长')
      const cur = await db.collection('dialogue_lines').doc(P._id).get()
      const line = cur.data && cur.data[0]
      if (!line) return fail(ERR.NOT_FOUND, '条目不存在')
      if (line.user_id !== uid) return fail(ERR.FORBIDDEN, '无权修改')
      // 改过之后视为已验证；旧音频作废，等前端触发「重做这句」
      await db.collection('audio_segments').where({ line_id: P._id }).remove()
      await db.collection('dialogue_lines').doc(P._id).update({
        text, confirmed: true, flag: 'term'
      })
      return ok({ _id: P._id, text })
    }

    case 'line.confirm': {
      if (!P._id) return fail(ERR.PARAM, '缺少 _id')
      const cur = await db.collection('dialogue_lines').doc(P._id).get()
      const line = cur.data && cur.data[0]
      if (!line) return fail(ERR.NOT_FOUND, '条目不存在')
      if (line.user_id !== uid) return fail(ERR.FORBIDDEN, '无权操作')
      if (!line.flag) return fail(ERR.PARAM, '该条目未被标记为待确认')
      const confirmed = P.confirmed !== false
      await db.collection('dialogue_lines').doc(P._id).update({ confirmed })
      const left = await db.collection('dialogue_lines')
        .where({ script_id: line.script_id, flag: _.neq(''), confirmed: false }).count()
      await db.collection('scripts').doc(line.script_id).update({ pending_confirm: left.total })
      return ok({ confirmed, pending_confirm: left.total })
    }

    /* ---------------- 反馈 ---------------- */




    case 'feedback.add': {
      const content = String(P.content == null ? '' : P.content).trim()
      if (!content) return fail(ERR.PARAM, '反馈内容不能为空')
      const r = await db.collection('feedbacks').add({
        user_id: uid, content, contact: P.contact || '',
        handled: false, created_at: Date.now()
      })
      return ok({ _id: r.id })
    }

    default:
      return fail(ERR.PARAM, '未知 action：' + action)
  }
})
