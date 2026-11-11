const { encodeGrid, decodeGrid, packToString, unpackFromString, calcGridStats } = require('../../../../utils/grid-codec')
const draftStore = require('../../../../utils/draft-store')
import { workApi } from '../../../../api/work'

Page({
  data: {
    gridSize: 34,
    canvasWidth: 340,
    canvasHeight: 340,
    currentColor: "#ff0000",
    currentColorName: "F7",
    currentTool: "pen",
    brushSize: 1,
    showColorLibrary: false,
    showCanvas: true,
    isDarkMode: false,
    canUndo: false,
    canRedo: false,
    maxHistory: 30, // 撤销步数上限；历史数据存在实例上，不进 data（避免大数组 setData）
    saving: false, // 防止连续点击保存

    // 全局发布开关（管理员可在后台关闭普通用户的发布权限）
    canPublish: true,
    canPublishPublic: true
  },

  _currentGrid: null,
  _editingId: null,
  _draftId: null,
  _canvasPageLeft: 0,
  _canvasPageTop: 0,
  _canvasViewLeft: 0,
  _canvasViewTop: 0,

  // ========== 生命周期 ==========
  onLoad(options) {
    this._undoStack = []
    this._redoStack = []

    const darkMode = wx.getStorageSync('darkMode') || false
    this.setData({ isDarkMode: darkMode })

    const winInfo = wx.getWindowInfo()
    const screenWidth = winInfo.windowWidth
    const canvasSize = Math.floor(screenWidth * 686 / 750)
    this.setData({
      canvasWidth: canvasSize,
      canvasHeight: canvasSize
    })

    if (options && options.draftId) {
      this._draftId = options.draftId
    }

    if (options && options.editId) {
      this._editingId = options.editId
      this.loadEditingWork(options.editId)
    }
  },

  // 每次显示都重新拉一次发布开关，避免页面被缓存后拿到旧配置
  onShow() {
    this.loadPublishConfig()
  },

  onReady() {
    if (!this._editingId) {
      if (this._draftId) {
        const draft = draftStore.getDraft(this._draftId)
        if (draft) {
          const grid = decodeGrid(unpackFromString(draft.grid))
          this._currentGrid = grid
          this.setData({ gridSize: draft.size })
        } else {
          this.initGrid()
        }
      } else {
        this.initGrid()
      }
    }

    this.initLeaferCanvas(() => {
      const comp = this.selectComponent('#pixelCanvas')
      if (comp && comp.setGrid && this._currentGrid) {
        comp.setGrid(this._currentGrid)
      }
    })
  },

  onHide() {
    if (!this._editingId) this.autoSaveDraft()
  },

  onUnload() {
    if (!this._editingId) this.autoSaveDraft()
  },

  // ========== 判断画布是否为空 ==========
  isGridEmpty(grid) {
    if (!grid || !grid.length) return true
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r]
      if (!Array.isArray(row)) continue
      for (let c = 0; c < row.length; c++) {
        if (row[c]) return false // 只要有任何一个格子填了颜色，就不算空
      }
    }
    return true
  },

  // ========== 编辑模式：从云端拉作品 ==========
  async loadEditingWork(id) {
    wx.showLoading({ title: '加载中...', mask: true })
    try {
      // 👈 通过 API 获取数据
      const work = await workApi.getWorkDetail(id)

      const grid = decodeGrid(unpackFromString(work.grid))
      this._currentGrid = grid
      this.setData({ gridSize: work.gridSize })

      const comp = this.selectComponent('#pixelCanvas')
      if (comp && comp.setGrid) comp.setGrid(grid)

      wx.hideLoading()
    } catch (e) {
      wx.hideLoading()
      console.error('加载编辑作品失败', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // ========== 默认草稿名 ==========
  defaultDraftTitle() {
    const d = new Date()
    const pad = n => String(n).padStart(2, '0')
    return `草稿 ${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  // ========== 自动保存（仅本地） ==========
  autoSaveDraft() {
    if (!this._currentGrid) return
    if (this.isGridEmpty(this._currentGrid)) return 

    try {
      const coded = encodeGrid(this._currentGrid)
      const str = packToString(coded)
      const now = Date.now()

      if (this._draftId) {
        draftStore.saveDraft({
          id: this._draftId,
          grid: str,
          size: this.data.gridSize,
          savedAt: now
        })
      } else {
        const id = draftStore.createId()
        this._draftId = id
        draftStore.saveDraft({
          id,
          title: this.defaultDraftTitle(),
          grid: str,
          size: this.data.gridSize,
          savedAt: now,
          preview: '',
          cloudDraftId: '',
          isPublic: false
        })
      }
    } catch (e) {
      console.error('自动保存失败', e)
      if (e && e.code === 'DRAFT_LIMIT') {
        wx.showModal({
          title: '草稿数量已达上限',
          content: '每个账号最多保存 10 个草稿。请先到「我的草稿」删除不用的草稿，当前内容尚未保存。',
          showCancel: false
        })
      } else if (e && e.code === 'STORAGE_FULL') {
        wx.showModal({
          title: '本地存储已满',
          content: '草稿没能保存。请到「我的草稿」删除一些不用的草稿后重试。',
          showCancel: false
        })
      }
    }
  },

  // ========== 手动保存（本地 + 云端同步） ==========
  async saveDraftManual(isPreview = false) {
    if (!this._currentGrid) {
      wx.showToast({ title: '画布为空', icon: 'none' })
      return
    }

    if (this.isGridEmpty(this._currentGrid)) {
      wx.showToast({ title: '画布为空，无需保存', icon: 'none' })
      return
    }

    if (this.data.saving) return

    const coded = encodeGrid(this._currentGrid)
    const str = packToString(coded)
    const existingDraft = this._draftId ? draftStore.getDraft(this._draftId) : null

    // 如果网格数据和上次完全一样，且不是强制预览，直接拦截
    if (!isPreview && existingDraft && existingDraft.grid === str) {
      wx.showToast({ title: '内容未修改', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: isPreview ? '同步数据中...' : '保存中...', mask: true })

    try {
      // 1. 导出预览图
      let preview = ''
      const comp = this.selectComponent('#pixelCanvas')
      if (comp && comp.exportImage) {
        try {
          const tmpPath = await comp.exportImage()
          if (tmpPath && typeof tmpPath === 'string') preview = tmpPath
        } catch (e) {
          console.error('预览图导出失败', e)
        }
      }

      // 2. 准备基础数据
      const now = Date.now()
      const title = existingDraft ? existingDraft.title : this.defaultDraftTitle()
      const stats = calcGridStats(this._currentGrid)
      const userInfo = wx.getStorageSync('userInfo') || {}

      let coverFileID = existingDraft ? (existingDraft.cloudCover || '') : ''
      let draftCloudId = existingDraft ? (existingDraft.cloudDraftId || '') : ''
      let finalDraftId = this._draftId || draftStore.createId()
      if (!this._draftId) this._draftId = finalDraftId

      // 3. 👈 通过 API 上传封面 (固定路径覆盖旧文件)
      if (preview && preview.indexOf('cloud://') !== 0) {
        const cloudPath = `covers/draft_${finalDraftId}.png`
        coverFileID = await workApi.uploadCover(preview, cloudPath)
      } else if (preview && preview.indexOf('cloud://') === 0) {
        coverFileID = preview
      }

      // 4. 组装数据
      const isPublic = existingDraft ? (existingDraft.isPublic || false) : false
      const workData = {
        type: 'work',
        isDraft: true, 
        title: title,
        grid: str,
        gridSize: this.data.gridSize,
        cover: coverFileID,
        colorList: stats.colorList,
        totalBeans: stats.totalBeans,
        colorCount: stats.colorCount,
        estimateHours: stats.estimateHours,
        isPublic: isPublic,
        authorNick: userInfo.nickname || '拼豆爱好者',
        authorAvatar: userInfo.avatar || ''
      }

      // 5. 👈 通过 API 同步云端数据库 (自动判断新增还是更新)
      draftCloudId = await workApi.saveDraft(workData, draftCloudId)

      // 6. 写入本地草稿
      draftStore.saveDraft({
        id: finalDraftId,
        title: title,
        grid: str,
        size: this.data.gridSize,
        savedAt: now,
        preview: preview || (existingDraft ? existingDraft.preview : ''),
        cloudDraftId: draftCloudId,
        cloudCover: coverFileID,
        isPublic: isPublic,
        uploadedAt: now
      })

      wx.hideLoading()

      if (isPreview) {
        wx.navigateTo({
          url: `/subpackages/design-drawing/pages/WorkDetail/index?draftId=${this._draftId}`
        })
      } else {
        wx.showToast({ title: '已保存', icon: 'success' })
      }
      
    } catch (e) {
      wx.hideLoading()
      console.error('保存失败', e)
      if (e && e.code === 'DRAFT_LIMIT') {
        wx.showModal({
          title: '草稿数量已达上限',
          content: '每个账号最多保存 10 个草稿。请先到「我的草稿」删除不用的草稿后重试。',
          showCancel: false
        })
      } else if (e && e.code === 'STORAGE_FULL') {
        wx.showModal({
          title: '本地存储已满',
          content: '草稿没能保存。请到「我的草稿」删除一些不用的草稿后重试。',
          showCancel: false
        })
      } else {
        wx.showToast({ title: '网络异常，同步失败', icon: 'none' })
      }
    } finally {
      this.setData({ saving: false })
    }
  },

  // ========== 预览（强制同步云端后跳转） ==========
  previewPaper() {
    if (!this._currentGrid) {
      wx.showToast({ title: '画布为空', icon: 'none' })
      return
    }
    
    if (this.isGridEmpty(this._currentGrid)) {
      wx.showToast({ title: '画布为空，请先画点东西', icon: 'none' })
      return
    }

    this.saveDraftManual(true)
  },

  // ========== 全局发布开关 ==========
  async loadPublishConfig() {
    try {
      const cfg = await workApi.getPublishConfig()
      this.setData({
        canPublish: cfg.canPublish !== false,
        canPublishPublic: cfg.canPublishPublic !== false
      })
    } catch (e) {
      // 读不到配置时按「可发布」处理，最终仍由服务端兜底校验
      console.warn('读取发布开关失败', e)
    }
  },

  // ========== 发布 / 更新 ==========
  async publishWork() {
    if (!this._currentGrid) {
      wx.showToast({ title: '画布为空', icon: 'none' })
      return
    }

    if (this.isGridEmpty(this._currentGrid)) {
      wx.showToast({ title: '画布为空，请先画点东西', icon: 'none' })
      return
    }

    if (!this.data.canPublish) {
      wx.showModal({
        title: '暂未开放发布',
        content: '当前小程序暂未开放作品发布，你仍然可以保存草稿继续创作。',
        showCancel: false
      })
      return
    }

    this.autoSaveDraft()

    if (!this._draftId) {
      wx.showToast({ title: '草稿保存失败', icon: 'none' })
      return
    }

    // 封面由 Release 页按网格渲染成图纸风格，这里不再导出画布截图
    wx.navigateTo({ 
      url: `/subpackages/design-drawing/pages/Release/index?draftId=${this._draftId}` 
    })
  },

  // ========== Leafer 初始化 ==========
  initLeaferCanvas(cb) {
    setTimeout(() => {
      const query = this.createSelectorQuery()
      query.select('#leaferCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) return
          const canvasNode = res[0].node
          const pixelComp = this.selectComponent('#pixelCanvas')
          if (pixelComp) {
            pixelComp.initLeaferWithCanvas(canvasNode, res[0].width, res[0].height)
          }
          this.measureCanvas()
          cb && cb()
        })
    }, 200)
  },

  // 测量画布在页面中的绝对位置。
  // rect 是视口坐标，加上滚动量换算成页面坐标，与 touch.pageX/pageY 对齐，
  // 这样页面滚动后绘图坐标也不会错位。
  measureCanvas() {
    this.createSelectorQuery()
      .select('#leaferCanvas')
      .fields({ rect: true, size: true, scrollOffset: true })
      .exec((res) => {
        const r = res && res[0]
        if (!r || typeof r.left !== 'number') return
        const scrollLeft = r.scrollLeft || 0
        const scrollTop = r.scrollTop || 0
        this._canvasPageLeft = r.left + scrollLeft
        this._canvasPageTop = r.top + scrollTop
        // 同时保留视口坐标，供没有 pageX 的极端情况兜底
        this._canvasViewLeft = r.left
        this._canvasViewTop = r.top
      })
  },

  // ========== 网格初始化 ==========
  initGrid() {
    const size = this.data.gridSize
    const grid = []
    for (let i = 0; i < size; i++) {
      grid.push(new Array(size).fill(null))
    }
    this._currentGrid = grid
    this._undoStack = []
    this._redoStack = []
    this.setData({ canUndo: false, canRedo: false })

    const comp = this.selectComponent('#pixelCanvas')
    if (comp && comp.setGrid) comp.setGrid(grid)
  },

  // ========== 撤销 / 重做 ==========
  onGridChange(e) {
    const newGrid = e.detail.grid
    if (this._currentGrid) {
      this.saveHistory(this._currentGrid)
    }
    this._currentGrid = newGrid.map(r => [...r])
  },

  saveHistory(oldGrid) {
    if (!this._undoStack) this._undoStack = []
    this._undoStack.push(oldGrid.map(row => [...row]))
    if (this._undoStack.length > this.data.maxHistory) this._undoStack.shift()
    this._redoStack = []
    this.setData({ canUndo: true, canRedo: false })
  },

  undo() {
    if (!this._undoStack || this._undoStack.length === 0) return
    if (!this._redoStack) this._redoStack = []

    if (this._currentGrid) {
      this._redoStack.push(this._currentGrid.map(r => [...r]))
    }
    const prev = this._undoStack.pop()
    this._currentGrid = prev

    const comp = this.selectComponent('#pixelCanvas')
    if (comp && comp.setGrid) comp.setGrid(prev)

    this.setData({
      canUndo: this._undoStack.length > 0,
      canRedo: true
    })
  },

  redo() {
    if (!this._redoStack || this._redoStack.length === 0) return
    if (!this._undoStack) this._undoStack = []

    if (this._currentGrid) {
      this._undoStack.push(this._currentGrid.map(r => [...r]))
    }
    const next = this._redoStack.pop()
    this._currentGrid = next

    const comp = this.selectComponent('#pixelCanvas')
    if (comp && comp.setGrid) comp.setGrid(next)

    this.setData({
      canUndo: true,
      canRedo: this._redoStack.length > 0
    })
  },

  // ========== 黑夜模式 ==========
  toggleDark() {
    const newMode = !this.data.isDarkMode
    this.setData({ isDarkMode: newMode })
    wx.setStorageSync('darkMode', newMode)
  },

  // ========== 其他 ==========
  changeSize() {
    wx.showActionSheet({
      itemList: ['16 x 16', '34 x 34', '64 x 64', '128 x 128'],
      success: (res) => {
        const sizes = [16, 34, 64, 128]
        const newSize = sizes[res.tapIndex]
        if (newSize === this.data.gridSize) return

        const apply = () => {
          this.setData({ gridSize: newSize })
          this.initGrid()       // 内部已重置撤销/重做栈
          this._draftId = null
        }

        // 画布非空时才二次确认，避免误触直接丢掉作品
        const hasContent = this._currentGrid && !this.isGridEmpty(this._currentGrid)
        if (!hasContent) {
          apply()
          return
        }

        wx.showModal({
          title: '切换画布尺寸',
          content: `切换为 ${newSize}×${newSize} 会清空当前画布，并与当前草稿解除关联。确定继续吗？`,
          confirmText: '继续',
          confirmColor: '#e64340',
          success: (r) => {
            if (r.confirm) apply()
          }
        })
      }
    })
  },

  zoomIn() {
    const comp = this.selectComponent('#pixelCanvas')
    if (comp && comp.zoomIn) comp.zoomIn()
  },

  zoomOut() {
    const comp = this.selectComponent('#pixelCanvas')
    if (comp && comp.zoomOut) comp.zoomOut()
  },

  resetView() {
    const comp = this.selectComponent("#pixelCanvas")
    if (comp && comp.resetView) comp.resetView()
    wx.showToast({ title: '已复位', icon: 'none' })
  },

  flipCanvas() {
    const comp = this.selectComponent("#pixelCanvas")
    if (comp && comp.flipCanvas) comp.flipCanvas()
  },

  clearCanvas() {
    // 空画布直接提示，不做无意义的删除动作
    if (!this._currentGrid || this.isGridEmpty(this._currentGrid)) {
      wx.showToast({ title: '画布已经是空的', icon: 'none' })
      return
    }

    wx.showModal({
      title: '清空画布',
      content: '确定要清空当前画布吗？清空后可用「撤销」找回，但对应的本地草稿记录会被删除。',
      confirmText: '清空',
      confirmColor: '#e64340',
      success: (res) => {
        if (!res.confirm) return

        const comp = this.selectComponent("#pixelCanvas")
        if (comp && comp.clearCanvas) comp.clearCanvas()

        if (this._draftId) {
          draftStore.removeDraft(this._draftId)
          this._draftId = null
        }
      }
    })
  },

  switchTool(e) {
    this.setData({ currentTool: e.detail.tool })
  },

  onToolChange(e) {
    this.setData({ currentTool: e.detail.tool })
  },

  onSizeChange(e) {
    this.setData({ brushSize: e.detail.size })
  },

  onColorSelect(e) {
    const { color, name } = e.detail
    this.setData({
      currentColor: color,
      currentColorName: name || this.data.currentColorName
    })
  },

  onPickColor(e) {
    this.setData({ currentColor: e.detail.color })
  },

  // ========== 221 全色板 ==========
  openColorLibrary() {
    this.setData({
      showColorLibrary: true,
      showCanvas: false
    })
  },

  onCloseColorLibrary() {
    this.setData({ showColorLibrary: false, showCanvas: true })
    this.initLeaferCanvas(() => {
      const comp = this.selectComponent('#pixelCanvas')
      if (comp && comp.setGrid && this._currentGrid) {
        comp.setGrid(this._currentGrid)
      }
    })
  },

  // ========== 触摸事件转发 ==========
  receiveEvent(event) {
    const comp = this.selectComponent('#pixelCanvas')
    if (!comp) return

    const touch = event.touches && event.touches[0]
    const changedTouch = event.changedTouches && event.changedTouches[0]
    const point = touch || changedTouch
    if (!point) return

    // 优先用 pageX/pageY（页面坐标，滚动后依然正确）
    let x
    let y
    if (typeof point.pageX === 'number') {
      x = point.pageX - (this._canvasPageLeft || 0)
      y = point.pageY - (this._canvasPageTop || 0)
    } else {
      x = point.clientX - (this._canvasViewLeft || 0)
      y = point.clientY - (this._canvasViewTop || 0)
    }

    comp.receiveEvent(event.type, x, y)
  }
})