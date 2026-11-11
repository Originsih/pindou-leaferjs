// utils/image-cutout.js

/**
 * 智能抠图：基于四角背景色去背
 * @param {String} imageUrl 原始图片临时路径
 * @param {Number} tolerance 容差范围，默认 40
 * @returns {Promise<String>} 抠图后的图片临时路径
 */
function cutoutBackground(imageUrl, tolerance = 40) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: imageUrl,
      success: (imgInfo) => {
        // 限制最大尺寸，防止内存溢出
        const MAX_SIZE = 500
        let width = imgInfo.width
        let height = imgInfo.height

        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.floor(height * (MAX_SIZE / width))
            width = MAX_SIZE
          } else {
            width = Math.floor(width * (MAX_SIZE / height))
            height = MAX_SIZE
          }
        }

        const canvas = wx.createOffscreenCanvas({ type: '2d', width, height })
        const ctx = canvas.getContext('2d')
        const img = canvas.createImage()

        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height)
          const imageData = ctx.getImageData(0, 0, width, height)
          const data = imageData.data

          // 取四个角的颜色作为背景参考色（取平均值）
          const corners = [
            { r: data[0], g: data[1], b: data[2] },
            { r: data[(width - 1) * 4], g: data[(width - 1) * 4 + 1], b: data[(width - 1) * 4 + 2] },
            { r: data[(height - 1) * width * 4], g: data[(height - 1) * width * 4 + 1], b: data[(height - 1) * width * 4 + 2] },
            { r: data[((height - 1) * width + width - 1) * 4], g: data[((height - 1) * width + width - 1) * 4 + 1], b: data[((height - 1) * width + width - 1) * 4 + 2] }
          ]

          const bgR = (corners[0].r + corners[1].r + corners[2].r + corners[3].r) / 4
          const bgG = (corners[0].g + corners[1].g + corners[2].g + corners[3].g) / 4
          const bgB = (corners[0].b + corners[1].b + corners[2].b + corners[3].b) / 4

          // 遍历像素，将接近背景色的设为透明
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2]
            const dist = Math.sqrt(Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2))
            if (dist < tolerance) {
              data[i + 3] = 0 // Alpha 设为 0
            }
          }

          ctx.putImageData(imageData, 0, 0)

          // 导出临时文件
          wx.canvasToTempFilePath({
            canvas: canvas,
            success: (res) => resolve(res.tempFilePath),
            fail: (err) => reject(new Error('导出抠图失败'))
          })
        }

        img.onerror = () => reject(new Error('图片加载失败'))
        img.src = imageUrl
      },
      fail: () => reject(new Error('获取图片信息失败'))
    })
  })
}

module.exports = {
  cutoutBackground
}