const { encodeGrid, packToString } = require('../../../../utils/grid-codec')
const draftStore = require('../../../../utils/draft-store')
const { convertImageToGrid } = require('../../../../utils/image-to-grid')
const { cutoutBackground } = require('../../../../utils/image-cutout')
const { chooseImage: pickImage } = require('../../../../utils/choose-media')

Page({
  data: {
    statusBarHeight: 0,
    imageUrl: '',
    colorCount: 221,
    canvasSize: 64
  },

  onLoad() {
    const sys = wx.getWindowInfo()
    this.setData({ statusBarHeight: sys.statusBarHeight })
  },

  goBack() {
    wx.navigateBack()
  },

  async chooseImage() {
    try {
      const path = await pickImage()
      if (!path) return // 用户取消
      this.setData({ imageUrl: path })
    } catch (e) {
      console.error('选择图片失败', e)
      wx.showToast({ title: e.message || '选择图片失败', icon: 'none' })
    }
  },

  // ==========================================
  // 智能抠图（极简版）
  // ==========================================
  async smartCutout() {
    if (!this.data.imageUrl) {
      wx.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }

    wx.showLoading({ title: '智能抠图中...', mask: true })

    try {
      // 👈 一行代码搞定所有底层计算
      const newPath = await cutoutBackground(this.data.imageUrl, 40)
      
      this.setData({ imageUrl: newPath })
      wx.showToast({ title: '抠图完成', icon: 'success' })
    } catch (e) {
      console.error('抠图失败', e)
      wx.showToast({ title: e.message || '抠图失败', icon: 'none' })
    } finally {
      wx.hideLoading() // 👈 统一关闭，告别报错
    }
  },

  chooseColorCount() {
    wx.showActionSheet({
      itemList: ['48色', '96色', '144色', '221色'],
      success: (res) => {
        const counts = [48, 96, 144, 221]
        this.setData({ colorCount: counts[res.tapIndex] })
      }
    })
  },

  chooseCanvasSize() {
    wx.showActionSheet({
      itemList: ['32x32', '48x48', '64x64', '128x128'],
      success: (res) => {
        const sizes = [32, 48, 64, 128]
        this.setData({ canvasSize: sizes[res.tapIndex] })
      }
    })
  },

  // ==========================================
  // 立即转换
  // ==========================================
  async convertImage() {
    if (!this.data.imageUrl) {
      wx.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }

    wx.showLoading({ title: '智能转换中...', mask: true })

    try {
      const grid = await convertImageToGrid(
        this.data.imageUrl,
        this.data.canvasSize,
        this.data.colorCount
      )
      const coded = encodeGrid(grid)
      const str = packToString(coded)
      
      const draftId = draftStore.createId()
      
      draftStore.saveDraft({
        id: draftId,
        title: `转绘-${new Date().toLocaleDateString()}`,
        grid: str,
        size: this.data.canvasSize,
        savedAt: Date.now(),
        preview: this.data.imageUrl,
        cloudDraftId: '',
        isPublic: false,
        isPublished: false
      })

      wx.showToast({ title: '生成成功', icon: 'success' })

      setTimeout(() => {
        wx.redirectTo({
          url: `/subpackages/design-drawing/pages/Super-artboard/index?draftId=${draftId}`
        })
      }, 800)

    } catch (e) {
      console.error('转换失败', e)
      const tip = draftStore.friendlyError(e)
      if (tip) {
        wx.showModal({ title: '无法保存草稿', content: tip, showCancel: false })
      } else {
        wx.showToast({ title: '转换失败，请重试', icon: 'none' })
      }
    } finally {
      wx.hideLoading()
    }
  }
})