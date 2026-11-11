// utils/image-parser.js
const { nearestHex } = require('./nearest-color')

/**
 * 将 Canvas 像素解析为拼豆网格数据
 * @param {Object} options ctx, originalW, originalH, imageX, imageY, imgW, imgH, gridSize, gridCols, gridRows
 * @returns {Array} 二维 HEX 数组
 */
function parseCanvasToGrid(options) {
  const { ctx, originalW, originalH, imageX, imageY, imgW, imgH, gridSize, gridCols, gridRows } = options

  const imageData = ctx.getImageData(0, 0, originalW, originalH)
  const data = imageData.data
  const ratioW = originalW / imgW
  const ratioH = originalH / imgH
  const grid = []

  const radius = 2

  for (let r = 0; r < gridRows; r++) {
    const row = []
    for (let c = 0; c < gridCols; c++) {
      const viewCenterX = c * gridSize + gridSize / 2
      const viewCenterY = r * gridSize + gridSize / 2

      const origX = (viewCenterX - imageX) * ratioW
      const origY = (viewCenterY - imageY) * ratioH

      if (origX < 0 || origX >= originalW || origY < 0 || origY >= originalH) {
        row.push(null)
        continue
      }

      // 邻域采样，抵抗网格线干扰
      let totalR = 0
      let totalG = 0
      let totalB = 0
      let count = 0

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = Math.floor(origX + dx)
          const sy = Math.floor(origY + dy)
          if (sx >= 0 && sx < originalW && sy >= 0 && sy < originalH) {
            const pIndex = (sy * originalW + sx) * 4
            totalR += data[pIndex]
            totalG += data[pIndex + 1]
            totalB += data[pIndex + 2]
            count++
          }
        }
      }

      if (count === 0) {
        row.push(null)
        continue
      }

      const pR = totalR / count
      const pG = totalG / count
      const pB = totalB / count

      // 接近纯白视为空白
      if (pR > 235 && pG > 235 && pB > 235) {
        row.push(null)
        continue
      }

      row.push(nearestHex(pR | 0, pG | 0, pB | 0))
    }
    grid.push(row)
  }
  return grid
}

module.exports = {
  parseCanvasToGrid
}
