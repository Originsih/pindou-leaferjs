import { favoriteApi } from '../../../../api/favorite' // 👈 退4层

Page({
  data: {
    statusBarHeight: 0,
    showTip: true,
    leftList: [],
    rightList: [],
    loading: true
  },

  onLoad() {
    const sys = wx.getWindowInfo()
    this.setData({ statusBarHeight: sys.statusBarHeight })
  },

  onShow() {
    // 每次进入页面都自动刷新一次，保证数据最新
    this.loadFavorites()
  },

  // 下拉刷新处理
  onPullDownRefresh() {
    this.loadFavorites().then(() => {
      wx.stopPullDownRefresh() // 数据加载完后停止下拉动画
    })
  },

  closeTip() {
    this.setData({ showTip: false })
  },

  // 从云端拉取收藏列表
  async loadFavorites() {
    this.setData({ loading: true })

    try {
      // 👈 极简：直接调用 API，底层已经帮你处理好了两层查询和过滤
      const list = await favoriteApi.getMyFavorites()

      // 映射 UI 需要的字段
      const formatted = list.map(work => ({
        id: work._id,
        title: work.title || '未命名作品',
        // 留空交给 wxml 的「暂无预览」占位，原来指向的占位图路径并不存在
        cover: work.cover || '',
        avatar: work.authorAvatar || '',
        userNick: work.authorNick || '拼豆爱好者',
        useCount: work.madeCount || 0,
        beanCount: work.totalBeans || 0
      }))

      this.splitWaterfall(formatted)
      this.setData({ loading: false })
    } catch (e) {
      console.error('获取收藏列表失败', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 点击卡片跳转详情
  goDetail(e) {
    const item = e.currentTarget.dataset.item
    wx.navigateTo({
      url: `/subpackages/design-drawing/pages/WorkDetail/index?id=${item.id}`
    })
  },

  // 长按取消收藏
  handleLongPress(e) {
    const item = e.currentTarget.dataset.item
    const that = this
    
    wx.showModal({
      title: "取消收藏",
      content: "确定要取消收藏该图纸吗？",
      success: async (res) => {
        if (!res.confirm) return
        
        wx.showLoading({ title: '处理中...' })

        try {
          // 👈 极简：调用 API 删除记录并减少收藏数
          await favoriteApi.removeFav(item.id)

          wx.hideLoading()
          wx.showToast({ title: '已取消收藏', icon: 'success' })
          
          // 重新加载列表
          that.loadFavorites()
        } catch (e) {
          wx.hideLoading()
          console.error('取消收藏失败', e)
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
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
  }
})