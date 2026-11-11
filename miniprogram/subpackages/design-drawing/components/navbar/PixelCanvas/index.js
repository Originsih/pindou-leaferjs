import { Leafer, Rect, Group } from '@leafer-ui/miniapp'

Component({
  properties: {
    rows: { type: Number, value: 34, observer() { this.updateCellSize() } },
    cols: { type: Number, value: 34, observer() { this.updateCellSize() } },
    canvasWidth: { type: Number, value: 340 },
    canvasHeight: { type: Number, value: 340 },
    currentColor: { type: String, value: "#ff0000" },
    tool: { type: String, value: "pen" },
    brushSize: { type: Number, value: 1 },
    grid: {
      type: Array,
      value: [],
      observer(newVal) {
        if (!newVal || !newVal.length) return
        this._tempGrid = newVal.map(r => [...r])
        if (!this.data.isDrawing) {
          if (this.leafer) {
            this.renderAll()
            this.applyViewTransform()
          } else {
            this._waitGrid = newVal
          }
        }
      }
    }
  },

  data: {
    cellSize: 0,
    isDrawing: false
  },

  leafer: null,
  worldLayer: null,
  gridLayer: null,
  cellLayer: null,
  _boundCanvasNode: null,
  _waitGrid: null,
  _startCell: null,
  _lastCell: null,
  _baseGrid: null,
  _tempGrid: null,
  _gridShapes: [],
  _cellMap: {},
  _panX: 0,
  _panY: 0,
  _zoom: 1,

  lifetimes: {
    attached() {
      this._gridShapes = []
      this._cellMap = {}
      this._panX = 0
      this._panY = 0
      this._zoom = 1
      this.updateCellSize()
    },
    detached() {
      this.destroyLeafer()
    }
  },

  methods: {
    updateCellSize() {
      const { cols } = this.properties
      const actualWidth = this.leafer
        ? this.leafer.width
        : this.properties.canvasWidth
      if (cols > 0 && actualWidth > 0) {
        const newCellSize = actualWidth / cols
        if (newCellSize !== this.data.cellSize) {
          this.setData({ cellSize: newCellSize }, () => {
            if (this.leafer) {
              this.renderAll()
              this.applyViewTransform()
            }
          })
        }
      }
    },

    // ========== 视图变换：缩放/平移只改 Group 属性，不重建图元 ==========
    // 屏幕坐标 = worldLayer.x + 世界坐标 * zoom
    applyViewTransform() {
      if (!this.worldLayer || !this.leafer) return
      const z = this._zoom || 1
      const W = this.leafer.width
      const H = this.leafer.height

      this.worldLayer.scaleX = z
      this.worldLayer.scaleY = z
      // 缩放以画布中心为轴，再叠加平移
      this.worldLayer.x = (this._panX || 0) + (W - W * z) / 2
      this.worldLayer.y = (this._panY || 0) + (H - H * z) / 2
    },

    // ========== 初始化 / 重建 ==========
    initLeaferWithCanvas(canvasNode, actualWidth, actualHeight) {
      if (this.leafer && this._boundCanvasNode === canvasNode) {
        this.applyViewTransform()
        return
      }
      if (this.leafer) this.destroyLeafer()

      this._boundCanvasNode = canvasNode

      const width = actualWidth || this.properties.canvasWidth
      const height = actualHeight || this.properties.canvasHeight

      this.leafer = new Leafer({ view: canvasNode, width, height })

      // 三层结构：worldLayer(缩放+平移) → gridLayer / cellLayer
      this.worldLayer = new Group()
      this.gridLayer = new Group()
      this.cellLayer = new Group()
      this.worldLayer.add(this.gridLayer)
      this.worldLayer.add(this.cellLayer)
      this.leafer.add(this.worldLayer)

      this._gridShapes = []
      this._cellMap = {}

      const pending = this._waitGrid || this.properties.grid
      if (pending && pending.length) {
        this._tempGrid = pending.map(r => [...r])
        this._waitGrid = null
      } else {
        const { rows, cols } = this.properties
        const g = []
        for (let i = 0; i < rows; i++) g.push(new Array(cols).fill(null))
        this._tempGrid = g
      }

      this.updateCellSize()
      this.renderAll()
      this.applyViewTransform()
    },

    destroyLeafer() {
      if (this.leafer) {
        this.leafer.destroy()
        this.leafer = null
      }
      this._boundCanvasNode = null
      this.worldLayer = null
      this.gridLayer = null
      this.cellLayer = null
      this._gridShapes = []
      this._cellMap = {}
    },

    // ========== 对外接口 ==========
    getGrid() {
      return this._tempGrid || this.properties.grid
    },

    setGrid(newGrid) {
      if (!newGrid) return
      this._tempGrid = newGrid.map(r => [...r])
      if (this.leafer) {
        this.renderAll()
        this.applyViewTransform()
      }
    },

    setTool(tool) { this.setData({ tool }) },
    setBrushSize(size) { this.setData({ brushSize: size }) },
    setColor(color) { this.setData({ currentColor: color }) },

    // ========== 全量渲染（仅布局变化时调用） ==========
    renderAll() {
      this.renderGridLayer()
      const currentGrid = this._tempGrid || this.properties.grid
      this.renderCellLayer(currentGrid)
    },

    // ========== 网格线层（按基准尺寸绘制，缩放由 Group 完成） ==========
    renderGridLayer() {
      if (!this.gridLayer) return
      if (!this._gridShapes) this._gridShapes = []

      this._gridShapes.forEach(s => this.gridLayer.remove(s))
      this._gridShapes = []

      const canvasWidth = this.leafer.width
      const canvasHeight = this.leafer.height
      const { rows, cols } = this.properties
      const { cellSize } = this.data

      const lineColor = "#e7e7e7"
      const lineWidth = 0.5

      for (let i = 0; i <= cols; i++) {
        const x = i * cellSize
        const line = new Rect({
          x, y: 0,
          width: lineWidth,
          height: canvasHeight,
          fill: lineColor
        })
        this.gridLayer.add(line)
        this._gridShapes.push(line)
      }
      for (let i = 0; i <= rows; i++) {
        const y = i * cellSize
        const line = new Rect({
          x: 0, y,
          width: canvasWidth,
          height: lineWidth,
          fill: lineColor
        })
        this.gridLayer.add(line)
        this._gridShapes.push(line)
      }

      // 中心虚线
      const centerX = canvasWidth / 2
      const centerY = canvasHeight / 2
      const dashColor = "#999"
      const step = 10

      for (let y = 0; y < canvasHeight; y += step) {
        const dash = new Rect({
          x: centerX - 0.5,
          y,
          width: 1,
          height: Math.min(5, canvasHeight - y),
          fill: dashColor
        })
        this.gridLayer.add(dash)
        this._gridShapes.push(dash)
      }
      for (let x = 0; x < canvasWidth; x += step) {
        const dash = new Rect({
          x,
          y: centerY - 0.5,
          width: Math.min(5, canvasWidth - x),
          height: 1,
          fill: dashColor
        })
        this.gridLayer.add(dash)
        this._gridShapes.push(dash)
      }
    },

    // ========== 色块层 ==========
    renderCellLayer(gridData) {
      if (!this.cellLayer || !gridData) return
      if (!this._cellMap) this._cellMap = {}

      Object.keys(this._cellMap).forEach(key => {
        this.cellLayer.remove(this._cellMap[key])
      })
      this._cellMap = {}

      const { cellSize } = this.data

      for (let y = 0; y < gridData.length; y++) {
        const row = gridData[y]
        for (let x = 0; x < row.length; x++) {
          const color = row[x]
          if (color) {
            const rect = new Rect({
              x: x * cellSize,
              y: y * cellSize,
              width: cellSize,
              height: cellSize,
              fill: color
            })
            this.cellLayer.add(rect)
            this._cellMap[`${y}_${x}`] = rect
          }
        }
      }
    },

    // ========== 增量更新 ==========
    updateCell(row, col, color) {
      if (!this.cellLayer) return
      if (!this._cellMap) this._cellMap = {}

      const key = `${row}_${col}`
      const oldRect = this._cellMap[key]

      if (oldRect && oldRect.fill === color) return

      if (oldRect) {
        this.cellLayer.remove(oldRect)
        delete this._cellMap[key]
      }

      if (color) {
        const { cellSize } = this.data
        const rect = new Rect({
          x: col * cellSize,
          y: row * cellSize,
          width: cellSize,
          height: cellSize,
          fill: color
        })
        this.cellLayer.add(rect)
        this._cellMap[key] = rect
      }
    },

    // ========== 屏幕坐标 → 网格坐标（applyViewTransform 的逆运算） ==========
    screenToCell(x, y) {
      const { cellSize } = this.data
      if (!cellSize || cellSize <= 0) return null

      const z = this._zoom || 1
      const W = this.leafer ? this.leafer.width : this.properties.canvasWidth
      const H = this.leafer ? this.leafer.height : this.properties.canvasHeight

      const layerX = (this._panX || 0) + (W - W * z) / 2
      const layerY = (this._panY || 0) + (H - H * z) / 2

      const worldX = (x - layerX) / z
      const worldY = (y - layerY) / z

      return {
        row: Math.floor(worldY / cellSize),
        col: Math.floor(worldX / cellSize)
      }
    },

    receiveEvent(type, x, y) {
      const { tool } = this.properties
      if (tool === 'move') {
        this.handleMove(type, x, y)
        return
      }
      const cell = this.screenToCell(x, y)
      if (!cell) return
      const { row, col } = cell
      const { rows, cols } = this.properties

      if (tool === 'picker') {
        if (type === 'touchstart') {
          if (row >= 0 && row < rows && col >= 0 && col < cols) {
            const grid = this._tempGrid || this.properties.grid
            const picked = grid[row][col]
            if (picked) this.triggerEvent('pickColor', { color: picked })
          }
        }
        return
      }

      if (row < 0 || row >= rows || col < 0 || col >= cols) return
      if (type === 'touchstart') {
        this.onDrawStart(row, col)
      } else if (type === 'touchmove') {
        this.onDrawMove(row, col)
      } else if (type === 'touchend' || type === 'touchcancel') {
        this.onDrawEnd()
      }
    },

    // ========== 移动：只改 Group 位置 ==========
    handleMove(type, x, y) {
      if (!this.worldLayer) return

      if (type === 'touchstart') {
        this._moveStartX = x
        this._moveStartY = y
        this._moveStartPanX = this._panX || 0
        this._moveStartPanY = this._panY || 0
        return
      }
      if (type !== 'touchmove') return

      this._panX = (this._moveStartPanX || 0) + (x - this._moveStartX)
      this._panY = (this._moveStartPanY || 0) + (y - this._moveStartY)
      this.applyViewTransform()
    },

    // ========== 绘图 ==========
    onDrawStart(row, col) {
      const { tool, currentColor, brushSize } = this.properties

      const baseGrid = this._tempGrid || this.properties.grid
      this._baseGrid = baseGrid.map(r => [...r])
      this._tempGrid = baseGrid.map(r => [...r])

      this._startCell = { row, col }
      this._lastCell = { row, col }
      this.setData({ isDrawing: true })

      if (tool === 'pen') {
        const changed = this.paintBrush(this._tempGrid, row, col, brushSize, currentColor)
        changed.forEach(c => this.updateCell(c.row, c.col, c.color))
      } else if (tool === 'eraser') {
        const changed = this.paintBrush(this._tempGrid, row, col, brushSize, null)
        changed.forEach(c => this.updateCell(c.row, c.col, c.color))
      } else if (tool === 'fill') {
        this.floodFill(this._tempGrid, row, col, currentColor)
        this.renderCellLayer(this._tempGrid)
        this.triggerEvent("gridChange", { grid: this._tempGrid })
        this.setData({ isDrawing: false })
      }
    },

    onDrawMove(row, col) {
      if (!this.data.isDrawing) return
      const { tool, currentColor, brushSize } = this.properties

      if (tool === 'pen' || tool === 'eraser') {
        const tempGrid = this._tempGrid
        const color = tool === 'eraser' ? null : currentColor
        const changed = this.drawLineOnGrid(tempGrid, this._lastCell, { row, col }, brushSize, color)
        this._lastCell = { row, col }
        changed.forEach(c => this.updateCell(c.row, c.col, c.color))
      } else if (tool === 'line') {
        const tempGrid = this._baseGrid.map(r => [...r])
        this.drawLineOnGrid(tempGrid, this._startCell, { row, col }, 1, currentColor)
        this._tempGrid = tempGrid
        this.renderCellLayer(tempGrid)
      } else if (tool === 'shape') {
        const tempGrid = this._baseGrid.map(r => [...r])
        this.drawRectOnGrid(tempGrid, this._startCell, { row, col }, currentColor)
        this._tempGrid = tempGrid
        this.renderCellLayer(tempGrid)
      }
    },

    onDrawEnd() {
      if (!this.data.isDrawing) return
      this.triggerEvent("gridChange", { grid: this._tempGrid })
      this.setData({ isDrawing: false })
      this._startCell = null
      this._lastCell = null
      this._baseGrid = null
    },

    paintBrush(grid, row, col, size, color) {
      const { rows, cols } = this.properties
      const offset = Math.floor((size - 1) / 2)
      const changed = []
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const r = row + dy - offset
          const c = col + dx - offset
          if (r >= 0 && r < rows && c >= 0 && c < cols) {
            if (grid[r][c] !== color) {
              grid[r][c] = color
              changed.push({ row: r, col: c, color })
            }
          }
        }
      }
      return changed
    },

    drawLineOnGrid(grid, start, end, size, color) {
      let x0 = start.col, y0 = start.row
      let x1 = end.col, y1 = end.row
      const dx = Math.abs(x1 - x0)
      const dy = Math.abs(y1 - y0)
      const sx = x0 < x1 ? 1 : -1
      const sy = y0 < y1 ? 1 : -1
      let err = dx - dy
      const changed = []

      while (true) {
        const cells = this.paintBrush(grid, y0, x0, size, color)
        changed.push(...cells)
        if (x0 === x1 && y0 === y1) break
        const e2 = 2 * err
        if (e2 > -dy) { err -= dy; x0 += sx }
        if (e2 < dx) { err += dx; y0 += sy }
      }
      return changed
    },

    floodFill(grid, row, col, newColor) {
      const { rows, cols } = this.properties
      const oldColor = grid[row][col]
      if (oldColor === newColor) return
      const stack = [[row, col]]
      while (stack.length > 0) {
        const [r, c] = stack.pop()
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue
        if (grid[r][c] !== oldColor) continue
        grid[r][c] = newColor
        stack.push([r + 1, c])
        stack.push([r - 1, c])
        stack.push([r, c + 1])
        stack.push([r, c - 1])
      }
    },

    drawRectOnGrid(grid, start, end, color) {
      const r1 = Math.min(start.row, end.row)
      const r2 = Math.max(start.row, end.row)
      const c1 = Math.min(start.col, end.col)
      const c2 = Math.max(start.col, end.col)
      for (let c = c1; c <= c2; c++) {
        grid[r1][c] = color
        grid[r2][c] = color
      }
      for (let r = r1; r <= r2; r++) {
        grid[r][c1] = color
        grid[r][c2] = color
      }
    },

    // ========== 缩放 / 复位（只改变换，不重建图元） ==========
    zoomIn() {
      let z = (this._zoom || 1) * 1.2
      if (z > 3) z = 3
      this._zoom = z
      this.applyViewTransform()
    },

    zoomOut() {
      let z = (this._zoom || 1) / 1.2
      if (z < 0.5) z = 0.5
      this._zoom = z
      this.applyViewTransform()
    },

    resetView() {
      this._panX = 0
      this._panY = 0
      this._zoom = 1
      this.applyViewTransform()
    },

    // ========== 翻转/清空 ==========
    flipCanvas() {
      const currentGrid = this._tempGrid || this.properties.grid
      if (!currentGrid) return
      const newGrid = currentGrid.map(row => [...row].reverse())
      this._tempGrid = newGrid
      this.renderCellLayer(newGrid)
      this.triggerEvent("gridChange", { grid: newGrid })
    },

    clearCanvas() {
      const { rows, cols } = this.properties
      const newGrid = []
      for (let i = 0; i < rows; i++) {
        newGrid.push(new Array(cols).fill(null))
      }
      this._tempGrid = newGrid
      this.renderCellLayer(newGrid)
      this.triggerEvent("gridChange", { grid: newGrid })
    },

    // ========== 导出预览图 ==========
    // 导出前临时把视图复位，避免用户缩放/平移过之后封面偏移或被裁切
    exportImage() {
      return new Promise((resolve) => {
        if (!this.leafer || !this._boundCanvasNode) {
          console.warn('exportImage: leafer 或 canvas 未就绪')
          resolve('')
          return
        }

        const prevZoom = this._zoom || 1
        const prevPanX = this._panX || 0
        const prevPanY = this._panY || 0

        const restore = () => {
          this._zoom = prevZoom
          this._panX = prevPanX
          this._panY = prevPanY
          this.applyViewTransform()
        }

        this._zoom = 1
        this._panX = 0
        this._panY = 0
        this.applyViewTransform()

        // 等一帧确保 Leafer 完成重绘
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvas: this._boundCanvasNode,
            success: (res) => {
              restore()
              resolve(res.tempFilePath || '')
            },
            fail: (e) => {
              console.error('canvasToTempFilePath 失败', e)
              restore()
              resolve('')
            }
          })
        }, 120)
      })
    }
  }
})
