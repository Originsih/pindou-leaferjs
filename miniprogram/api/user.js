// api/user.js
import { uploadFile } from './cloud'

export const userApi = {
  // 登录获取用户信息
  login() {
    return wx.cloud.callFunction({ name: 'login' }).then(res => {
      if (res.result && res.result.success) {
        // 顺手把 openid 存进本地
        wx.setStorageSync('openid', res.result.user._openid)
        return res.result.user
      }
      throw new Error('登录失败')
    })
  },

  // 上传头像到云存储
  uploadAvatar(filePath) {
    const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
    return uploadFile(filePath, cloudPath)
  },

  // 更新用户资料
  updateProfile(nickname, avatar) {
    return wx.cloud.callFunction({
      name: 'updateUserInfo',
      data: { nickname, avatar }
    }).then(res => {
      if (res.result && res.result.success) {
        return res.result
      }
      throw new Error((res.result && res.result.msg) || '更新失败')
    })
  }
}