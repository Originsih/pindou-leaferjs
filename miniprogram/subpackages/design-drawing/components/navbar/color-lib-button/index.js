Component({
  properties: {
    currentColor: { type: String, value: '#FF6B35' },
    isDarkMode: { type: Boolean, value: false }
  },

  methods: {
    // 点击 → 打开 221 色全色板
    onTap() {
      this.triggerEvent('open')
    }
  }
})
