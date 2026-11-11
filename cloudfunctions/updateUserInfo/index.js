const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const NICK_MAX = 20
const AVATAR_MAX = 512

// 昵称会展示在广场，属于 UGC，需要过内容安全检测。
// 检测接口不可用时放行并打日志，避免一次接口波动导致所有人都改不了资料。
async function checkNickname(nickname, openid) {
  const text = String(nickname || '').trim()
  if (!text) return { ok: false, msg: '昵称不能为空' }
  if (text.length > NICK_MAX) return { ok: false, msg: `昵称不能超过 ${NICK_MAX} 个字` }

  let res
  try {
    res = await cloud.openapi.security.msgSecCheck({
      openid,
      scene: 1,
      version: 2,
      content: text
    })
  } catch (e) {
    console.warn('msgSecCheck 不可用，跳过昵称检测:', e && (e.errMsg || e.message))
    return { ok: true, text }
  }

  const suggest = res && res.result && res.result.suggest
  if (!suggest || suggest === 'pass') return { ok: true, text }
  return { ok: false, msg: '昵称含敏感信息，请修改后重试' }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { nickname, avatar } = event

  if (!OPENID) return { success: false, msg: '获取用户身份失败' }

  const nickCheck = await checkNickname(nickname, OPENID)
  if (!nickCheck.ok) return { success: false, msg: nickCheck.msg }

  const safeNickname = nickCheck.text
  const safeAvatar = String(avatar || '').slice(0, AVATAR_MAX)

  try {
    // 1. 更新 users 集合
    const userRes = await db.collection('users').where({ _openid: OPENID }).get()
    
    if (userRes.data.length > 0) {
      // 有记录则更新
      await db.collection('users').where({ _openid: OPENID }).update({
        data: {
          nickname: safeNickname,
          avatar: safeAvatar,
          updateTime: db.serverDate()
        }
      })
    } else {
      // 没记录则新建
      await db.collection('users').add({
        data: {
          _openid: OPENID,
          nickname: safeNickname,
          avatar: safeAvatar,
          shortId: 'PD' + Math.floor(100000 + Math.random() * 900000),
          createTime: db.serverDate()
        }
      })
    }

    // 2. 同步更新 works 集合里该作者的所有作品
    await db.collection('works').where({ _openid: OPENID }).update({
      data: {
        authorNick: safeNickname,
        authorAvatar: safeAvatar
      }
    })

    return { success: true }
  } catch (err) {
    console.error('数据库操作失败:', err)
    return { success: false, msg: err.errMsg || err.message || '数据库操作异常' }
  }
}