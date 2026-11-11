const { getHistory, clearHistory } = require('../../../../utils/history')

Page({
  data: {
    statusBarHeight: 0,
    leftList: [],
    rightList: [],
    hasHistory: false
  },

  onLoad() {
    const systemInfo = wx.getWindowInfo()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    })
  },

  onShow() {
    // 每次进入页面重新加载本地记录
    this.loadHistory()
  },

  loadHistory() {
    const list = getHistory()
    
    if (!list || list.length === 0) {
      this.setData({ hasHistory: false, leftList: [], rightList: [] })
      return
    }
    
    this.setData({ hasHistory: true })
    this.splitWaterfall(list)
  },

  // 瀑布流分割函数
  splitWaterfall(list) {
    const left = []
    const right = []
    list.forEach((item, index) => {
      if (index % 2 === 0) {
        left.push(item)
      } else {
        right.push(item)
      }
    })
    this.setData({
      leftList: left,
      rightList: right
    })
  },

  // 点击卡片跳转到最新详情页
  goDetail(e) {
    const item = e.currentTarget.dataset.item
    wx.navigateTo({
      // 👈 修正了老的跳转路径，指向最新的 WorkDetail
      url: `/subpackages/design-drawing/pages/WorkDetail/index?id=${item.id}`
    })
  },

  // 清空历史记录
  clearAll() {
    wx.showModal({
      title: '清空记录',
      content: '确定要清空所有浏览记录吗？',
      success: (res) => {
        if (res.confirm) {
          clearHistory()
          this.loadHistory()
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  }
})