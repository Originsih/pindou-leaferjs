import { qrcodeApi } from '../../../../api/qrcode'

Page({
  data: {
    qrCodeUrl: '',
    shortId: ''
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {}
    this.setData({ shortId: userInfo.shortId || '' })
    this.generateQrCode()
  },

  async generateQrCode() {
    wx.showLoading({ title: '生成中...', mask: true })
    
    try {
      // 👈 极简：传个 shortId 进去，直接拿到网络链接
      const url = await qrcodeApi.generate(this.data.shortId)
      
      this.setData({ qrCodeUrl: url })
    } catch (e) {
      console.error('生成二维码报错', e)
      wx.showModal({
        title: '生成失败',
        content: e.message || '网络错误',
        showCancel: false
      })
    } finally {
      // 👈 核心：无论成功还是失败，一定关掉 Loading，再也不会报错了
      wx.hideLoading()
    }
  },

  saveQrCode() {
    if (!this.data.qrCodeUrl) return

    wx.showLoading({ title: '保存中...', mask: true })
    
    wx.downloadFile({
      url: this.data.qrCodeUrl,
      success: (res) => {
        if (res.statusCode !== 200) {
          wx.hideLoading()
          wx.showToast({ title: '图片下载失败', icon: 'none' })
          return
        }

        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.hideLoading()
            wx.showToast({ title: '已保存到相册', icon: 'success' })
          },
          fail: (err) => {
            wx.hideLoading()

            if (err.errMsg && /auth deny|privacy|authorize|permission/i.test(err.errMsg)) {
              wx.showModal({
                title: '提示',
                content: '需要相册（仅写入）权限才能保存图片，请在设置中允许后重试',
                success: (r) => {
                  if (r.confirm) wx.openSetting()
                }
              })
            }
          }
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下载失败', icon: 'none' })
      }
    })
  }
})
