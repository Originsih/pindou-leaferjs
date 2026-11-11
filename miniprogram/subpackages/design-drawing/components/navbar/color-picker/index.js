const { getBaseColors } = require('../../../../../utils/recent-colors')

Component({
  properties: {
    currentColor: {
      type: String,
      value: '#FF6B35',
      observer() {
        // 从 221 色库选了新色后，常用色需要同步刷新
        this.refresh()
      }
    },
    // 之前漏声明，导致「当前颜色」的色号一直显示空白
    currentColorName: { type: String, value: '' },
    isDarkMode: { type: Boolean, value: false }
  },

  data: {
    colorList: []
  },

  lifetimes: {
    attached() {
      this.refresh()
    }
  },

  methods: {
    refresh() {
      this.setData({ colorList: getBaseColors() })
    },

    onSelect(e) {
      const { color, code } = e.currentTarget.dataset
      this.triggerEvent('selectColor', { color, name: code })
    }
  }
})
