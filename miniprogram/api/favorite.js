// api/favorite.js
// 说明：favorites 集合对客户端「不可读写」，收藏与取消收藏都经由云函数 works，
// 计数增减在服务端用 inc 完成，避免客户端改别人作品文档被权限拒绝。

import { callFunction } from './cloud'

function call(action, payload) {
  return callFunction('works', action, payload)
}

export const favoriteApi = {
  // 切换收藏状态
  toggle(workId, isFav) {
    return call('toggleFav', { workId, isFav: isFav === true })
  },

  // 取消收藏
  removeFav(workId) {
    return call('toggleFav', { workId, isFav: false })
  },

  // 检查是否已收藏
  checkIsFav(workId) {
    return call('checkIsFav', { workId })
  },

  // 我的收藏列表（已按收藏时间倒序，并过滤失效作品）
  getMyFavorites() {
    return call('myFavorites', {})
  }
}
