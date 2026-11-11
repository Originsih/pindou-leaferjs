// utils/choose-media.js
//
// 统一封装「选择图片」。
// 隐私保护指引未配置、或用户拒绝授权时，wx.chooseMedia 会直接 fail；
// 原来页面没有 fail 回调，用户点了「上传图片」会完全没反应，很难排查。
// 这里统一处理：用户取消 → 静默返回 null；权限问题 → 明确引导去设置。

function showPrivacyTip() {
  wx.showModal({
    title: '需要相册/相机权限',
    content: '选择图片需要授权。可在右上角「···」→「设置」中开启相册/相机权限后重试。',
    confirmText: '去设置',
    success: (r) => {
      if (r.confirm) wx.openSetting({})
    }
  })
}

/**
 * 选择一张图片
 * @returns {Promise<String|null>} 临时文件路径；用户主动取消时返回 null
 */
function chooseImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res && res.tempFiles && res.tempFiles[0]
        const path = file && file.tempFilePath
        if (path) resolve(path)
        else reject(new Error('没有取到图片，请重试'))
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || ''

        // 用户主动取消，不算失败
        if (msg.indexOf('cancel') >= 0) {
          resolve(null)
          return
        }
        // 隐私协议未授权 / 权限被拒
        if (/privacy|authorize|deny|permission/i.test(msg)) {
          showPrivacyTip()
          reject(new Error('未获得相册/相机权限'))
          return
        }
        reject(new Error(msg || '选择图片失败'))
      }
    })
  })
}

module.exports = { chooseImage, showPrivacyTip }
