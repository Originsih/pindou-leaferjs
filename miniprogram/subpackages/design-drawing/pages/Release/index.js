import { workApi } from '../../../../api/work' // 退4层到 miniprogram/ 根
const { unpackFromString, decodeGrid, calcGridStats } = require('../../../../utils/grid-codec')
const draftStore = require('../../../../utils/draft-store')
const { renderGridCover } = require('../../../../utils/render-grid-cover')

Page({
  data: {
    statusBarHeight: 0,
    workImage: '',
    gridSize: 34,
    workName: '',
    isPublic: true,
    lockPublic: false,   // 全局开关禁止公开发布时锁住这个开关
    tagList: [],
    useWatermark: false,
    watermark: '',
    allowDerivative: true,
    publishing: false,

    totalBeans: 0,
    colorCount: 0,
    estimateHours: 0,
    colorList: []
  },

  _packedGrid: '',
  _editingId: null,
  _draftId: null,
  _cloudId: '', 
  _draftCloudId: '',
  _existingCover: '',

  async onLoad(options) {
    const winInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: winInfo.statusBarHeight || 0 })

    // 全局发布开关：没权限直接退回，不进入发布流程
    const allowed = await this.checkPublishPermission()
    if (!allowed) return

    if (options && options.editId) {
      this._editingId = options.editId
      this.loadEditingWork(options.editId)
      wx.setNavigationBarTitle({ title: '更新作品' })
    } else if (options && options.draftId) {
      this._draftId = options.draftId
      this.loadDraft(options.draftId)
    } else {
      wx.showToast({ title: '参数缺失', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  // 读取发布权限；读不到配置时不拦截，交给服务端兜底
  async checkPublishPermission() {
    try {
      const cfg = await workApi.getPublishConfig()

      if (cfg.canPublish === false) {
        wx.showModal({
          title: '暂未开放发布',
          content: '当前小程序暂未开放作品发布，你仍然可以保存草稿继续创作。',
          showCancel: false,
          success: () => wx.navigateBack()
        })
        return false
      }

      if (cfg.canPublishPublic === false) {
        this.setData({ isPublic: false, lockPublic: true })
        wx.showToast({ title: '当前仅可发布私有作品', icon: 'none' })
      }

      return true
    } catch (e) {
      console.warn('读取发布开关失败，跳过前端校验', e)
      return true
    }
  },

  goBack() {
    wx.navigateBack()
  },

  // ========== 新建：读本地草稿 ==========
  loadDraft(id) {
    const draft = draftStore.getDraft(id)
    if (!draft) {
      wx.showToast({ title: '草稿不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }

    const grid = decodeGrid(unpackFromString(draft.grid))
    const stats = calcGridStats(grid)

    this._packedGrid = draft.grid
    this._cloudId = draft.cloudWorkId || '' 
    this._draftCloudId = draft.cloudDraftId || ''
    this._existingCover = draft.cloudCover || '' 
    this._draftPreview = draft.preview || draft.cloudCover || '' // 仅作渲染失败时兜底

    this.setData({
      workImage: '',
      gridSize: draft.size,
      workName: draft.title || '',
      totalBeans: stats.totalBeans,
      colorCount: stats.colorCount,
      estimateHours: stats.estimateHours,
      colorList: stats.colorList
    })

    // 封面用「图纸格子」渲染，而不是用户上传的原图
    this.buildGridCover()
  },

  // 把网格渲染成图纸风格封面；失败则退回草稿原有预览图
  async buildGridCover() {
    if (!this._packedGrid) return

    try {
      const path = await renderGridCover(this._packedGrid, this.data.gridSize)
      this.setData({ workImage: path })
    } catch (e) {
      console.error('生成图纸封面失败，回退到原预览图', e)
      if (this._draftPreview) {
        this.setData({ workImage: this._draftPreview })
      }
    }
  },

  // ========== 编辑：读云端作品 ==========
  async loadEditingWork(id) {
    wx.showLoading({ title: '加载中...', mask: true })
    try {
      // 👈 极简：调用 API
      const work = await workApi.getWorkDetail(id)
      const grid = decodeGrid(unpackFromString(work.grid))
      const stats = calcGridStats(grid)

      this._packedGrid = work.grid
      this._existingCover = work.cover || ''

      this.setData({
        workImage: work.cover || '',
        gridSize: work.gridSize,
        workName: work.title || '',
        isPublic: work.isPublic !== false,
        tagList: work.tags || [],
        useWatermark: work.useWatermark || false,
        watermark: work.watermark || '',
        allowDerivative: work.allowDerivative !== false,
        totalBeans: stats.totalBeans,
        colorCount: stats.colorCount,
        estimateHours: stats.estimateHours,
        colorList: stats.colorList
      })
    } catch (e) {
      console.error('加载失败', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onNameInput(e) { this.setData({ workName: e.detail.value }) },
  onPublicChange(e) { this.setData({ isPublic: e.detail.value }) },
  onWatermarkChange(e) { this.setData({ useWatermark: e.detail.value }) },
  onWatermarkInput(e) { this.setData({ watermark: e.detail.value }) },
  onDerivativeChange(e) { this.setData({ allowDerivative: e.detail.value }) },

  addTag() {
    if (this.data.tagList.length >= 5) {
      wx.showToast({ title: '最多 5 个标签', icon: 'none' })
      return
    }
    wx.showModal({
      title: '添加标签',
      editable: true,
      placeholderText: '请输入标签',
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          const tag = res.content.trim()
          if (this.data.tagList.indexOf(tag) >= 0) {
            wx.showToast({ title: '标签已存在', icon: 'none' })
            return
          }
          this.setData({ tagList: [...this.data.tagList, tag] })
        }
      }
    })
  },

  removeTag(e) {
    const index = e.currentTarget.dataset.index
    const tagList = this.data.tagList.filter((_, i) => i !== index)
    this.setData({ tagList })
  },

  // ========== 发布 / 更新 ==========
  async publish() {
    if (this.data.publishing) return

    if (!this.data.workName.trim()) {
      wx.showToast({ title: '请输入作品名称', icon: 'none' })
      return
    }
    if (!this._packedGrid) {
      wx.showToast({ title: '画布数据缺失', icon: 'none' })
      return
    }

    this.setData({ publishing: true })
    wx.showLoading({ title: this._editingId ? '更新中...' : '发布中...', mask: true })

    try {
      let coverFileID = this._existingCover
      
      // 👈 极简：调用 API 上传封面
      if (this.data.workImage && this.data.workImage.indexOf('cloud://') !== 0) {
        const cloudPath = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
        coverFileID = await workApi.uploadCover(this.data.workImage, cloudPath)
      }

      const userInfo = wx.getStorageSync('userInfo') || {}
      
      const baseData = {
        title: this.data.workName.trim(),
        grid: this._packedGrid,
        gridSize: this.data.gridSize,
        colorList: this.data.colorList,
        totalBeans: this.data.totalBeans,
        colorCount: this.data.colorCount,
        estimateHours: this.data.estimateHours,
        isPublic: this.data.isPublic,
        tags: this.data.tagList,
        useWatermark: this.data.useWatermark,
        watermark: this.data.watermark,
        allowDerivative: this.data.allowDerivative,
        authorNick: userInfo.nickname || '拼豆爱好者',
        authorAvatar: userInfo.avatar || ''
      }
      if (coverFileID) baseData.cover = coverFileID

      // 👈 极简：调用 API 发布/更新
      // 已发布过的草稿再次提交时更新原作品，避免重复创建
      const editTarget = this._editingId || this._cloudId || null
      const finalWorkId = await workApi.publish(baseData, editTarget, this._draftCloudId)

      // 同步更新本地草稿状态为已发布
      if (this._draftId) {
        const draft = draftStore.getDraft(this._draftId)
        if (draft) {
          draftStore.saveDraft(Object.assign({}, draft, {
            // 草稿已在服务端发布成作品并删除，本地改记作品 id
            cloudWorkId: finalWorkId,
            cloudDraftId: '',
            cloudCover: coverFileID,
            isPublic: this.data.isPublic,
            title: this.data.workName.trim(),
            uploadedAt: Date.now(),
            isPublished: true
          }))
        }
      }

      // 公开作品需要审核，提示语要如实反映状态
      let toastTitle
      if (this.data.isPublic) {
        toastTitle = '已提交审核'
      } else if (this._editingId) {
        toastTitle = '更新成功'
      } else {
        toastTitle = '已保存为私有'
      }
      wx.showToast({ title: toastTitle, icon: 'success' })

      setTimeout(() => {
        if (this._editingId) {
          wx.navigateBack()
        } else {
          // ⚠️ 修正了老路径，跳转到最新的 WorkDetail
          wx.redirectTo({
            url: `/subpackages/design-drawing/pages/WorkDetail/index?id=${finalWorkId}`
          })
        }
      }, 800)

    } catch (e) {
      console.error('发布失败', e)
      this.setData({ publishing: false })

      // 服务端可能返回内容安全等具体原因，长文案用 modal 展示更清楚
      const msg = (e && e.message) || '发布失败，请重试'
      if (msg.length > 7) {
        wx.showModal({ title: '无法发布', content: msg, showCancel: false })
      } else {
        wx.showToast({ title: msg, icon: 'none' })
      }
    } finally {
      wx.hideLoading()
    }
  }
})