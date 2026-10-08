'use strict'

/**
 * login —— 微信登录
 *
 * 入参：{ code, nickname?, avatar? }
 * 出参：{ code:0, data:{ uid, token, user } }
 *
 * 流程：code → 微信 jscode2session → openid → 查/建 users → 签发令牌
 *
 * ⚠️ 密钥放置：AppID 与 AppSecret 必须放在云函数环境变量里，不要写进代码。
 *    在 uniCloud 控制台 → 云函数 → login → 环境变量，添加：
 *      WX_APPID  = wx5487ac4883f63cea
 *      WX_SECRET = <你自己生成的 AppSecret>
 *      TOKEN_SECRET = <随便一串足够长的随机字符串>
 *    前端永远拿不到这些值。
 */

const common = require('common')
const appConfig = require('app-config')

const { ERR, ok, fail, signToken } = common

async function jscode2session (code) {
  // AppID 不是密钥，给默认值；WX_SECRET 才是密钥，优先取云函数环境变量
  const appid = appConfig.get('WX_APPID', 'wx5487ac4883f63cea')
  const secret = appConfig.get('WX_SECRET')
  if (!secret) {
    const e = new Error('未配置 WX_SECRET（可在云函数环境变量或 app-config/config.json 里填）')
    e.errorCode = ERR.INTERNAL
    throw e
  }
  const res = await uniCloud.httpclient.request(
    'https://api.weixin.qq.com/sns/jscode2session',
    {
      method: 'GET',
      data: { appid, secret, js_code: code, grant_type: 'authorization_code' },
      dataType: 'json',
      timeout: 8000
    }
  )
  const data = res.data || {}
  if (!data.openid) {
    const e = new Error('微信登录失败：' + (data.errmsg || '未返回 openid'))
    e.errorCode = ERR.UNAUTHORIZED
    throw e
  }
  return data.openid
}

exports.main = common.wrap(async (event, context) => {
  const { code, nickname, avatar } = event || {}
  if (!code) return fail(ERR.PARAM, '缺少 code')

  const openid = await jscode2session(code)
  const db = uniCloud.database()
  const now = Date.now()

  const found = await db.collection('users').where({ openid }).limit(1).get()
  let user = found.data && found.data[0]

  if (!user) {
    const add = await db.collection('users').add({
      openid,
      nickname: nickname || '听友',
      avatar: avatar || '',
      role: 'user', // 管理员由数据库里手工改成 admin
      status: 1,
      created_at: now,
      last_login: now
    })
    const again = await db.collection('users').doc(add.id).get()
    user = again.data[0]
  } else {
    if (user.status !== 1) return fail(ERR.FORBIDDEN, '该账号已被封禁')
    await db.collection('users').doc(user._id).update({ last_login: now })
  }

  return ok({
    uid: user._id,
    token: signToken(user._id),
    user: {
      _id: user._id,
      nickname: user.nickname,
      avatar: user.avatar,
      role: user.role
    }
  })
})
