const { decodeGrid, unpackFromString, calcGridStats } = require('../../../../utils/grid-codec')
const draftStore = require('../../../../utils/draft-store')
const { addHistory } = require('../../../../utils/history')
import { workApi } from '../../../../api/work'
import { favoriteApi } from '../../../../api/favorite'

Page({
  data: {
    mode: 'draft',        
    viewMode: 'preview',  
    title: '',
    workImage: '',
    gridSize: 34,
    gridStr: '',
    totalBeans: 0,
    estimateHours: 0,
    colorCount: 0,
    colorList: [],
    workId: '',           
    isFav: false,         
    favCount: 0,          
    madeCount: 0,
    isPublic: false,
    draftId: '',
    uploading: false,
    isOwner: true,        
    isPublished: false,
    reviewStatus: 'approved',
    reviewNote: '',
    downloading: false
  },

  _draftRaw: null,

  onLoad(options) {
    if (options.id) {
      this.setData({ mode: 'cloud', workId: options.id })
      this.loadFromCloud(options.id)
    } else if (options.draftId) {
      this.setData({ mode: 'draft', draftId: options.draftId })
      this.loadFromDraft(options.draftId)
    } else {
      wx.showToast({ title: '参数缺失', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  loadFromDraft(id) {
    const draft = draftStore.getDraft(id)
    if (!draft) {
      wx.showToast({ title: '草稿不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }

    const grid = decodeGrid(unpackFromString(draft.grid))
    const stats = calcGridStats(grid)
    this._draftRaw = draft

    this.setData({
      title: draft.title || '未命名草稿',
      workImage: draft.preview || draft.cloudCover || '',
      gridSize: draft.size,
      gridStr: draft.grid,
      totalBeans: stats.totalBeans,
      estimateHours: stats.estimateHours,
      colorCount: stats.colorCount,
      colorList: stats.colorList,
      workId: draft.cloudWorkId || '',
      isPublic: draft.isPublic || false,
      isPublished: draft.isPublished || false,
      isOwner: true
    })
  },

  async loadFromCloud(id) {
    wx.showLoading({ title: '加载中...', mask: true })
    try {
      const work = await workApi.getWorkDetail(id)

      // 归属判断优先用服务端返回的 _isOwner（不依赖本地 openid 是否已就绪）
      const myOpenid = wx.getStorageSync('openid') || (getApp() && getApp().globalData.openid)
      const isOwner = (typeof work._isOwner === 'boolean')
        ? work._isOwner
        : (myOpenid === work._openid)
      const isFav = await favoriteApi.checkIsFav(id)

      // 👈 新增：在这里写入本地浏览记录！只要加载成功就会记录
      addHistory(work)

      this.setData({
        mode: 'cloud',
        title: work.title || '未命名作品',
        workImage: work.cover || '',
        gridSize: work.gridSize,
        gridStr: work.grid || '',
        totalBeans: work.totalBeans || 0,
        estimateHours: work.estimateHours || 0,
        colorCount: work.colorCount || 0,
        colorList: work.colorList || [],
        favCount: work.favCount || 0,
        madeCount: work.madeCount || 0,
        isPublic: work.isPublic !== false,
        isPublished: true,
        isFav: isFav,
        isOwner: isOwner,
        reviewStatus: work.reviewStatus || 'approved',
        reviewNote: work.reviewNote || ''
      })
      wx.hideLoading()
    } catch (e) {
      wx.hideLoading()
      console.error('加载失败', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  switchMode(e) {
    this.setData({ viewMode: e.currentTarget.dataset.mode })
  },

  // ========== 图纸下载 ==========

  // bead-grid 渲染完成后会带出临时路径，先缓存着
  onGridReady(e) {
    const p = e && e.detail && e.detail.tmpPath
    if (p) this._gridTmpPath = p
  },

  // 等 bead-grid 挂载完成（wx:if 切换后组件是异步创建的）
  async waitForGridComponent(retries) {
    const max = retries || 12
    for (let i = 0; i < max; i++) {
      const comp = this.selectComponent('#beadGrid')
      if (comp && typeof comp.exportImage === 'function') return comp
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return null
  },

  async downloadGrid() {
    if (this.data.downloading) return

    this.setData({ downloading: true })
    wx.showLoading({ title: '生成图纸...', mask: true })

    try {
      const comp = await this.waitForGridComponent()
      if (!comp) throw new Error('图纸组件未就绪，请重新切到图纸模式后再试')

      const path = await comp.exportImage()
      wx.hideLoading()
      this.setData({ downloading: false })

      if (!path) throw new Error('生成图纸失败')
      this.saveImageToAlbum(path)
    } catch (e) {
      wx.hideLoading()
      this.setData({ downloading: false })
      const msg = (e && e.message) || '生成图纸失败'
      wx.showModal({ title: '下载失败', content: msg, showCancel: false })
    }
  },

  saveImageToAlbum(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || ''

        if (/auth deny|privacy|authorize|permission/i.test(msg)) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存图纸需要「相册（仅写入）」权限，请在设置中允许后重试。',
            confirmText: '去设置',
            success: (r) => {
              if (r.confirm) wx.openSetting()
            }
          })
          return
        }
        if (/cancel/i.test(msg)) return

        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    })
  },

  // ========== 举报 ==========
  reportWork() {
    const reasons = ['色情低俗', '违法违规', '侵犯版权', '广告骚扰', '其他']
    wx.showActionSheet({
      itemList: reasons,
      success: (res) => {
        const reason = reasons[res.tapIndex]
        wx.showModal({
          title: '确认举报',
          content: `确定举报该作品为「${reason}」吗？我们会尽快核实处理。`,
          success: async (r) => {
            if (!r.confirm) return
            wx.showLoading({ title: '提交中...', mask: true })
            try {
              await workApi.report(this.data.workId, reason)
              wx.hideLoading()
              wx.showToast({ title: '举报已提交', icon: 'success' })
            } catch (e) {
              wx.hideLoading()
              const msg = (e && e.message) || '举报失败'
              if (msg.length > 7) {
                wx.showModal({ title: '提示', content: msg, showCancel: false })
              } else {
                wx.showToast({ title: msg, icon: 'none' })
              }
            }
          }
        })
      }
    })
  },

  // ========== 分享 ==========
  // 只有「已发布且公开」的作品才分享详情页，草稿/私有作品回落到广场
  onShareAppMessage() {
    const shareable = this.data.workId && this.data.isPublished && this.data.isPublic
    if (!shareable) {
      return {
        title: '拼豆图纸工坊 - 发现更多拼豆图纸',
        path: '/pages/drawing/index'
      }
    }
    return {
      title: this.data.title || '拼豆图纸分享',
      path: `/subpackages/design-drawing/pages/WorkDetail/index?id=${this.data.workId}`,
      imageUrl: this.data.workImage || ''
    }
  },

  onShareTimeline() {
    const shareable = this.data.workId && this.data.isPublished && this.data.isPublic
    return {
      title: shareable ? (this.data.title || '拼豆图纸分享') : '拼豆图纸工坊',
      query: shareable ? `id=${this.data.workId}` : ''
    }
  },

  async goPublish() {
    // 全局发布开关：没权限就不进发布流程（服务端还会再校验一次）
    try {
      const cfg = await workApi.getPublishConfig()
      if (cfg.canPublish === false) {
        wx.showModal({
          title: '暂未开放发布',
          content: '当前小程序暂未开放作品发布，你仍然可以保存草稿继续创作。',
          showCancel: false
        })
        return
      }
    } catch (e) {
      console.warn('读取发布开关失败，交给服务端兜底', e)
    }

    wx.navigateTo({
      url: `/subpackages/design-drawing/pages/Release/index?draftId=${this.data.draftId}`
    })
  },

  notifyPrevPage(action, newData = {}) {
    const pages = getCurrentPages();
    if (pages.length <= 1) return;
    const prevPage = pages[pages.length - 2];
    const route = prevPage.route;
    const workId = this.data.workId;

    if (route.includes('square')) {
      let { leftList, rightList } = prevPage.data;
      const processList = (list) => {
        if (action === 'remove') return list.filter(item => item.id !== workId);
        if (action === 'update') return list.map(item => item.id === workId ? { ...item, ...newData } : item);
        return list;
      };
      prevPage.setData({
        leftList: processList(leftList),
        rightList: processList(rightList)
      });
    } else if (route.includes('my-collection') || route.includes('Public-works') || route.includes('Private-works')) {
      let { list } = prevPage.data;
      if (!list) return;
      if (action === 'remove') list = list.filter(item => item.id !== workId);
      if (action === 'update') list = list.map(item => item.id === workId ? { ...item, ...newData } : item);
      prevPage.setData({ list });
    }
  },

  async toggleFav() {
    if (this.data.mode !== 'cloud' || this.data.uploading) return
    this.setData({ uploading: true })

    const isFav = !this.data.isFav
    const newFavCount = this.data.favCount + (isFav ? 1 : -1)

    this.setData({ isFav, favCount: newFavCount })

    try {
      await favoriteApi.toggle(this.data.workId, isFav)
      this.notifyPrevPage('update', { favCount: newFavCount });
    } catch (e) {
      console.error('收藏操作失败', e)
      this.setData({ isFav: !isFav, favCount: this.data.favCount })
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  copyWork() {
    const that = this
    wx.showModal({
      title: '二次创作',
      content: '将复制此图纸到你的草稿箱，是否继续？',
      success: (res) => {
        if (!res.confirm) return
        
        const newDraftId = draftStore.createId()
        const now = Date.now()

        try {
          draftStore.saveDraft({
            id: newDraftId,
            title: '二创 - ' + (that.data.title || '未命名'),
            grid: that.data.gridStr,
            size: that.data.gridSize,
            savedAt: now,
            preview: that.data.workImage,
            cloudDraftId: '',
            cloudWorkId: '',
            isPublic: false,
            isPublished: false
          })
        } catch (err) {
          const tip = draftStore.friendlyError(err)
          if (tip) {
            wx.showModal({ title: '无法创建草稿', content: tip, showCancel: false })
          } else {
            wx.showToast({ title: '复制失败', icon: 'none' })
          }
          return
        }
        
        workApi.incrementMadeCount(that.data.workId).then(() => {
          const newMadeCount = that.data.madeCount + 1;
          that.setData({ madeCount: newMadeCount });
          that.notifyPrevPage('update', { useCount: newMadeCount });
        }).catch(e => console.error('增加使用次数失败', e))

        wx.showToast({ title: '已复制到草稿', icon: 'success' })
        
        setTimeout(() => {
          wx.redirectTo({
            url: `/subpackages/design-drawing/pages/Super-artboard/index?draftId=${newDraftId}`
          })
        }, 800)
      }
    })
  },

  async updateCloudState(isPublic) {
    if (this.data.uploading) return
    this.setData({ uploading: true })
    wx.showLoading({ title: '处理中...', mask: true })

    try {
      await workApi.updateWorkState(this.data.workId, isPublic)

      if (this.data.mode === 'draft' && this._draftRaw) {
        draftStore.saveDraft(Object.assign({}, this._draftRaw, {
          isPublic: isPublic,
          isPublished: true
        }))
        this._draftRaw.isPublic = isPublic
        this._draftRaw.isPublished = true
      }

      this.setData({
        isPublic: isPublic,
        isPublished: true,
        reviewStatus: isPublic ? 'pending' : this.data.reviewStatus,
        reviewNote: isPublic ? '' : this.data.reviewNote
      })
      wx.hideLoading()
      wx.showToast({
        title: isPublic ? '已提交审核' : '已转为私有',
        icon: 'success'
      })
      
      if (!isPublic && this.data.mode === 'cloud') {
        this.notifyPrevPage('remove');
      }
    } catch (e) {
      wx.hideLoading()
      console.error('状态更新失败', e)
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  toPrivate() { this.updateCloudState(false) },
  toPublic() { this.updateCloudState(true) },

  editDraft() {
    wx.redirectTo({
      url: `/subpackages/design-drawing/pages/Super-artboard/index?draftId=${this.data.draftId}`
    })
  },

  deleteDraft() {
    const id = this.data.draftId
    const draft = draftStore.getDraft(id)
    let content = '删除后无法恢复，确定吗？'
    if (draft && draft.cloudDraftId) {
      content = '该草稿已在云端存在，删除后将同时移除。确定吗？'
    }

    wx.showModal({
      title: '删除草稿',
      content: content,
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...', mask: true })
        try {
          // 只删云端草稿；如果这张草稿已经发布成作品，作品不会被删掉
          if (draft && draft.cloudDraftId) {
            await workApi.deleteDraft(draft.cloudDraftId)
          }
          draftStore.removeDraft(id)
          wx.hideLoading()
          wx.showToast({ title: '已删除' })
          setTimeout(() => wx.navigateBack(), 800)
        } catch (e) {
          wx.hideLoading()
          console.error('删除失败', e)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  editWork() {
    wx.navigateTo({
      url: '/subpackages/design-drawing/pages/Super-artboard/index?editId=' + this.data.workId
    })
  },

  deleteWork() {
    wx.showModal({
      title: '提示',
      content: '确定要删除这个作品吗？',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        try {
          await workApi.deleteWork(this.data.workId)
          
          if (this._draftRaw) {
            draftStore.saveDraft(Object.assign({}, this._draftRaw, {
              cloudWorkId: '',
              cloudCover: '',
              uploadedAt: 0,
              isPublished: false
            }))
          }
          this.notifyPrevPage('remove');
          
          wx.hideLoading()
          wx.showToast({ title: '已删除' })
          setTimeout(() => wx.navigateBack(), 800)
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }
})