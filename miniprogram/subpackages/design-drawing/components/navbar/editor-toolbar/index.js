Component({
    properties: {
      brushSize: { type: Number, value: 1 },
      currentTool: { type: String, value: 'pen' },
      minSize: { type: Number, value: 1 },
      maxSize: { type: Number, value: 10 },
      isDarkMode: { type: Boolean, value: false }  
    },
    data: {
      toolList: [
        { key: 'pen',    icon: '/static/images/ju-icon/paintbrush.png',    name: '画笔' },
        { key: 'eraser', icon: '/static/images/ju-icon/eraser.png',        name: '橡皮' },
        { key: 'fill',   icon: '/static/images/ju-icon/padding.png',       name: '填充' },
        { key: 'picker', icon: '/static/images/ju-icon/Take-color.png',    name: '取色' },
        { key: 'line',   icon: '/static/images/ju-icon/Straight-line.png', name: '直线' },
        { key: 'shape',  icon: '/static/images/ju-icon/shape.png',         name: '形状' }
      ]
    },
    methods: {
      onSwitchTool(e) {
        const tool = e.currentTarget.dataset.tool
        this.triggerEvent('changeTool', { tool })
      },
      onDecrease() {
        if (this.data.brushSize <= this.data.minSize) return
        this.triggerEvent('changeSize', { size: this.data.brushSize - 1 })
      },
      onIncrease() {
        if (this.data.brushSize >= this.data.maxSize) return
        this.triggerEvent('changeSize', { size: this.data.brushSize + 1 })
      }
    }
  })