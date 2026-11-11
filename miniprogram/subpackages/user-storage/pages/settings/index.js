import { userApi } from '../../../../api/user'
import { workApi } from '../../../../api/work'
const { showPrivacyTip } = require('../../../../utils/choose-media')

Page({
  data: {
    statusBarHeight: 0,
    userInfo: {
      nickname: '',
      avatar: ''
    },
    isChoosingAvatar: false,
    isAdmin: false
  },

  _tempAvatarPath: '',

  onLoad() {
    const sys = wx.getWindowInfo()
    const userInfo = wx.getStorageSync('userInfo') || {}
    
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      userInfo: {
        nickname: userInfo.nickname || '',
        avatar: userInfo.avatar || ''
      }
    })

    this.checkAdmin()
  },

  // 只有管理员才显示「内容审核」入口（服务端还会再次校验身份 + 口令）
  checkAdmin() {
    workApi.checkAdmin()
      .then(isAdmin => {
        if (this.data.isAdmin !== !!isAdmin) {
          this.setData({ isAdmin: !!isAdmin })
        }
        if (!isAdmin) {
          // 方便排查：把当前 openid 打到控制台，加进 admins 名单即可
          console.warn('[admin] 当前用户不是管理员，openid =', wx.getStorageSync('openid') || '(未获取)')
        }
      })
      .catch((e) => {
        // 大概率是 works 云函数还没部署
        console.warn('[admin] checkAdmin 调用失败：', (e && e.message) || e)
      })
  },

  goAdmin() {
    wx.navigateTo({ url: '/subpackages/user-storage/pages/admin/index' })
  },

  goBack() {
    wx.navigateBack()
  },

  // 选择头像并转 Base64 预览
  onChooseAvatar(e) {
    if (this.data.isChoosingAvatar) return
    const { avatarUrl } = e.detail
    if (!avatarUrl) {
      this.setData({ isChoosingAvatar: false })
      return
    }

    this.setData({ isChoosingAvatar: true })

    wx.getFileSystemManager().readFile({
      filePath: avatarUrl,
      encoding: 'base64',
      success: (res) => {
        const base64Url = 'data:image/jpeg;base64,' + res.data
        
        this.setData({
          'userInfo.avatar': base64Url, 
          isChoosingAvatar: false
        })
        this._tempAvatarPath = avatarUrl
      },
      fail: () => {
        this.setData({
          'userInfo.avatar': avatarUrl,
          isChoosingAvatar: false
        })
        this._tempAvatarPath = avatarUrl
      }
    })
  },

  onNicknameInput(e) {
    this.setData({
      'userInfo.nickname': e.detail.value
    })
  },

  // 头像选择失败（例如隐私协议未授权）时给出明确提示
  onChooseAvatarError(e) {
    const msg = (e && e.detail && e.detail.errMsg) || ''
    console.error('选择头像失败', msg)
    this.setData({ isChoosingAvatar: false })
    if (/privacy|authorize|deny|permission/i.test(msg)) {
      showPrivacyTip()
    } else if (msg.indexOf('cancel') < 0) {
      wx.showToast({ title: '选择头像失败', icon: 'none' })
    }
  },

  async saveProfile() {
    const { userInfo } = this.data
    
    if (!userInfo.avatar) return wx.showToast({ title: '请选择头像', icon: 'none' })
    if (!userInfo.nickname || !userInfo.nickname.trim()) return wx.showToast({ title: '请输入昵称', icon: 'none' })

    wx.showLoading({ title: '保存中...', mask: true })

    try {
      let finalAvatar = userInfo.avatar

      // 👈 极简：调用 API 上传头像
      if (this._tempAvatarPath) {
        finalAvatar = await userApi.uploadAvatar(this._tempAvatarPath)
      }

      // 👈 极简：调用 API 更新资料
      await userApi.updateProfile(userInfo.nickname.trim(), finalAvatar)

      // 更新本地缓存和全局
      const newUserInfo = { 
        ...wx.getStorageSync('userInfo'), 
        nickname: userInfo.nickname.trim(),
        avatar: finalAvatar 
      }
      wx.setStorageSync('userInfo', newUserInfo)
      getApp().globalData.userInfo = newUserInfo
      
      wx.hideLoading()
      wx.showToast({ title: '修改成功', icon: 'success' })
      
      setTimeout(() => wx.navigateBack(), 1000)

    } catch (e) {
      wx.hideLoading()
      console.error('保存失败报错:', e)
      wx.showModal({
        title: '保存失败',
        content: e.message || '网络异常或云函数报错',
        showCancel: false
      })
    }
  }
})