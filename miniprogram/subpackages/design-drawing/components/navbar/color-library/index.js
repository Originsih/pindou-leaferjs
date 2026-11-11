const BEAD_COLORS = require('../../../../../utils/bead-colors')
const { addBaseColor } = require('../../../../../utils/recent-colors')

Component({
  properties: {
    visible: { type: Boolean, value: false },
    currentColor: { type: String, value: '#FF6B35' },
    isDarkMode: { type: Boolean, value: false }
  },
  data: {
    groups: [],
    currentGroup: 'A',
    colorList: []
  },
  lifetimes: {
    attached() {
      const groups = Object.keys(BEAD_COLORS)
      this.setData({
        groups,
        currentGroup: groups[0],
        colorList: BEAD_COLORS[groups[0]]
      })
    }
  },
  observers: {
    visible(val) {
      if (val && this.data.groups.length) {
        this.setData({
          currentGroup: this.data.groups[0],
          colorList: BEAD_COLORS[this.data.groups[0]]
        })
      }
    }
  },
  methods: {
    closeLibrary() {
      this.triggerEvent('close')
    },
    switchGroup(e) {
      const group = e.currentTarget.dataset.group
      this.setData({ currentGroup: group, colorList: BEAD_COLORS[group] })
    },
    onSelect(e) {
      const { color, code } = e.currentTarget.dataset
      addBaseColor({ code, color })
      this.triggerEvent('selectColor', { color, name: code })
      setTimeout(() => this.triggerEvent('close'), 150)
    }
  }
})
