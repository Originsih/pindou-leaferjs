// utils/history.js
const KEY = 'browsing_history'
const MAX_COUNT = 50 // 最多存 50 条

function getHistory() {
  try {
    return wx.getStorageSync(KEY) || []
  } catch (e) {
    return []
  }
}

// 添加一条浏览记录
function addHistory(work) {
  if (!work || !work._id) return
  try {
    let list = getHistory()
    // 去重：如果已经存在，先删掉旧的，等一下加到最前面
    list = list.filter(item => item.id !== work._id)
    
    // 组装需要的字段
    list.unshift({
      id: work._id,
      title: work.title || '未命名作品',
      cover: work.cover || '',
      avatar: work.authorAvatar || '',
      userNick: work.authorNick || '拼豆爱好者',
      useCount: work.madeCount || 0,
      beanCount: work.totalBeans || 0,
      viewTime: Date.now()
    })
    
    // 截断超出的部分
    if (list.length > MAX_COUNT) {
      list = list.slice(0, MAX_COUNT)
    }
    
    wx.setStorageSync(KEY, list)
  } catch (e) {
    console.error('写入历史记录失败', e)
  }
}

// 清空历史记录
function clearHistory() {
  try {
    wx.removeStorageSync(KEY)
  } catch (e) {}
}

module.exports = {
  getHistory,
  addHistory,
  clearHistory
}