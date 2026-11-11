const { unpackFromString, decodeGrid, getColorCode } = require('../../../../../utils/grid-codec')

Component({
  properties: {
    gridStr: {
      type: String,
      value: '',
      observer() {
        this._tmpPath = null // 数据变了，缓存作废
        if (this._ready) this.draw()
      }
    },
    gridSize: {
      type: Number,
      value: 34,
      observer() {
        this._tmpPath = null
        if (this._ready) this.draw()
      }
    }
  },

  lifetimes: {
    ready() {
      this._ready = true
      this.draw()
    }
  },

  methods: {
    draw() {
      this.exportImage()
        .then((tmpPath) => {
          this._tmpPath = tmpPath
          this.triggerEvent('ready', { tmpPath })
        })
        .catch((e) => {
          console.error('导出图纸失败', e)
        })
    },

    /**
     * 对外接口：拿到图纸图片的临时路径（已渲染过就直接复用）
     * @returns {Promise<String>}
     */
    exportImage() {
      if (this._tmpPath) return Promise.resolve(this._tmpPath)

      return new Promise((resolve, reject) => {
        const str = this.properties.gridStr
        const size = this.properties.gridSize
        if (!str || !size) {
          reject(new Error('图纸数据为空'))
          return
        }

        let grid
        try {
          grid = decodeGrid(unpackFromString(str))
        } catch (e) {
          reject(new Error('图纸解码失败'))
          return
        }
        if (!Array.isArray(grid) || !grid.length) {
          reject(new Error('图纸数据为空'))
          return
        }

        this.createSelectorQuery()
          .select('#gridCanvas')
          .fields({ node: true, size: true })
          .exec((res) => {
            if (!res[0] || !res[0].node) {
              reject(new Error('画布未就绪，请切到图纸模式后重试'))
              return
            }

            const canvas = res[0].node
            const ctx = canvas.getContext('2d')

            // 固定导出分辨率 1200×1200，保证色号清晰
            const EXPORT_SIZE = 1200
            canvas.width = EXPORT_SIZE
            canvas.height = EXPORT_SIZE

            // 直接用 1200 逻辑坐标绘制，不乘 dpr
            this._render(ctx, EXPORT_SIZE, EXPORT_SIZE, grid, size)

            // 等一帧确保绘制完成再导出
            setTimeout(() => {
              wx.canvasToTempFilePath({
                canvas,
                success: (r) => {
                  this._tmpPath = r.tempFilePath
                  resolve(r.tempFilePath)
                },
                fail: () => reject(new Error('导出图纸失败'))
              })
            }, 200)
          })
      })
    },

    _render(ctx, W, H, grid, size) {
      // 白底
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)

      // 布局：pad 按宽度比例，不同分辨率视觉一致
      const pad = W * 0.09
      const availW = W - pad * 2
      const availH = H - pad * 2
      const cellSize = Math.min(availW / size, availH / size)
      const gridW = cellSize * size
      const gridH = cellSize * size
      const offsetX = pad + (availW - gridW) / 2
      const offsetY = pad + (availH - gridH) / 2

      // 色号文字：格子够大才画
      const showLabel = cellSize >= 12
      const fontSize = cellSize * 0.42
      ctx.font = `${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // 色块 + 色号
      for (let r = 0; r < size; r++) {
        const row = grid[r]
        if (!Array.isArray(row)) continue
        for (let c = 0; c < size; c++) {
          const color = row[c]
          const x = offsetX + c * cellSize
          const y = offsetY + r * cellSize

          if (color) {
            ctx.fillStyle = color
            ctx.fillRect(x, y, cellSize, cellSize)

            if (showLabel) {
              const code = getColorCode(color)
              if (code) {
                ctx.fillStyle = this._getContrastColor(color)
                ctx.fillText(code, x + cellSize / 2, y + cellSize / 2)
              }
            }
          }
        }
      }

      // 网格线
      ctx.strokeStyle = '#cccccc'
      ctx.lineWidth = Math.max(0.5, W / 1200)
      for (let i = 0; i <= size; i++) {
        const x = offsetX + i * cellSize
        const y = offsetY + i * cellSize

        ctx.beginPath()
        ctx.moveTo(x, offsetY)
        ctx.lineTo(x, offsetY + gridH)
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(offsetX, y)
        ctx.lineTo(offsetX + gridW, y)
        ctx.stroke()
      }

      // 坐标数字：字号随格子缩放
      const numSize = cellSize * 0.6
      ctx.font = `bold ${numSize}px sans-serif`
      ctx.fillStyle = '#333333'

      // 自适应密度
      const numWidth = numSize * 1.3
      let step = Math.ceil(numWidth / cellSize)
      if (step < 1) step = 1
      if (step > 1 && step < 5) step = 5
      else if (step > 5 && step < 10) step = 10

      const numOffset = pad * 0.55

      for (let i = 0; i < size; i++) {
        const cx = offsetX + i * cellSize + cellSize / 2
        const cy = offsetY + i * cellSize + cellSize / 2

        const num1 = i + 1
        const num2 = size - i

        const show1 = (num1 === 1 || num1 === size || num1 % step === 0)
        const show2 = (num2 === 1 || num2 === size || num2 % step === 0)

        if (show1) {
          ctx.fillText(String(num1), cx, offsetY - numOffset)
          ctx.fillText(String(num1), offsetX - numOffset, cy)
        }
        if (show2) {
          ctx.fillText(String(num2), cx, offsetY + gridH + numOffset)
          ctx.fillText(String(num2), offsetX + gridW + numOffset, cy)
        }
      }
    },

    _getContrastColor(hex) {
      if (!hex) return '#333'
      const c = hex.replace('#', '')
      if (c.length !== 6) return '#333'
      const r = parseInt(c.slice(0, 2), 16)
      const g = parseInt(c.slice(2, 4), 16)
      const b = parseInt(c.slice(4, 6), 16)
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      return lum > 0.62 ? '#333333' : '#ffffff'
    }
  }
})
