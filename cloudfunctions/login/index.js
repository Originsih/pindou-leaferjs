const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 生成不重复的短 ID
async function generateShortId() {
  let shortId
  let exists = true
  let attempts = 0

  while (exists && attempts < 10) {
    shortId = 'PD' + Math.floor(100000 + Math.random() * 900000)
    const res = await db.collection('users').where({ shortId }).count()
    exists = res.total > 0
    attempts++
  }

  // 极端情况：连续 10 次都冲突，用时间戳兜底
  if (exists) {
    shortId = 'PD' + Date.now()
  }

  return shortId
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  if (!OPENID) {
    return { success: false, message: '获取用户身份失败' }
  }

  try {
    // 查用户是否存在
    const userRes = await db.collection('users').where({ _openid: OPENID }).get()

    if (userRes.data.length > 0) {
      return {
        success: true,
        user: userRes.data[0],
        isNew: false
      }
    }

    // 新用户，生成短 ID
    const shortId = await generateShortId()

    const now = new Date()
    const newUser = {
      _openid: OPENID,
      shortId: shortId,
      nickname: '拼豆爱好者',
      avatar: '',
      createTime: now,
      updateTime: now
    }

    const addRes = await db.collection('users').add({ data: newUser })

    return {
      success: true,
      user: { _id: addRes._id, ...newUser },
      isNew: true
    }
  } catch (err) {
    console.error('登录失败:', err)
    return {
      success: false,
      message: err.errMsg || err.message || JSON.stringify(err)
    }
  }
}