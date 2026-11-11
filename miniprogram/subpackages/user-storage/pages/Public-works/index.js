import { workApi } from '../../../../api/work'

Page({
  data: {
    list: [],
    page: 0,
    pageSize: 10,
    hasMore: true,
    loading: false
  },

  onLoad() {
    this.loadList(true)
  },

  onShow() {
    // 每次进页面自动刷新，确保状态改变后能同步
    if (!this.data.loading) {
      this.loadList(true)
    }
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false)
    }
  },

  async loadList(reset) {
    if (this.data.loading) return
    this.setData({ loading: true })

    const page = reset ? 0 : this.data.page

    try {
      // 👈 极简：调 API 获取，传 true 代表获取公开作品
      const data = await workApi.getMyWorks(true, page * this.data.pageSize, this.data.pageSize)

      const newList = data.map(item => ({
        id: item._id,
        thumb: item.cover || '',
        title: item.title || '未命名作品',
        size: `${item.gridSize || 34}×${item.gridSize || 34}`,
        beanCount: item.totalBeans || 0,
        colorCount: item.colorCount || 0,
        updateTime: this.formatTime(item.updatedAt || item.createdAt)
      }))

      this.setData({
        list: reset ? newList : this.data.list.concat(newList),
        page: page + 1,
        hasMore: newList.length >= this.data.pageSize,
        loading: false
      })
    } catch (e) {
      console.error('加载失败', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  openWork(e) {
    const id = e.currentTarget.dataset.id
    // 注意：我帮你把路径修正成了最新的 WorkDetail，你之前的路径是老版本
    wx.navigateTo({
      url: `/subpackages/design-drawing/pages/WorkDetail/index?id=${id}`
    })
  },

  deleteWork(e) {
    const id = e.currentTarget.dataset.id
    const that = this

    wx.showModal({
      title: '删除作品',
      content: '删除后无法恢复，确定吗？',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        try {
          // 👈 极简：调 API 删除
          await workApi.deleteWork(id)
          
          wx.hideLoading()
          wx.showToast({ title: '已删除' })
          // 本地直接移除，不需要重新请求网络
          that.setData({
            list: that.data.list.filter(item => item.id !== id)
          })
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }
})