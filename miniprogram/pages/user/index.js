const app = getApp()

Page({
  data: {
    userInfo: null,
    avatarText: '?',
    nickname: '拼豆爱好者',
    shortId: ''
  },
  onLoad() {
    const systemInfo =  wx.getWindowInfo()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    })
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.loadUserInfo()
  },

  loadUserInfo() {
    const userInfo = app.globalData.userInfo

    if (userInfo) {
      this.applyUser(userInfo)
    } else {
      app.login().then(user => {
        this.applyUser(user)
      }).catch(() => {})
    }
  },

  applyUser(user) {
    this.setData({
      userInfo: user,
      nickname: user.nickname || '拼豆爱好者',
      avatarText: (user.nickname || '拼')[0],
      shortId: user.shortId || '加载中...'
    })
  },
  goSettings() {
    wx.navigateTo({ url: '/subpackages/user-storage/pages/settings/index' })
      },

  copyId() {
    if (!this.data.shortId || this.data.shortId === '加载中...') return
    wx.setClipboardData({
      data: this.data.shortId,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  },

  goDraft() {
    wx.navigateTo({ url: '/subpackages/user-storage/pages/my-draft/index' })
  },
  goHistory() { 
    wx.navigateTo({ url: '/subpackages/user-storage/pages/browsing-history/index' })
   },
  goCollect() { 
    wx.navigateTo({ url: '/subpackages/user-storage/pages/my-collection/index' })
  },
  goPublicWork() { 
    wx.navigateTo({ url: '/subpackages/user-storage/pages/Public-works/index' })
   },
  goPrivateWork() {
    wx.navigateTo({ url: '/subpackages/user-storage/pages/Private-works/index' })
  },
  goMiniCode() { 
    wx.navigateTo({ url: '/subpackages/user-storage/pages/mini-code/index' }) 
  }
})