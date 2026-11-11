// utils/nearest-color.js
// 最近色匹配：5bit 通道量化 + 结果缓存
//
// 旧实现是逐像素遍历整张色卡（291 色），128x128 要算 477 万次带 Math.pow 的距离。
// 现在把 RGB 各量化到 5bit 做桶，同桶颜色直接复用上次结果；
// 实际参与匹配的次数 ≈ 不同颜色种类数，而不是像素数。

const BEAD_COLORS = require('./bead-colors')

let palette = null

function getPalette() {
  if (palette) return palette
  palette = []
  Object.keys(BEAD_COLORS).forEach(group => {
    const list = BEAD_COLORS[group]
    if (!Array.isArray(list)) return
    list.forEach(item => {
      const hex = item.color
      palette.push({
        hex,
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
      })
    })
  })
  return palette
}

const SHIFT = 3 // 5bit/通道
const cache = {}

/**
 * 找出与给定 RGB 最接近的色卡颜色
 * @returns {String} hex
 */
function nearestHex(r, g, b) {
  const p = getPalette()
  const kr = r >> SHIFT
  const kg = g >> SHIFT
  const kb = b >> SHIFT
  const key = (kr << 10) | (kg << 5) | kb

  const cached = cache[key]
  if (cached !== undefined) return cached

  // 用桶中心色匹配，比用桶左上角更贴近真实颜色
  const cr = (kr << SHIFT) + 4
  const cg = (kg << SHIFT) + 4
  const cb = (kb << SHIFT) + 4

  let best = p[0].hex
  let bestD = Infinity
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    const dr = cr - c.r
    const dg = cg - c.g
    const db = cb - c.b
    const d = dr * dr + dg * dg + db * db // 用乘法代替 Math.pow
    if (d < bestD) {
      bestD = d
      best = c.hex
    }
  }

  cache[key] = best
  return best
}

/** 在给定的少量候选色中找最接近的（限色数时使用） */
function nearestIn(candidates, r, g, b) {
  let best = candidates[0]
  let bestD = Infinity
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const dr = r - c.r
    const dg = g - c.g
    const db = b - c.b
    const d = dr * dr + dg * dg + db * db
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  }
}

module.exports = { nearestHex, nearestIn, hexToRgb, getPalette }
