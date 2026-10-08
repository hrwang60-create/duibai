/**
 * 跳转工具
 *
 * 为什么要它：踩过两个坑，都在这里根治。
 *
 * 坑 1：脏 id 直接拼进 URL。
 *   `?script_id=undefined` → 结果页 `doc("undefined").get()` 查不到
 *   → 报出极具误导性的「对话稿不存在」，而且**错误发生在另一个页面**，
 *   排查时完全想不到是入口处没检查。所以**入口必须拦**。
 *
 * 坑 2：`navigateTo` 在页面栈满（小程序上限 10 层）时会静默失败，
 *   表现是「点了没反应，还停在上一页」，也很容易被误判成别的问题。
 */

/** id 是否可用（空串 / undefined / null / 字符串 "undefined" 都不算） */
function badId (v) {
  if (v === undefined || v === null) return true
  const s = String(v).trim()
  return !s || s === 'undefined' || s === 'null'
}

export function safeNavigate (url, tag = '') {
  uni.navigateTo({
    url,
    fail: (e) => {
      console.warn('[nav] navigateTo 失败（页面栈可能已满），改用 redirectTo' + (tag ? ' · ' + tag : ''), e && e.errMsg)
      uni.redirectTo({ url })
    }
  })
}

/**
 * 打开一场对谈。scriptId 与 episodeId 二选一。
 *
 * ⚠️ 任何一个 id 缺失都会**在这里被拦住**并给出明确提示，
 *    绝不会产生 `?script_id=undefined` 这种脏 URL。
 */
export function goDialogue (opts) {
  const o = opts || {}
  // 容错：万一某个接口返回的是 id 而不是 _id
  const scriptId = o.scriptId || o.id || o._id
  const episodeId = o.episodeId || o.epId

  if (!badId(episodeId) && badId(scriptId)) {
    return safeNavigate('/pages/result/result?episode_id=' + encodeURIComponent(episodeId), o.tag)
  }
  if (!badId(scriptId) && badId(episodeId)) {
    return safeNavigate('/pages/result/result?script_id=' + encodeURIComponent(scriptId), o.tag)
  }

  console.warn('[nav] goDialogue 收到空标识，已拦截 ·', JSON.stringify(o))
  uni.showToast({ title: '这条内容缺少标识，打不开', icon: 'none' })
  return null
}
