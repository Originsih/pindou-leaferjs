// components/avatar/index.js
// 统一的头像展示：有图就用图，没图用「昵称首字 + 稳定配色」的文字头像。
// 新用户没设头像时，广场列表原来会渲染成空白图，这里统一兜住。

// 一组饱和度接近、白字可读的颜色
const COLORS = [
  '#ff9f43', '#ee5253', '#5f27cd', '#0abde3',
  '#10ac84', '#f368e0', '#54a0ff', '#feca57',
  '#48dbfb', '#ff6b6b'
]

function pickColor(seed) {
  const s = String(seed || '')
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) % 100000
  }
  return COLORS[h % COLORS.length]
}

function pickInitial(name) {
  const s = String(name || '').trim()
  if (!s) return '豆'
  // Array.from 能正确处理常见 emoji / 代理对
  const chars = Array.from(s)
  return chars[0] || '豆'
}

Component({
  properties: {
    src: { type: String, value: '' },
    name: { type: String, value: '' },
    // 直径，单位 rpx
    size: { type: Number, value: 44 }
  },

  data: {
    initial: '豆',
    bg: COLORS[0],
    fontSize: 20
  },

  observers: {
    'src, name, size': function (src, name, size) {
      this.refresh(src, name, size)
    }
  },

  lifetimes: {
    attached() {
      const p = this.properties
      this.refresh(p.src, p.name, p.size)
    }
  },

  methods: {
    refresh(src, name, size) {
      const s = Number(size) || 44
      // 有头像就不用算首字
      if (src) {
        this.setData({ fontSize: Math.round(s * 0.42) })
        return
      }
      this.setData({
        initial: pickInitial(name),
        bg: pickColor(name),
        fontSize: Math.round(s * 0.42)
      })
    }
  }
})
