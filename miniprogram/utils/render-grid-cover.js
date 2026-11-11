// utils/render-grid-cover.js
//
// 把网格数据渲染成一张「图纸风格」的封面图（白底 + 色块 + 网格线）。
// 用于作品发布时的封面，避免直接拿用户上传的原图当封面。
//
// 与 components/preview/bead-grid 的渲染风格保持一致，但：
//   - 不画色号和坐标（封面尺寸下会糊成一团）
//   - 尺寸默认 800，兼顾清晰度与体积（云存储 + imgSecCheck 1MB 限制）

const { unpackFromString, decodeGrid } = require('./grid-codec')

function drawGrid(ctx, W, grid, size) {
  // 白底
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, W)

  const pad = Math.round(W * 0.06)
  const avail = W - pad * 2
  const cell = avail / size

  // 色块
  for (let r = 0; r < size; r++) {
    const row = grid[r]
    if (!Array.isArray(row)) continue
    for (let c = 0; c < size; c++) {
      const color = row[c]
      if (!color) continue
      ctx.fillStyle = color
      // 向上取整避免格子之间出现 1px 白缝
      ctx.fillRect(pad + c * cell, pad + r * cell, Math.ceil(cell), Math.ceil(cell))
    }
  }

  // 网格线
  const gridSize = size * cell
  ctx.strokeStyle = '#d9d9d9'
  ctx.lineWidth = Math.max(0.5, W / 1600)

  for (let i = 0; i <= size; i++) {
    const p = pad + i * cell

    ctx.beginPath()
    ctx.moveTo(p, pad)
    ctx.lineTo(p, pad + gridSize)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(pad, p)
    ctx.lineTo(pad + gridSize, p)
    ctx.stroke()
  }
}

/**
 * 生成图纸封面
 * @param {String} gridStr  已打包的网格字符串
 * @param {Number} size     网格边长（如 64）
 * @param {Object} options  { width }
 * @returns {Promise<String>} 临时文件路径
 */
function renderGridCover(gridStr, size, options) {
  return new Promise((resolve, reject) => {
    if (!gridStr) {
      reject(new Error('图纸数据为空'))
      return
    }

    let grid
    try {
      grid = decodeGrid(unpackFromString(gridStr))
    } catch (e) {
      reject(new Error('图纸数据解析失败'))
      return
    }

    if (!Array.isArray(grid) || !grid.length) {
      reject(new Error('图纸数据为空'))
      return
    }

    const n = Number(size) || grid.length
    const W = (options && options.width) || 800

    const canvas = wx.createOffscreenCanvas({ type: '2d', width: W, height: W })
    const ctx = canvas.getContext('2d')

    try {
      drawGrid(ctx, W, grid, n)
    } catch (e) {
      reject(new Error('绘制封面失败'))
      return
    }

    // 等一帧确保绘制完成
    setTimeout(() => {
      wx.canvasToTempFilePath({
        canvas,
        success: (res) => resolve(res.tempFilePath),
        fail: () => reject(new Error('导出封面失败'))
      })
    }, 60)
  })
}

module.exports = { renderGridCover }
