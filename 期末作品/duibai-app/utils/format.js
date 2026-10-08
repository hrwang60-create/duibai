/**
 * 通用格式化工具
 */

/** 时间戳 → 09-28 10:20 / 今天 10:20 */
export function formatTime (ts) {
	if (!ts) return ''
	const d = new Date(Number(ts))
	const now = new Date()
	const p = n => (n < 10 ? '0' + n : '' + n)
	const hm = p(d.getHours()) + ':' + p(d.getMinutes())
	const sameDay = d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
	if (sameDay) return '今天 ' + hm
	return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + hm
}

/** 状态码 → 中文 */
export const STATUS_TEXT = {
	generated: '待确认',
	confirmed: '待合成',
	audio_ready: '可播放',
	failed: '已失败'
}

export function statusText (s) {
	return STATUS_TEXT[s] || '未知'
}

/** 截断文本 */
export function ellipsis (str, n) {
	if (!str) return ''
	const s = String(str)
	return s.length > n ? s.slice(0, n) + '…' : s
}

/** 口吻编码 → 中文名（兜底用） */
export const TONE_FALLBACK = [
	{ _id: 't1', code: 'teacher_student', name: '师生', description: '老师带着学生一问一答', sample: '学生：等下，这两个阶段是分开干的？' },
	{ _id: 't2', code: 'bicker', name: '抬杠', description: '两人各持一边，争论中讲清事实', sample: '甲：那按你这么说，中午太阳最大岂不是最快？' },
	{ _id: 't3', code: 'elder_young', name: '老少', description: '长辈和年轻人对话，爱打比方', sample: '甲：这就跟家里烧水一个道理。' },
	{ _id: 't4', code: 'interview', name: '访谈', description: '主持人提问，嘉宾回答', sample: '甲：那这里最关键的一步是哪一步？' },
	{ _id: 't5', code: 'podcast', name: '播客对谈', description: '熟人闲聊式对谈，轻松随意', sample: '乙：哎这个我之前真理解错了。' },
	{ _id: 't6', code: 'bedtime', name: '睡前', description: '语速慢、句子短、语气轻', sample: '甲：简单说，就是……' }
]

/* ============================================================
 * 「上次看到哪」—— 首页续听条与结果页共用
 *
 * 存的是 JSON：{ type:'s'|'e', id, at, i, text }
 *   type 's' = 用户自己生成的对谈（script_id）
 *   type 'e' = 每日一集（episode_id）
 *   at   = 上次看的时刻（首页显示「昨天/今天 HH:MM」）
 *   i    = 听到第几句（首页显示「听到第 N 句」）
 *   text = 当时那一句（首页显示台词，单行省略）
 *
 * ⚠️ 兼容旧格式：早期存的是字符串 's:xxx' / 'e:xxx'，
 *    读的时候要能认出来，否则老用户会突然丢失续听记录。
 * ============================================================ */

export const LAST_VIEW_KEY = 'duibai_last_view'

export function saveLastView (obj) {
  try {
    if (!obj || !obj.type || !obj.id) return
    uni.setStorageSync(LAST_VIEW_KEY, JSON.stringify({
      type: obj.type,
      id: obj.id,
      at: obj.at || Date.now(),
      i: typeof obj.i === 'number' ? obj.i : 0,
      text: obj.text || ''
    }))
  } catch (e) { /* 写不进去不影响主流程 */ }
}

/** 读上次看到哪；返回 null 表示没有。兼容旧的 's:xxx' 字符串格式。 */
export function readLastView () {
  try {
    const raw = uni.getStorageSync(LAST_VIEW_KEY)
    if (!raw) return null
    if (typeof raw === 'object') return raw
    // 旧格式：'s:xxxxx' / 'e:xxxxx'
    const s = String(raw)
    const i = s.indexOf(':')
    if (i > 0) {
      return { type: s.slice(0, i), id: s.slice(i + 1), at: 0, i: 0, text: '' }
    }
    return null
  } catch (e) { return null }
}

/** 「昨天 20:14」/「今天 09:03」/「10-02 21:40」 */
export function lastViewWhen (ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = n => (n < 10 ? '0' + n : '' + n)
  const hm = p(d.getHours()) + ':' + p(d.getMinutes())
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  if (isToday) return '今天 ' + hm
  const y = new Date(Date.now() - 86400000)
  if (d.toDateString() === y.toDateString()) return '昨天 ' + hm
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + hm
}
