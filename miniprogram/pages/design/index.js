Page({
    data: {
      statusBarHeight: 0
    },
    onLoad() {
      const systemInfo =  wx.getWindowInfo()
      this.setData({
        statusBarHeight: systemInfo.statusBarHeight || 0
      })
    },
    // 图片转图纸
    goImageToPic() {
      wx.navigateTo({ url: "/subpackages/design-drawing/pages/converter/index" });
    },
    // 导入拼豆图纸
    goImportPic() {
      wx.navigateTo({ url: "/subpackages/design-drawing/pages/Recognition/index" });
    }, 
    // 超级画板
    goCanvas() {
      wx.navigateTo({ url: "/subpackages/design-drawing/pages/Super-artboard/index" });
    },
    onShow() {
        if (typeof this.getTabBar === 'function' && this.getTabBar()) {
          this.getTabBar().setData({ selected: 1 });
   }
},
})