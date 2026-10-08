'use strict'

/**
 * 「对白听文」云函数公共模块
 * 职责：统一响应体、错误码、令牌签发与校验、登录/管理员守卫。
 *
 * ⚠️ 安全设计说明（写进报告可用）：
 * 客户端传来的 uid 一律不可信。因此登录成功后由 login 云函数签发一个
 * HMAC-SHA256 签名的令牌，其余云函数校验签名后才认这个 uid。
 * 签名密钥只存在于云函数环境变量 TOKEN_SECRET 中，前端拿不到。
 */

const crypto = require('crypto')
const appConfig = require('app-config')

// 读取优先级：云函数环境变量 > app-config/config.json > 开发默认值
const SECRET = appConfig.get('TOKEN_SECRET', 'duibai-dev-secret-change-me')
const TTL = 7 * 24 * 3600 * 1000 // 7 天

/** 错误码（与接口设计一一对应） */
const ERR = {
  PARAM: 'PARAM_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  PENDING_CONFIRMATION: 'PENDING_CONFIRMATION',
  NOT_SUITABLE_FOR_AUDIO: 'NOT_SUITABLE_FOR_AUDIO',
  TTS_UNAVAILABLE: 'TTS_UNAVAILABLE',
  BACKEND_UNAVAILABLE: 'BACKEND_UNAVAILABLE',
  INTERNAL: 'INTERNAL_ERROR'
}

/** 成功响应 */
function ok (data, extra) {
  return Object.assign({ code: 0, msg: 'ok', data: data === undefined ? null : data }, extra || {})
}

/** 失败响应 */
function fail (error, message, extra) {
  return Object.assign({ code: -1, error: error, message: message || '' }, extra || {})
}

/* ---------------- 令牌 ---------------- */

function b64 (buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64 (str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Buffer.from(str, 'base64').toString('utf8')
}
function hmac (payload) {
  return b64(crypto.createHmac('sha256', SECRET).update(payload).digest())
}

/** 签发令牌：uid + 过期时间 + 签名 */
function signToken (uid, ttl) {
  const payload = `${uid}.${Date.now() + (ttl || TTL)}`
  return `${b64(payload)}.${hmac(payload)}`
}

/** 校验令牌，返回 uid 或 null */
function verifyToken (token) {
  if (!token || typeof token !== 'string') return null
  const i = token.lastIndexOf('.')
  if (i < 0) return null
  let payload
  try {
    payload = unb64(token.slice(0, i))
  } catch (e) {
    return null
  }
  const expect = hmac(payload)
  const got = token.slice(i + 1)
  // 定长比较，避免时序侧信道
  if (expect.length !== got.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(got))) return null
  const parts = payload.split('.')
  if (parts.length !== 2) return null
  if (Number(parts[1]) < Date.now()) return null // 过期
  return parts[0]
}

/* ---------------- 守卫 ---------------- */

/**
 * 取当前登录用户 _id。
 * 客户端需在 event 里带 token；校验失败返回 null。
 */
function currentUid (event) {
  return verifyToken(event && event.token)
}

/** 断言已登录，否则抛出 */
function assertLogin (event) {
  const uid = currentUid(event)
  if (!uid) {
    const e = new Error('未登录或登录已过期')
    e.errorCode = ERR.UNAUTHORIZED
    throw e
  }
  return uid
}

/** 断言管理员，否则抛出 */
async function assertAdmin (db, event) {
  const uid = assertLogin(event)
  const r = await db.collection('users').doc(uid).get()
  const u = r.data && r.data[0]
  if (!u || u.role !== 'admin') {
    const e = new Error('需要管理员权限')
    e.errorCode = ERR.FORBIDDEN
    throw e
  }
  if (u.status !== 1) {
    const e = new Error('该账号已被封禁')
    e.errorCode = ERR.FORBIDDEN
    throw e
  }
  return uid
}

/** 统一异常包装：把 assert* 抛出的错误转成响应体 */
function wrap (fn) {
  return async function (event, context) {
    try {
      return await fn(event, context)
    } catch (e) {
      const code = e.errorCode || ERR.INTERNAL
      console.error('[duibai] cloud function error:', code, e.message, e.stack)
      return fail(code, e.message)
    }
  }
}

module.exports = { ERR, ok, fail, signToken, verifyToken, currentUid, assertLogin, assertAdmin, wrap }
