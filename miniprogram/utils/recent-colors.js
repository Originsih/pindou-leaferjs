const BASE_KEY = 'baseColors'
const MAX = 12

const DEFAULT_12 = [
  { code: 'H07', color: '#000000' },
  { code: 'H01', color: '#FDFBFF' },
  { code: 'F02', color: '#FC3D46' },
  { code: 'A04', color: '#FBED56' },
  { code: 'B02', color: '#63F347' },
  { code: 'C06', color: '#50AAF0' },
  { code: 'D06', color: '#AC7BDE' },
  { code: 'E05', color: '#F551A2' },
  { code: 'G06', color: '#E99C17' },
  { code: 'H04', color: '#89858C' },
  { code: 'G20', color: '#A94023' },
  { code: 'H06', color: '#2F2B2F' }
]

function getBaseColors() {
  try {
    const list = wx.getStorageSync(BASE_KEY)
    if (Array.isArray(list) && list.length) return list
    return DEFAULT_12.slice()
  } catch (e) {
    return DEFAULT_12.slice()
  }
}

function addBaseColor({ code, color }) {
  let list = getBaseColors()
  list = list.filter(i => i.code !== code)
  list.unshift({ code, color })
  if (list.length > MAX) list = list.slice(0, MAX)
  try { wx.setStorageSync(BASE_KEY, list) } catch (e) {}
  return list
}

module.exports = { getBaseColors, addBaseColor }
