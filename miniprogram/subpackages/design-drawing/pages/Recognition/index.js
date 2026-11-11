const { encodeGrid, packToString } = require('../../../../utils/grid-codec')
const draftStore = require('../../../../utils/draft-store')
const { parseCanvasToGrid } = require('../../../../utils/image-parser') // 👈 引入算法
const { chooseImage: pickImage } = require('../../../../utils/choose-media')

Page({
  data: {
    statusBarHeight: 0,
    imageUrl: '',
    imageX: 0,
    imageY: 0,
    imgW: 0,
    imgH: 0,
    originalW: 0,
    originalH: 0,
    gridSize: 20,
    gridCountTip: ''
  },

  onLoad(options) {
    const sys = wx.getWindowInfo()
    this.setData({ statusBarHeight: sys.statusBarHeight })
    if (options.imageUrl) {
      this.setData({ imageUrl: decodeURIComponent(options.imageUrl) })
      this.initImage()
    }
  },

  goBack() { wx.navigateBack() },

  async chooseImage() {
    try {
      const path = await pickImage()
      if (!path) return // 用户取消
      this.setData({ imageUrl: path })
      this.initImage()
    } catch (e) {
      console.error('选择图片失败', e)
      wx.showToast({ title: e.message || '选择图片失败', icon: 'none' })
    }
  },

  initImage() {
    wx.getImageInfo({
      src: this.data.imageUrl,
      success: (res) => {
        wx.createSelectorQuery().select('.preview-area').boundingClientRect(rect => {
          if (!rect) return
          const boxW = rect.width, boxH = rect.height
          const scale = Math.min(boxW / res.width, boxH / res.height)
          const renderW = res.width * scale, renderH = res.height * scale
          
          this.setData({
            originalW: res.width, originalH: res.height,
            imgW: renderW, imgH: renderH,
            imageX: (boxW - renderW) / 2, imageY: (boxH - renderH) / 2
          }, () => this.updateGridTip())
        }).exec()
      }
    })
  },

  reCrop() { wx.showToast({ title: '请用下方按钮对齐', icon: 'none' }) },

  scaleImage(e) {
    const type = e.currentTarget.dataset.type
    let w = this.data.imgW, h = this.data.imgH
    w = type === 'up' ? w * 1.1 : w * 0.9
    h = type === 'up' ? h * 1.1 : h * 0.9
    const cx = this.data.imageX + this.data.imgW / 2, cy = this.data.imageY + this.data.imgH / 2
    this.setData({ imgW: w, imgH: h, imageX: cx - w / 2, imageY: cy - h / 2 })
  },

  moveGrid(e) {
    const dir = e.currentTarget.dataset.dir
    let { imageX, imageY } = this.data
    const step = 2
    if (dir === 'up') imageY -= step
    if (dir === 'down') imageY += step
    if (dir === 'left') imageX -= step
    if (dir === 'right') imageX += step
    this.setData({ imageX, imageY })
  },

  scaleGrid(e) {
    const type = e.currentTarget.dataset.type
    let size = this.data.gridSize
    size = type === 'up' ? Math.min(size + 2, 50) : Math.max(size - 2, 5)
    this.setData({ gridSize: size }, () => this.updateGridTip())
  },

  updateGridTip() {
    wx.createSelectorQuery().select('.preview-area').boundingClientRect(rect => {
      if (!rect) return
      const cols = Math.floor((rect.width + 0.01) / this.data.gridSize)
      const rows = Math.floor((rect.height + 0.01) / this.data.gridSize)
      let tip = `当前网格: ${cols} x ${rows}`
      if (cols !== rows) tip += ' (长宽不一致)'
      this.setData({ gridCountTip: tip })
    }).exec()
  },

  async recognize() {
    if (!this.data.imageUrl) return wx.showToast({ title: '请先上传图片', icon: 'none' })

    wx.showLoading({ title: '智能识别中...', mask: true })

    try {
      const rect = await new Promise(resolve => {
        wx.createSelectorQuery().select('.preview-area').boundingClientRect(resolve).exec()
      })
      if (!rect) throw new Error('获取画布尺寸失败')

      const gridCols = Math.floor((rect.width + 0.01) / this.data.gridSize)
      const gridRows = Math.floor((rect.height + 0.01) / this.data.gridSize)

      if (gridCols !== gridRows) throw new Error('请将格子微调为正方形')

      // 初始化离屏 canvas
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: this.data.originalW, height: this.data.originalH })
      const ctx = canvas.getContext('2d')
      const img = canvas.createImage()

      await new Promise((resolve, reject) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0)
          resolve()
        }
        img.onerror = reject
        img.src = this.data.imageUrl
      })

      // 👈 核心：调用算法模块生成网格
      const grid = parseCanvasToGrid({
        ctx,
        originalW: this.data.originalW,
        originalH: this.data.originalH,
        imageX: this.data.imageX,
        imageY: this.data.imageY,
        imgW: this.data.imgW,
        imgH: this.data.imgH,
        gridSize: this.data.gridSize,
        gridCols,
        gridRows
      })

      // 存为本地草稿
      const coded = encodeGrid(grid)
      const str = packToString(coded)
      const draftId = draftStore.createId()

      draftStore.saveDraft({
        id: draftId,
        title: `识别-${new Date().toLocaleTimeString()}`,
        grid: str,
        size: gridCols, 
        savedAt: Date.now(),
        preview: this.data.imageUrl,
        cloudDraftId: '',
        isPublic: false,
        isPublished: false
      })

      wx.hideLoading()
      wx.showToast({ title: '识别成功', icon: 'success' })

      setTimeout(() => {
        wx.redirectTo({
          url: `/subpackages/design-drawing/pages/Super-artboard/index?draftId=${draftId}`
        })
      }, 800)

    } catch (e) {
      wx.hideLoading()
      console.error('识别失败', e)
      const tip = draftStore.friendlyError(e)
      if (tip) {
        wx.showModal({ title: '无法保存草稿', content: tip, showCancel: false })
      } else {
        wx.showToast({ title: e.message || '识别失败', icon: 'none' })
      }
    }
  }
})