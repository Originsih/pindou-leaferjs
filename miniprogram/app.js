App({
  globalData: {
    userInfo: null,
    openid: '',
    isLogin: false
  },

  onLaunch() {
    wx.cloud.init({
      env: 'cloud1-d1gegzq3o035c6234',
      traceUser: true
    })

    this.login().catch((err) => {
      // 登录失败不阻断启动，页面各自按需重试（如 user 页会再次调用 login）
      console.error('启动登录失败', err)
    })
  },

  login() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login',
        success: (res) => {

          const r = res.result || {}
          if (r.success && r.user) {
            // 1. 存入全局变量
            this.globalData.userInfo = r.user
            this.globalData.openid = r.user._openid || ''
            this.globalData.isLogin = true
            
            // 2. 👈 核心：存入本地缓存，供页面读取
            wx.setStorageSync('openid', r.user._openid)
            wx.setStorageSync('userInfo', r.user)
            
            resolve(r.user)
          } else {
            console.error('登录失败，返回内容:', r)
            reject(r)
          }
        },
        fail: (err) => {
          console.error('云函数调用失败', err)
          reject(err)
        }
      })
    })
  }
})
