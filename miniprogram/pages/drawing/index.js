import { workApi } from '../../api/work'// 👈 引入封装好的 API

Page({
  data: {
    statusBarHeight: 0,
    leftList: [],
    rightList: [],

    // 懒加载配置
    skip: 0,
    pageSize: 10,
    hasMore: true,
    loading: false,

    // 搜索
    keyword: '',
    searchMode: false,
    searching: false,
    searchSkip: 0,
    searchHasMore: true,
    searchEmpty: false
  },

  _searchTimer: null,

  onLoad() {
    const systemInfo = wx.getWindowInfo()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    })

    // 首次加载
    this.loadMoreList()
  },

  onUnload() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
  },

  // ============ 开启右上角分享功能 ============

  // 分享给微信好友
  onShareAppMessage() {
    return {
      title: '发现了好多超棒的拼豆图纸，快来一起看看！',
      path: '/pages/drawing/index',
      imageUrl: ''
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '拼豆图纸工坊 - 广场',
      query: '',
      imageUrl: ''
    }
  },

  // ====================================================

  // 把云端数据映射成列表项需要的字段
  mapItem(item) {
    return {
      id: item._id,
      title: item.title || '未命名作品',
      cover: item.cover || '',
      avatar: item.authorAvatar || '',
      userNick: item.authorNick || '拼豆爱好者',
      useCount: item.madeCount || 0,
      beanCount: item.totalBeans || 0
    }
  },

  // 把新数据追加进瀑布流（较短的一列优先）
  appendList(newList, reset) {
    let leftList = reset ? [] : this.data.leftList.slice()
    let rightList = reset ? [] : this.data.rightList.slice()

    newList.forEach(item => {
      if (leftList.length <= rightList.length) leftList.push(item)
      else rightList.push(item)
    })

    this.setData({ leftList, rightList })
  },

  // ==================== 广场列表 ====================

  // 核心：从云端分批拉取数据
  async loadMoreList() {
    if (this.data.loading || !this.data.hasMore) return
    this.setData({ loading: true })

    try {
      const data = await workApi.getSquareList(this.data.skip, this.data.pageSize)
      const newList = data.map(item => this.mapItem(item))

      this.appendList(newList, false)

      this.setData({
        skip: this.data.skip + newList.length,
        hasMore: newList.length >= this.data.pageSize,
        loading: false
      })

      wx.stopPullDownRefresh()
    } catch (e) {
      console.error('加载失败', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
      wx.stopPullDownRefresh()
    }
  },

  // ==================== 搜索 ====================

  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })

    if (this._searchTimer) clearTimeout(this._searchTimer)

    // 防抖：停止输入 400ms 后才真正请求
    this._searchTimer = setTimeout(() => {
      const kw = keyword.trim()
      if (kw) this.doSearch(true)
      else this.exitSearch()
    }, 400)
  },

  onSearchConfirm(e) {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    const keyword = (e.detail.value || this.data.keyword || '').trim()
    this.setData({ keyword })
    if (keyword) this.doSearch(true)
    else this.exitSearch()
  },

  // 清空搜索，回到正常广场流
  exitSearch() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.setData({
      keyword: '',
      searchMode: false,
      searching: false,
      searchEmpty: false,
      searchSkip: 0,
      searchHasMore: true,
      leftList: [],
      rightList: [],
      skip: 0,
      hasMore: true
    })
    this.loadMoreList()
  },

  async doSearch(reset) {
    const keyword = (this.data.keyword || '').trim()
    if (!keyword) return
    if (this.data.searching) return

    const skip = reset ? 0 : this.data.searchSkip
    this.setData({ searching: true, searchMode: true, searchEmpty: false })

    try {
      const data = await workApi.searchWorks(keyword, skip, this.data.pageSize)
      const newList = data.map(item => this.mapItem(item))

      this.appendList(newList, reset)

      this.setData({
        searching: false,
        searchSkip: skip + newList.length,
        searchHasMore: newList.length >= this.data.pageSize,
        searchEmpty: reset && newList.length === 0
      })
    } catch (e) {
      console.error('搜索失败', e)
      this.setData({ searching: false })
      wx.showToast({ title: '搜索失败', icon: 'none' })
    }
  },

  loadMoreSearch() {
    if (!this.data.searchHasMore || this.data.searching) return
    this.doSearch(false)
  },

  // ==================== 滚动 / 刷新 ====================

  onScrollToLower() {
    if (this.data.searchMode) this.loadMoreSearch()
    else this.loadMoreList()
  },

  // 下拉刷新
  onPullDownRefresh() {
    if (this.data.searchMode) {
      this.setData({ searchSkip: 0, searchHasMore: true })
      this.doSearch(true).then(() => wx.stopPullDownRefresh())
      return
    }

    this.setData({
      leftList: [],
      rightList: [],
      skip: 0,
      hasMore: true
    })
    this.loadMoreList()
  },

  // ==================== 交互 ====================

  // 点击卡片跳转详情
  goDetail(e) {
    const item = e.currentTarget.dataset.item;
    this._needRefresh = true; // 标记需要刷新
    wx.navigateTo({
      url: `/subpackages/design-drawing/pages/WorkDetail/index?id=${item.id}`
    })
  },

  // ========== 长按作品 → 举报 ==========
  onLongPressWork(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item.id) return

    const reasons = ['色情低俗', '违法违规', '侵犯版权', '广告骚扰', '其他']
    wx.showActionSheet({
      itemList: reasons,
      success: (res) => {
        const reason = reasons[res.tapIndex]
        wx.showModal({
          title: '确认举报',
          content: `确定举报「${item.title || '该作品'}」为「${reason}」吗？我们会尽快核实处理。`,
          success: async (r) => {
            if (!r.confirm) return
            wx.showLoading({ title: '提交中...', mask: true })
            try {
              await workApi.report(item.id, reason)
              wx.hideLoading()
              wx.showToast({ title: '举报已提交', icon: 'success' })
            } catch (err) {
              wx.hideLoading()
              const msg = (err && err.message) || '举报失败'
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

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }

    // 从详情页返回，静默局部更新
    if (this._needRefresh) {
      this._needRefresh = false;
      this.refreshSilently();
    }
  },

  // 静默刷新当前列表里的数据（更新人用次数、移除被删除的作品）
  async refreshSilently() {
    const currentAll = [...this.data.leftList, ...this.data.rightList];
    if (currentAll.length === 0) return;

    const ids = currentAll.map(item => item.id);

    try {
      const data = await workApi.getLatestWorksByIds(ids);

      const latestMap = {};
      data.forEach(item => {
        latestMap[item._id] = this.mapItem(item)
      });

      // 原地替换数据，并剔除云端已经不存在的作品（被删除/下架/未过审）
      const newLeft = this.data.leftList
        .map(item => latestMap[item.id])
        .filter(Boolean);

      const newRight = this.data.rightList
        .map(item => latestMap[item.id])
        .filter(Boolean);

      this.setData({
        leftList: newLeft,
        rightList: newRight
      });

    } catch (e) {
      console.error('静默刷新失败', e);
    }
  }
})
