import { workApi } from '../../../../api/work'

Page({
  data: {
    // 登录门
    unlocked: false,
    pinInput: '',
    pinError: '',
    logging: false,

    // 页签：review = 待审核作品，report = 举报处理，admin = 管理员名单
    tab: 'review',
    pendingWorks: [],
    reports: [],

    // 管理员名单
    admins: [],
    bootstrapAdmins: [],
    selfInfo: {},
    userKeyword: '',
    userResults: [],
    findingUser: false,

    // 发布开关
    cfg: { allowUserPublish: true, allowUserPublicPublish: true },
    cfgSaving: false,

    loading: false,
    error: ''
  },

  // 口令只放实例内存，不写 storage
  _pin: '',

  onShow() {
    if (this.data.unlocked) this.load()
  },

  /* ================= 登录 ================= */

  onPinInput(e) {
    this.setData({ pinInput: e.detail.value, pinError: '' })
  },

  async doLogin() {
    const pin = (this.data.pinInput || '').trim()
    if (!pin) {
      this.setData({ pinError: '请输入管理口令' })
      return
    }
    if (this.data.logging) return

    this.setData({ logging: true, pinError: '' })
    try {
      await workApi.adminLogin(pin)
      this._pin = pin
      this.setData({ unlocked: true, logging: false, pinInput: '' })
      this.load()
    } catch (e) {
      this.setData({
        logging: false,
        pinError: (e && e.message) || '口令错误'
      })
    }
  },

  doLogout() {
    this._pin = ''
    this.setData({
      unlocked: false,
      pendingWorks: [],
      reports: [],
      pinInput: '',
      pinError: ''
    })
  },

  /* ================= 页签 ================= */

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    this.setData({ tab }, () => this.load())
  },

  onPullDownRefresh() {
    if (!this.data.unlocked) {
      wx.stopPullDownRefresh()
      return
    }
    this.load()
      .then(() => wx.stopPullDownRefresh())
      .catch(() => wx.stopPullDownRefresh())
  },

  /* ================= 加载 ================= */

  async load() {
    if (!this._pin) return
    this.setData({ loading: true, error: '' })
    try {
      if (this.data.tab === 'review') {
        const list = await workApi.adminPendingWorks(this._pin)
        this.setData({
          pendingWorks: (list || []).map(w => Object.assign({}, w, {
            timeText: this.formatTime(w.updatedAt || w.createdAt)
          })),
          loading: false
        })
      } else if (this.data.tab === 'report') {
        const list = await workApi.adminReports(this._pin)
        this.setData({
          reports: (list || []).map(r => Object.assign({}, r, {
            timeText: this.formatTime(r.createdAt)
          })),
          loading: false
        })
      } else if (this.data.tab === 'admin') {
        await this.loadAdmins()
      } else {
        await this.loadConfig()
      }
    } catch (e) {
      const msg = (e && e.message) || '加载失败'
      if (/口令/.test(msg)) {
        this.doLogout()
        this.setData({ pinError: msg })
        return
      }
      this.setData({ loading: false, error: msg })
    }
  },

  /* ================= 发布开关 ================= */

  async loadConfig() {
    const cfg = await workApi.adminGetConfig(this._pin)
    this.setData({
      cfg: {
        allowUserPublish: cfg.allowUserPublish !== false,
        allowUserPublicPublish: cfg.allowUserPublicPublish !== false
      },
      loading: false
    })
  },

  async saveConfig(patch) {
    if (this.data.cfgSaving) return
    this.setData({ cfgSaving: true })
    try {
      const cfg = await workApi.adminSetConfig(this._pin, patch)
      this.setData({
        cfg: {
          allowUserPublish: cfg.allowUserPublish !== false,
          allowUserPublicPublish: cfg.allowUserPublicPublish !== false
        },
        cfgSaving: false
      })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      this.setData({ cfgSaving: false })
      this.handleError(e, '保存失败')
      this.loadConfig() // 失败时把开关状态刷新回真实值
    }
  },

  onSwitchUserPublish(e) {
    const val = e.detail.value
    // 关掉总开关时，把公开开关也一起关掉，避免状态矛盾
    this.saveConfig(
      val
        ? { allowUserPublish: true }
        : { allowUserPublish: false, allowUserPublicPublish: false }
    )
  },

  onSwitchUserPublicPublish(e) {
    this.saveConfig({ allowUserPublicPublish: e.detail.value })
  },

  /* ================= 管理员名单 ================= */

  async loadAdmins() {
    const res = await workApi.adminListAdmins(this._pin)
    this.setData({
      admins: (res && res.admins) || [],
      bootstrapAdmins: (res && res.bootstrap) || [],
      selfInfo: (res && res.self) || {},
      loading: false
    })
  },

  // 当前靠内置名单授权时，一键把自己登记进 admins 集合
  selfEnroll() {
    wx.showModal({
      title: '加入管理员名单',
      editable: true,
      placeholderText: '备注名（可选）',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '处理中...', mask: true })
        try {
          await workApi.adminSelfEnroll(this._pin, (r.content || '').trim())
          wx.hideLoading()
          wx.showToast({ title: '已加入', icon: 'success' })
          this.loadAdmins()
        } catch (err) {
          wx.hideLoading()
          this.handleError(err, '操作失败')
        }
      }
    })
  },

  onUserKeywordInput(e) {
    this.setData({ userKeyword: e.detail.value })
  },

  async doFindUser() {
    const keyword = (this.data.userKeyword || '').trim()
    if (!keyword) {
      wx.showToast({ title: '请输入昵称或账号ID', icon: 'none' })
      return
    }
    if (this.data.findingUser) return

    this.setData({ findingUser: true })
    try {
      const list = await workApi.adminFindUser(this._pin, keyword)
      this.setData({ userResults: list || [], findingUser: false })
    } catch (e) {
      this.setData({ findingUser: false })
      this.handleError(e, '查找失败')
    }
  },

  addAdmin(e) {
    const openid = e.currentTarget.dataset.openid
    const nickname = e.currentTarget.dataset.nickname || ''
    if (!openid) return

    wx.showModal({
      title: '添加管理员',
      editable: true,
      placeholderText: `备注名（默认：${nickname || '管理员'}）`,
      success: async (r) => {
        if (!r.confirm) return
        const name = (r.content || '').trim() || nickname

        wx.showLoading({ title: '添加中...', mask: true })
        try {
          await workApi.adminAddAdmin(this._pin, openid, name)
          wx.hideLoading()
          wx.showToast({ title: '已添加', icon: 'success' })
          this.setData({ userResults: [], userKeyword: '' })
          this.loadAdmins()
        } catch (err) {
          wx.hideLoading()
          this.handleError(err, '添加失败')
        }
      }
    })
  },

  removeAdmin(e) {
    const openid = e.currentTarget.dataset.openid
    const name = e.currentTarget.dataset.name || '该管理员'
    if (!openid) return

    wx.showModal({
      title: '移除管理员',
      content: `确定移除「${name}」的管理权限吗？`,
      confirmColor: '#e64340',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '处理中...', mask: true })
        try {
          await workApi.adminRemoveAdmin(this._pin, openid)
          wx.hideLoading()
          wx.showToast({ title: '已移除', icon: 'success' })
          this.loadAdmins()
        } catch (err) {
          wx.hideLoading()
          this.handleError(err, '移除失败')
        }
      }
    })
  },

  formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ''
    const pad = n => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  openWork(e) {
    const id = e.currentTarget.dataset.workid
    if (!id) return
    wx.navigateTo({
      url: `/subpackages/design-drawing/pages/WorkDetail/index?id=${id}`
    })
  },

  /* ================= 通用错误处理 ================= */

  handleError(err, fallback) {
    const msg = (err && err.message) || fallback
    if (/口令/.test(msg)) {
      this.doLogout()
      this.setData({ pinError: msg })
      return
    }
    if (msg.length > 7) {
      wx.showModal({ title: '操作失败', content: msg, showCancel: false })
    } else {
      wx.showToast({ title: msg, icon: 'none' })
    }
  },

  /* ================= 作品审核 ================= */

  approveWork(e) {
    const workId = e.currentTarget.dataset.workid
    if (!workId) return

    wx.showModal({
      title: '审核通过',
      content: '通过后该作品会出现在广场。确定吗？',
      confirmColor: '#07c160',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '处理中...', mask: true })
        try {
          await workApi.adminApproveWork(workId, this._pin)
          wx.hideLoading()
          wx.showToast({ title: '已通过', icon: 'success' })
          this.load()
        } catch (err) {
          wx.hideLoading()
          this.handleError(err, '审核失败')
        }
      }
    })
  },

  rejectWork(e) {
    const workId = e.currentTarget.dataset.workid
    if (!workId) return

    wx.showModal({
      title: '审核不通过',
      editable: true,
      placeholderText: '填写不通过原因（作者可见）',
      confirmColor: '#e64340',
      success: async (r) => {
        if (!r.confirm) return
        const reason = (r.content || '').trim()

        wx.showLoading({ title: '处理中...', mask: true })
        try {
          await workApi.adminRejectWork(workId, this._pin, reason)
          wx.hideLoading()
          wx.showToast({ title: '已驳回', icon: 'success' })
          this.load()
        } catch (err) {
          wx.hideLoading()
          this.handleError(err, '操作失败')
        }
      }
    })
  },

  /* ================= 数据维护 ================= */

  migrateDrafts() {
    wx.showModal({
      title: '迁移历史草稿',
      content: '把旧版本混在 works 集合里的草稿搬到 drafts 集合。每批最多 100 条，数据多可重复执行。',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '迁移中...', mask: true })
        try {
          const res = await workApi.migrateDrafts(this._pin)
          wx.hideLoading()
          wx.showModal({
            title: '迁移完成',
            content: `扫描 ${res.scanned} 条，成功迁移 ${res.moved} 条`,
            showCancel: false
          })
          this.load()
        } catch (err) {
          wx.hideLoading()
          this.handleError(err, '迁移失败')
        }
      }
    })
  },

  /* ================= 举报处理 ================= */

  handleReport(e) {
    const { workid, action } = e.currentTarget.dataset
    if (!workid) {
      wx.showToast({ title: '作品已不存在', icon: 'none' })
      return
    }

    const texts = {
      hide: '下架该作品（广场和详情将不可见）',
      restore: '恢复上架该作品',
      delete: '彻底删除该作品，不可恢复'
    }

    wx.showModal({
      title: '确认操作',
      content: `确定要${texts[action] || '处理'}吗？`,
      confirmColor: action === 'restore' ? '#07c160' : '#e64340',
      success: async (r) => {
        if (!r.confirm) return

        wx.showLoading({ title: '处理中...', mask: true })
        try {
          if (action === 'hide') await workApi.adminHide(workid, this._pin)
          else if (action === 'restore') await workApi.adminRestore(workid, this._pin)
          else if (action === 'delete') await workApi.adminDeleteWork(workid, this._pin)

          wx.hideLoading()
          wx.showToast({ title: '已处理', icon: 'success' })
          this.load()
        } catch (err) {
          wx.hideLoading()
          this.handleError(err, '操作失败')
        }
      }
    })
  }
})
