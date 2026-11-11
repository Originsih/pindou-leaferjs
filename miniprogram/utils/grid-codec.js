const BEAD_COLORS = require('./bead-colors')

let COLOR_TO_INDEX = null
let INDEX_TO_COLOR = null
let HEX_TO_CODE = null

function buildColorMap() {
  if (COLOR_TO_INDEX) return
  COLOR_TO_INDEX = {}
  INDEX_TO_COLOR = [null]
  HEX_TO_CODE = {}
  let idx = 1
  Object.keys(BEAD_COLORS).forEach(group => {
    const list = BEAD_COLORS[group]
    if (!Array.isArray(list)) return
    list.forEach(item => {
      if (!item || !item.color) return
      const hex = String(item.color).toUpperCase()
      if (!COLOR_TO_INDEX[hex]) {
        COLOR_TO_INDEX[hex] = idx
        INDEX_TO_COLOR[idx] = hex
        HEX_TO_CODE[hex] = item.code
        idx++
      }
    })
  })
}

function encodeGrid(grid) {
  buildColorMap()
  if (!Array.isArray(grid)) return []
  return grid.map(row =>
    Array.isArray(row)
      ? row.map(color => (color ? COLOR_TO_INDEX[String(color).toUpperCase()] || 0 : 0))
      : []
  )
}

function decodeGrid(coded) {
  buildColorMap()
  if (!Array.isArray(coded)) return []
  return coded.map(row =>
    Array.isArray(row)
      ? row.map(idx => (idx === 0 ? null : INDEX_TO_COLOR[idx] || null))
      : []
  )
}

function packToString(coded) {
  if (!Array.isArray(coded)) return ''
  return coded.map(row => row.join(',')).join('|')
}

function unpackFromString(str) {
  if (!str || typeof str !== 'string') return []
  return str.split('|').map(row =>
    row.split(',').map(n => parseInt(n, 10) || 0)
  )
}

function getColorCode(hex) {
  buildColorMap()
  if (!hex) return ''
  return HEX_TO_CODE[String(hex).toUpperCase()] || ''
}

// 统计色号、总颗数、预估工时
function calcGridStats(grid) {
  const map = {}
  let total = 0
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]
    if (!Array.isArray(row)) continue
    for (let x = 0; x < row.length; x++) {
      const c = row[x]
      if (c) { map[c] = (map[c] || 0) + 1; total++ }
    }
  }
  const colorList = Object.keys(map)
    .map(hex => ({
      name: getColorCode(hex) || hex,
      color: hex,
      count: map[hex]
    }))
    .sort((a, b) => b.count - a.count)

  return {
    colorList,
    totalBeans: total,
    colorCount: colorList.length,
    estimateHours: +(total / 600).toFixed(1)
  }
}

module.exports = {
  encodeGrid,
  decodeGrid,
  packToString,
  unpackFromString,
  getColorCode,
  calcGridStats
}