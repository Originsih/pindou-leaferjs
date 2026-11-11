// api/work.js
// 说明：works 集合对客户端「不可读写」，所有访问都经由云函数 works。
// 本文件只做薄封装，对外方法名 / 参数 / 返回结构与旧版完全一致，
// 归属校验、字段清洗、计数增减全部在服务端完成。

import { callFunction, uploadFile } from './cloud'

function call(action, payload) {
  return callFunction('works', action, payload)
}

export const workApi = {
  // 广场瀑布流
  getSquareList(skip, limit) {
    return call('listSquare', { skip, limit })
  },

  // 当前用户的发布权限（前端据此显示/隐藏发布入口）
  getPublishConfig() {
    return call('getPublishConfig', {})
  },

  // 搜索图纸（标题 / 作者昵称）
  searchWorks(keyword, skip, limit) {
    return call('searchWorks', { keyword, skip, limit })
  },

  // 我的公开 / 私有作品
  getMyWorks(isPublic, skip, limit) {
    return call('listMy', { isPublic: isPublic === true, skip, limit })
  },

  // 我的云端草稿
  getMyDrafts() {
    return call('listMyDrafts', {})
  },

  // 作品 / 草稿详情（返回值含 _isOwner）
  getWorkDetail(id) {
    return call('getDetail', { id })
  },

  // 公开 / 私有切换
  updateWorkState(workId, isPublic) {
    return call('updateState', { workId, isPublic })
  },

  // 使用次数 +1
  incrementMadeCount(workId) {
    return call('incMadeCount', { workId })
  },

  // 重命名草稿
  updateDraftTitle(draftId, title) {
    return call('updateDraftTitle', { draftId, title })
  },

  // 删除作品 / 草稿
  deleteWork(workId) {
    return call('removeWork', { workId })
  },

  // 静默刷新广场已有项
  getLatestWorksByIds(ids) {
    return call('latestByIds', { ids })
  },

  // 上传封面图（云存储，不走数据库）
  uploadCover(filePath, cloudPath) {
    return uploadFile(filePath, cloudPath)
  },

  // 保存草稿（drafts 集合）
  saveDraft(workData, draftId) {
    return call('saveDraft', { workData, draftId })
  },

  // 发布 / 更新作品
  publish(data, editId = null, draftId = null) {
    return call('publish', { data, editId, draftId })
  },

  // 删除草稿
  deleteDraft(draftId) {
    return call('removeDraft', { draftId })
  },

  // 举报作品（任何登录用户）
  report(workId, reason, detail) {
    return call('report', { workId, reason, detail })
  },

  /* ============ 审核相关（仅管理员可用，服务端校验身份 + 口令） ============ */

  // 当前用户是否管理员（只决定入口是否显示，不需要口令）
  checkAdmin() {
    return call('checkAdmin', {})
  },

  // 管理员登录：校验管理口令
  adminLogin(pin) {
    return call('adminLogin', { pin })
  },

  /* ---- 全局发布开关（管理员） ---- */

  adminGetConfig(pin) {
    return call('adminGetConfig', { pin })
  },

  adminSetConfig(pin, patch) {
    return call('adminSetConfig', Object.assign({ pin }, patch || {}))
  },

  /* ---- 管理员名单 ---- */

  adminListAdmins(pin) {
    return call('adminListAdmins', { pin })
  },

  // 把自己登记进管理员名单
  adminSelfEnroll(pin, name) {
    return call('adminSelfEnroll', { pin, name })
  },

  // 按昵称 / 账号ID / openid 找人
  adminFindUser(pin, keyword) {
    return call('adminFindUser', { pin, keyword })
  },

  adminAddAdmin(pin, openid, name) {
    return call('adminAddAdmin', { pin, openid, name })
  },

  adminRemoveAdmin(pin, openid) {
    return call('adminRemoveAdmin', { pin, openid })
  },

  // 待处理举报列表
  adminReports(pin) {
    return call('adminReports', { pin })
  },

  // 待审核作品列表
  adminPendingWorks(pin) {
    return call('adminPendingWorks', { pin })
  },

  // 审核通过
  adminApproveWork(workId, pin) {
    return call('adminApproveWork', { workId, pin })
  },

  // 审核不通过
  adminRejectWork(workId, pin, reason) {
    return call('adminRejectWork', { workId, pin, reason })
  },

  // 下架作品
  adminHide(workId, pin) {
    return call('adminHide', { workId, pin })
  },

  // 恢复上架
  adminRestore(workId, pin) {
    return call('adminRestore', { workId, pin })
  },

  // 彻底删除违规作品
  adminDeleteWork(workId, pin) {
    return call('adminDeleteWork', { workId, pin })
  },

  // 一次性迁移：把 works 里的历史草稿搬到 drafts 集合
  migrateDrafts(pin) {
    return call('adminMigrateDrafts', { pin })
  }
}
