const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  // 👈 核心修复：默认页面改成了你的真实首页
  const { scene, page = 'pages/drawing/index' } = event

  try {
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: scene || 'default',       // 参数，最大 32 个字符
      page: page,                      // 扫码后跳转的页面
      checkPath: false,                // 建议设为 false，跳过路径校验防误杀
      envVersion: 'release',           // 正式版 release；本地调试可临时改回 develop
      width: 430                       // 二维码宽度
    })

    const uploadRes = await cloud.uploadFile({
      cloudPath: `qrcodes/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`,
      fileContent: result.buffer
    })

    return {
      success: true,
      fileID: uploadRes.fileID
    }
  } catch (err) {
    console.error('生成小程序码失败', err)
    return { success: false, error: err }
  }
}