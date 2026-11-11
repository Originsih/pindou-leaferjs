const { unpackFromString, decodeGrid, calcGridStats } = require('../../../../utils/grid-codec')
const draftStore = require('../../../../utils/draft-store')
import { workApi } from '../../../../api/work'

Page({
  data: {
    draftList: [],
    showTip: true,
    maxDrafts: draftStore.MAX_DRAFTS
  },

  onShow() {
    this.syncCloudDrafts().then(() => {
      this.loadDrafts()
    })
  },

  closeTip() {
    this.setData({ showTip: false })
  },

  // ========== 从云端拉取属于当前用户的草稿备份 ==========
  async syncCloudDrafts() {
    try {
      const cloudDrafts = await workApi.getMyDrafts()
      if (!cloudDrafts || cloudDrafts.length === 0) return

      // 只读一次索引；原实现是每张草稿都整表读+写，O(n²)
      const known = {}
      draftStore.getDrafts().forEach(d => {
        if (d && d.cloudDraftId) known[d.cloudDraftId] = true
      })

      const pending = []
      cloudDrafts.forEach(cloudDraft => {
        if (!cloudDraft || known[cloudDraft._id]) return

        let timeStamp = Date.now()
        if (cloudDraft.updatedAt) {
          try {
            timeStamp = new Date(cloudDraft.updatedAt).getTime()
          } catch (e) {}
        }

        pending.push({
          id: draftStore.createId(),
          title: cloudDraft.title || '云端恢复草稿',
          grid: cloudDraft.grid,
          size: cloudDraft.gridSize,
          savedAt: timeStamp,
          preview: cloudDraft.cover || '',
          cloudDraftId: cloudDraft._id,
          cloudCover: cloudDraft.cover || '',
          isPublic: cloudDraft.isPublic || false
        })
      })

      if (!pending.length) return
      draftStore.saveDrafts(pending) // 批量写入，索引只落一次
    } catch (e) {
      console.error('❌ 同步云端草稿失败:', e)
    }
  },

  // ========== 本地加载 ==========
  loadDrafts() {
    const list = draftStore.getDrafts()
    const formatted = list.map(d => {
      let beanCount = 0
      let colorCount = 0
      try {
        // 网格已拆到独立 key，按 id 单独读取
        const stats = calcGridStats(decodeGrid(unpackFromString(draftStore.getGrid(d.id))))
        beanCount = stats.totalBeans
        colorCount = stats.colorCount
      } catch (e) {}
      return {
        id: d.id,
        thumb: d.preview || d.cloudCover || '',
        title: d.title || '未命名草稿',
        createDate: this.formatDate(d.savedAt),
        size: `${d.size}×${d.size}`,
        beanCount,
        colorCount,
        updateTime: this.formatTime(d.savedAt)
      }
    })
    this.setData({ draftList: formatted })
  },

  formatDate(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  },

  formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  openDraft(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/subpackages/design-drawing/pages/Super-artboard/index?draftId=${id}`
    })
  },

  onLongPressDraft(e) {
    const id = e.currentTarget.dataset.id
    const draft = draftStore.getDraft(id)
    if (!draft) return

    wx.showActionSheet({
      itemList: ['重命名', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) this.renameDraft(id, draft.title || '')
        else if (res.tapIndex === 1) this.deleteDraft(id)
      }
    })
  },

  renameDraft(id, oldTitle) {
    wx.showModal({
      title: '重命名',
      editable: true,
      placeholderText: '请输入草稿名',
      content: oldTitle,
      success: async (res) => {
        if (!res.confirm) return
        const newTitle = (res.content || '').trim()
        if (!newTitle) {
          wx.showToast({ title: '名字不能为空', icon: 'none' })
          return
        }
        const draft = draftStore.getDraft(id)
        if (!draft) return

        // 1. 更新本地
        draftStore.saveDraft(Object.assign({}, draft, { title: newTitle }))
        
        // 2. 👈 极简：如果已上云，调用 API 更新
        if (draft.cloudDraftId) {
          wx.showLoading({ title: '同步中...', mask: true })
          try {
            await workApi.updateDraftTitle(draft.cloudDraftId, newTitle)
            wx.hideLoading()
          } catch (e) {
            wx.hideLoading()
            console.error('云端修改标题失败', e)
          }
        }
        this.loadDrafts()
        wx.showToast({ title: '已重命名', icon: 'success' })
      }
    })
  },

  deleteDraft(id) {
    wx.showModal({
      title: '删除草稿',
      content: '删除后无法恢复，确定吗？',
      success: async (res) => {
        if (!res.confirm) return
        
        const draft = draftStore.getDraft(id)
        wx.showLoading({ title: '删除中...', mask: true })
  
        try {
          // 👈 只删云端草稿；已发布作品的云端副本不在这里删
          if (draft && draft.cloudDraftId) {
            await workApi.deleteDraft(draft.cloudDraftId)
          }
          // 删除本地
          draftStore.removeDraft(id)
          
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadDrafts()
        } catch (e) {
          wx.hideLoading()
          console.error('删除失败', e)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  newDraft() {
    wx.navigateTo({
      url: '/subpackages/design-drawing/pages/Super-artboard/index'
    })
  }
})