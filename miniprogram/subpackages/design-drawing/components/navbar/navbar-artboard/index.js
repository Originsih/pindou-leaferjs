Component({
    properties: {
      bgColor: {
        type: String,
        value: "#fff"
      },
      showBack: {
        type: Boolean,
        value: true
      },
      gridSize: {
        type: Number,
        value: 64
      },
      isDarkMode: { 
        type: Boolean,
        value: false
      },
      // 是否显示「发布作品」按钮（全局发布开关关闭时，普通用户看不到）
      canPublish: {
        type: Boolean,
        value: true
      }
    },
    data: {
      statusBarHeight: 0
    },
    lifetimes: {
      attached() {
        const sysInfo =  wx.getWindowInfo()
        this.setData({
          statusBarHeight: sysInfo.statusBarHeight
        })
      }
    },
    methods: {
      goBack() {
        const pages = getCurrentPages();
        if (pages.length > 1) {
          wx.navigateBack();
        } else {
          wx.reLaunch({ url: '/pages/drawing/index' });
        }
      },
      onChangeSize() {
        this.triggerEvent('changeSize')
      },
      onToggleDark() {
        this.triggerEvent('toggleDark')
      },
      onPreview() {
        this.triggerEvent('preview')
      },
      onPublish() {
        this.triggerEvent('publish')
      }
    }
  })
  
