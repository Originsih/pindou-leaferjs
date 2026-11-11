Component({
    properties: {
      canUndo: {
        type: Boolean,
        value: false
      },
      canRedo: {
        type: Boolean,
        value: false
      },
      currentTool: {
        type: String,
        value: 'pen'
      },
      isDarkMode: { 
        type: Boolean,
        value: false 
      }  
    },
    methods: {
      onUndo() {
        this.triggerEvent('undo')
      },
      onRedo() {
        this.triggerEvent('redo')
      },
      onReset() {
        this.triggerEvent('reset')
      },
      onFlip() {
        this.triggerEvent('flip')
      },
      onSwitchTool(e) {
        const tool = e.currentTarget.dataset.tool
        this.triggerEvent('switchTool', { tool })
      },
      onClear() {
        this.triggerEvent('clear')
      }
    }
  })
  