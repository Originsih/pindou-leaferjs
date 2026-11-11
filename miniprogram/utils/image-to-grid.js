// utils/image-to-grid.js
const { nearestHex, nearestIn, hexToRgb } = require('./nearest-color')

/**
 * 将图片转换为拼豆网格数据
 * @param {String} imagePath 图片临时路径
 * @param {Number} targetSize 目标画布尺寸 (如 64)
 * @param {Number} maxColors 最多使用多少种色号（48/96/144/221），不传或 0 表示不限制
 * @returns {Promise<Array>} 返回二维数组 grid
 */
function convertImageToGrid(imagePath, targetSize, maxColors) {
  return new Promise((resolve, reject) => {
    const canvas = wx.createOffscreenCanvas({ type: '2d', width: targetSize, height: targetSize })
    const ctx = canvas.getContext('2d')
    const img = canvas.createImage()

    img.onload = () => {
      // 1. 降采样：直接绘制到目标尺寸
      ctx.drawImage(img, 0, 0, targetSize, targetSize)

      // 2. 取像素
      const imageData = ctx.getImageData(0, 0, targetSize, targetSize)
      const data = imageData.data

      const grid = []
      const usage = {}

      // 3. 第一遍：匹配色卡（带量化缓存），同时统计各色使用次数
      for (let y = 0; y < targetSize; y++) {
        const row = []
        for (let x = 0; x < targetSize; x++) {
          const index = (y * targetSize + x) * 4
          const a = data[index + 3]

          if (a < 128) { // 透明像素不填色
            row.push(null)
            continue
          }

          const hex = nearestHex(data[index], data[index + 1], data[index + 2])
          usage[hex] = (usage[hex] || 0) + 1
          row.push(hex)
        }
        grid.push(row)
      }

      // 4. 第二遍：色号数超上限时，保留使用最多的 N 种，其余就近合并
      const limit = maxColors > 0 ? maxColors : 0
      const usedHexes = Object.keys(usage)
      if (limit && usedHexes.length > limit) {
        const keptHexes = usedHexes
          .slice()
          .sort((a, b) => usage[b] - usage[a])
          .slice(0, limit)

        const keptRgb = keptHexes.map(hex => {
          const rgb = hexToRgb(hex)
          rgb.hex = hex
          return rgb
        })

        // 预先建立 原始色 → 保留色 的映射，避免逐像素重复计算
        const remap = {}
        usedHexes.forEach(hex => {
          if (keptHexes.indexOf(hex) >= 0) {
            remap[hex] = hex
            return
          }
          const src = hexToRgb(hex)
          remap[hex] = nearestIn(keptRgb, src.r, src.g, src.b).hex
        })

        for (let y = 0; y < grid.length; y++) {
          const row = grid[y]
          for (let x = 0; x < row.length; x++) {
            const hex = row[x]
            if (hex) row[x] = remap[hex]
          }
        }
      }

      resolve(grid)
    }

    img.onerror = (e) => {
      reject(e)
    }

    img.src = imagePath
  })
}

module.exports = {
  convertImageToGrid
}
