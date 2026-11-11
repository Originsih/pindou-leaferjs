Component({
    data: {
      selected: 0,
      list: [
        {
          pagePath: "/pages/drawing/index",
          text: "图纸",
          iconPath: "/static/images/tab/tz.png",
          selectedIconPath: "/static/images/tab/tz-id.png"
        },
        {
          pagePath: "/pages/design/index",
          text: "设计",
          iconPath: "/static/images/tab/sj.png",
          selectedIconPath: "/static/images/tab/sj-id.png"
        },
        {
          pagePath: "/pages/user/index",
          text: "我的",
          iconPath: "/static/images/tab/wd.png",
          selectedIconPath: "/static/images/tab/wd-id.png"
        }
      ]
    },
  
    methods: {
      switchTab(e) {
        const path = e.currentTarget.dataset.path;
        if (path) {
          wx.switchTab({ url: path });
        }
      }
    }
  });