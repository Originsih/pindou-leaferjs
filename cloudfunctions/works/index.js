const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const WORKS = 'works'
const DRAFTS = 'drafts'   // 草稿独立集合，works 只放正式作品
const FAVS = 'favorites'
const REPORTS = 'reports'
const USERS = 'users'
const CONFIG = 'config'   // 全局配置（发布开关等）
const CONFIG_ID = 'global'
const MAX_LIMIT = 100 // 云函数侧单次查询上限
const MAX_DRAFTS_PER_USER = 10 // 每个用户最多保留多少个草稿

/* ============================================================
 * 先审后发
 * 发布的作品进入 reviewStatus = 'pending'，管理员通过后才出现在广场。
 * 老数据没有 reviewStatus 字段 —— 一律视为 approved，
 * 否则改造上线瞬间所有已有作品会从广场消失。
 * ============================================================ */
const REVIEW_PENDING = 'pending'
const REVIEW_APPROVED = 'approved'
const REVIEW_REJECTED = 'rejected'

// 广场可见的审核状态：把 pending / rejected 排除掉（$nin 会匹配「字段不存在」）
const REVIEW_VISIBLE = _.nin([REVIEW_PENDING, REVIEW_REJECTED])

function reviewStatusOf(doc) {
  return (doc && doc.reviewStatus) || REVIEW_APPROVED
}

// 搜索关键词里的正则特殊字符要转义，避免用户输入 "(" 之类直接报错
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ============================================================
 * 全局发布开关
 *
 * config 集合里 _id = 'global' 的单条记录：
 *   allowUserPublish        普通用户是否可发布作品（关掉后只有管理员能发）
 *   allowUserPublicPublish  普通用户是否可发布为「公开」
 *
 * 集合/文档不存在时按「允许发布」处理，避免刚上线时全站发不了。
 * 在控制台手动建记录时容易把字段存成字符串 "false"，
 * 那样 `!== false` 会误判成允许，所以这里统一做类型归一化。
 * ============================================================ */

function toBool(v, defaultValue) {
  if (v === undefined || v === null) return defaultValue
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'false' || s === '0' || s === 'no' || s === '') return false
    if (s === 'true' || s === '1' || s === 'yes') return true
    return defaultValue
  }
  if (typeof v === 'number') return v !== 0
  return defaultValue
}

async function getPublishConfig() {
  try {
    const res = await db.collection(CONFIG).doc(CONFIG_ID).get()
    const d = res.data || {}
    return {
      allowUserPublish: toBool(d.allowUserPublish, true),
      allowUserPublicPublish: toBool(d.allowUserPublicPublish, true)
    }
  } catch (e) {
    // 集合或文档不存在 —— 用默认值
    return { allowUserPublish: true, allowUserPublicPublish: true }
  }
}

/* ============================================================
 * 管理权限
 *
 * 小程序没有独立的「登录」—— openid 就是身份（微信已完成鉴权）。
 * 管理权限 = ① openid 在管理员名单里 + ② 正确的管理口令。
 * 两道都在服务端校验，前端只负责显示入口，绕过不了。
 * ============================================================ */

const ADMINS = 'admins'

// ============================================================
// 管理权限配置
//
// 凭证读取优先级（高 → 低）：
//   1. 云函数环境变量
//        云开发控制台 → 云函数 → works → 配置 → 环境变量
//        ADMIN_PIN      管理口令
//        ADMIN_OPENIDS  内置超级管理员 openid，多个用英文逗号分隔
//   2. 同目录下的 config.local.js（已被 .gitignore 忽略，不会进仓库）
//        首次使用：复制 config.local.example.js 为 config.local.js 再填值
//   3. 空 —— 审核功能停用（fail-closed，不会变成人人可管）
//
// 这样源码里不含任何凭证，仓库可以公开；
// 但本地部署时仍有兜底值，不会因为漏配环境变量把自己锁在审核功能外面。
// ============================================================

let localConfig = {}
try {
  // 文件不存在时会抛 MODULE_NOT_FOUND，交给 catch 忽略
  localConfig = require('./config.local') || {}
} catch (e) {
  localConfig = {}
}

const FALLBACK_ADMIN_PIN = String(localConfig.adminPin || '')
const FALLBACK_ADMIN_OPENIDS = Array.isArray(localConfig.adminOpenids)
  ? localConfig.adminOpenids
  : []

const ADMIN_PIN = process.env.ADMIN_PIN || FALLBACK_ADMIN_PIN

const BOOTSTRAP_ADMIN_OPENIDS = (
  process.env.ADMIN_OPENIDS
    ? String(process.env.ADMIN_OPENIDS).split(',')
    : FALLBACK_ADMIN_OPENIDS
).map(s => s.trim()).filter(Boolean)

if (!process.env.ADMIN_PIN && !FALLBACK_ADMIN_PIN) {
  console.warn(
    '[works] 未配置管理口令 —— 审核功能已停用。' +
    '请配置环境变量 ADMIN_PIN，或创建 config.local.js（参考 config.local.example.js）'
  )
}
if (!BOOTSTRAP_ADMIN_OPENIDS.length) {
  console.info('[works] 未配置超级管理员 —— 管理员只认 admins 集合里的成员')
}

// 是否具备管理员身份（不含口令校验，只用于决定是否显示入口）
//
// 两条来源取「或」：
//   1. 内置超级管理员（BOOTSTRAP_ADMIN_OPENIDS）—— 永远有效，不可撤销，
//      保证任何情况下都不会把自己锁在审核功能外面；
//   2. admins 集合里的成员 —— 可通过后台添加/移除。
// 只认集合、不认内置名单的写法会导致「集合里加了别人、自己不在里面」时被锁死，
// 这里明确不做那种事。
async function isAdminUser(openid) {
  if (BOOTSTRAP_ADMIN_OPENIDS.indexOf(openid) >= 0) return true

  try {
    const mine = await db.collection(ADMINS)
      .where({ _openid: openid, enabled: _.neq(false) })
      .count()
    return mine.total > 0
  } catch (e) {
    // admins 集合尚未创建时不算错，直接当作不在名单里
    console.warn('[works] admins 集合不可用:', e && (e.errMsg || e.message))
    return false
  }
}

// 管理操作前的完整校验：身份 + 口令
async function requireAdmin(openid, pin) {
  if (!ADMIN_PIN) throw new Error('审核功能未配置管理口令，已停用')
  if (String(pin || '') !== ADMIN_PIN) throw new Error('管理口令错误')
  const ok = await isAdminUser(openid)
  if (!ok) throw new Error('无权访问审核功能')
}

/* ============================================================
 * 说明
 * works / favorites 集合对客户端「不可读写」，所有访问都经过本云函数。
 * 因此这里必须自己负责三件事：
 *   1. 身份：一律用 cloud.getWXContext().OPENID，绝不信客户端传的 openid
 *   2. 归属：写操作前校验 doc._openid === OPENID
 *   3. 字段：写入前剥掉 _id / _openid，防止客户端伪造归属
 * ============================================================ */

// 客户端允许写入的业务字段白名单（其余一律丢弃）
// type / isDraft / favCount / madeCount / _openid 都由服务端决定
const EDITABLE_FIELDS = [
  'title', 'grid', 'gridSize', 'cover',
  'colorList', 'totalBeans', 'colorCount', 'estimateHours',
  'isPublic', 'tags', 'useWatermark', 'watermark', 'allowDerivative',
  'authorNick', 'authorAvatar'
]

function pickEditable(obj) {
  const src = obj || {}
  const out = {}
  EDITABLE_FIELDS.forEach(k => {
    if (src[k] !== undefined) out[k] = src[k]
  })
  return out
}

// 返回给前端时抹掉 _openid
function publicView(doc) {
  if (!doc) return doc
  const out = {}
  Object.keys(doc).forEach(k => {
    if (k === '_openid') return
    out[k] = doc[k]
  })
  return out
}

/* ============================================================
 * 内容安全（UGC 合规）
 * 广场存在用户自由填写的内容，必须做敏感信息检测，否则审核会被驳回。
 * 策略：检测到违规 → 拒绝；检测接口本身不可用 → 放行并打日志
 *      （避免一次接口波动导致所有用户都无法发布）。
 * ============================================================ */

const TEXT_MAX = 200      // msgSecCheck 单次内容上限
const IMG_MAX_BYTES = 1024 * 1024 // imgSecCheck 限制 1MB
const ERR_RISKY = 87014   // 内容含敏感信息

async function checkText(content, openid) {
  const text = String(content || '').trim()
  if (!text) return { ok: true }

  let res
  try {
    res = await cloud.openapi.security.msgSecCheck({
      openid,
      scene: 1,               // 1 = 资料类文本（标题/昵称）
      version: 2,
      content: text.slice(0, TEXT_MAX)
    })
  } catch (e) {
    console.warn('[works] msgSecCheck 不可用，跳过文本检测:', e && (e.errMsg || e.message))
    return { ok: true }
  }

  const suggest = res && res.result && res.result.suggest
  if (!suggest || suggest === 'pass') return { ok: true }

  // 打日志便于在云函数日志里定位到底是哪句话被判违规
  console.warn('[works] 文本被内容安全拦截:', JSON.stringify({
    suggest,
    label: res && res.result && res.result.label,
    content: text.slice(0, 60)
  }))

  return {
    ok: false,
    reason: suggest === 'review'
      ? '内容需要人工复核，请调整措辞后重试'
      : '内容含敏感信息，请修改后重试'
  }
}

async function checkCoverImage(fileID) {
  if (!fileID || String(fileID).indexOf('cloud://') !== 0) return { ok: true }

  let fileContent
  try {
    const dl = await cloud.downloadFile({ fileID })
    fileContent = dl.fileContent
  } catch (e) {
    console.warn('[works] 封面下载失败，跳过图片检测:', e && (e.errMsg || e.message))
    return { ok: true }
  }

  if (!fileContent || fileContent.length > IMG_MAX_BYTES) {
    console.warn('[works] 封面超过 1MB，跳过图片检测')
    return { ok: true }
  }

  try {
    await cloud.openapi.security.imgSecCheck({
      media: { contentType: 'image/png', value: fileContent }
    })
    return { ok: true }
  } catch (e) {
    const code = (e && e.errCode) || (e && e.result && e.result.errcode)
    if (code === ERR_RISKY) {
      return { ok: false, reason: '封面图含敏感内容，请更换后重试' }
    }
    console.warn('[works] imgSecCheck 不可用，跳过图片检测:', e && (e.errMsg || e.message))
    return { ok: true }
  }
}

async function assertContentSafe({ title, cover, isPublic }, openid) {
  const textCheck = await checkText(title, openid)
  if (!textCheck.ok) throw new Error(textCheck.reason)

  // 只有要公开的才查封面（草稿私密，且能省一次下载+检测）
  if (isPublic !== false) {
    const imgCheck = await checkCoverImage(cover)
    if (!imgCheck.ok) throw new Error(imgCheck.reason)
  }
}

async function getWorkById(id) {
  if (!id) throw new Error('缺少作品 id')
  try {
    const res = await db.collection(WORKS).doc(id).get()
    return res.data || null
  } catch (e) {
    return null // doc 不存在时 SDK 会抛错，这里统一当作 null
  }
}

async function requireOwnedWork(id, openid) {
  const doc = await getWorkById(id)
  if (!doc) throw new Error('记录不存在或已删除')
  if (doc._openid !== openid) throw new Error('无权操作该记录')
  return doc
}

async function getDraftById(id) {
  if (!id) throw new Error('缺少草稿 id')
  try {
    const res = await db.collection(DRAFTS).doc(id).get()
    return res.data || null
  } catch (e) {
    return null
  }
}

async function requireOwnedDraft(id, openid) {
  const doc = await getDraftById(id)
  if (!doc) throw new Error('草稿不存在或已删除')
  if (doc._openid !== openid) throw new Error('无权操作该草稿')
  return doc
}

// 公开作品：任何人可看；否则只有本人可看（草稿同理）
function assertReadable(doc, openid) {
  const isOwner = doc._openid === openid
  const isPublicWork = doc.isPublic === true && doc.isDraft === false
  if (!isOwner && !isPublicWork) throw new Error('无权查看该作品')
}

const handlers = {
  /* ---------------- 读 ---------------- */

  // 广场瀑布流（排除下架、排除未过审）
  async listSquare({ skip = 0, limit = 10 } = {}) {
    const size = Math.min(Number(limit) || 10, MAX_LIMIT)
    const res = await db.collection(WORKS)
      .where({
        type: 'work',
        isPublic: true,
        isDraft: false,
        isHidden: _.neq(true),
        reviewStatus: REVIEW_VISIBLE
      })
      .orderBy('createdAt', 'desc')
      .skip(Math.max(Number(skip) || 0, 0))
      .limit(size)
      .get()
    return res.data.map(publicView)
  },

  // 搜索图纸：按标题或作者昵称模糊匹配（只搜公开且已过审的作品）
  async searchWorks({ keyword, skip = 0, limit = 10 } = {}) {
    const kw = String(keyword || '').trim().slice(0, 30)
    if (!kw) return []

    const size = Math.min(Number(limit) || 10, MAX_LIMIT)
    const reg = db.RegExp({
      regexp: escapeRegExp(kw),
      options: 'i'
    })

    const res = await db.collection(WORKS)
      .where(_.and([
        {
          type: 'work',
          isPublic: true,
          isDraft: false,
          isHidden: _.neq(true),
          reviewStatus: REVIEW_VISIBLE
        },
        _.or([
          { title: reg },
          { authorNick: reg }
        ])
      ]))
      .orderBy('createdAt', 'desc')
      .skip(Math.max(Number(skip) || 0, 0))
      .limit(size)
      .get()

    return res.data.map(publicView)
  },

  // 我的公开 / 私有作品
  async listMy({ isPublic, skip = 0, limit = 10 } = {}, openid) {
    const size = Math.min(Number(limit) || 10, MAX_LIMIT)
    const res = await db.collection(WORKS)
      .where({
        _openid: openid,
        type: 'work',
        isPublic: isPublic === true,
        isDraft: false
      })
      .orderBy('createdAt', 'desc')
      .skip(Math.max(Number(skip) || 0, 0))
      .limit(size)
      .get()
    return res.data.map(publicView)
  },

  // 我的云端草稿（独立集合）
  async listMyDrafts(payload, openid) {
    const res = await db.collection(DRAFTS)
      .where({ _openid: openid })
      .orderBy('updatedAt', 'desc')
      .limit(MAX_LIMIT)
      .get()
    return res.data.map(publicView)
  },

  // 作品详情（带 isOwner 标记，前端不需要自己比对 openid）
  async getDetail({ id } = {}, openid) {
    const doc = await getWorkById(id)
    if (!doc) throw new Error('作品不存在或已删除')
    const isOwner = doc._openid === openid
    const admin = await isAdminUser(openid)

    // 已下架：作者本人和管理员仍可查看，其他人看不到
    if (doc.isHidden === true && !isOwner && !admin) {
      throw new Error('该作品已被下架')
    }

    // 审核状态：未过审的作品只有作者本人和管理员能看
    const review = reviewStatusOf(doc)
    if (review !== REVIEW_APPROVED && !isOwner && !admin) {
      throw new Error(
        review === REVIEW_PENDING ? '该作品正在审核中，请稍后再看' : '该作品未通过审核'
      )
    }

    assertReadable(doc, openid)
    return Object.assign({}, publicView(doc), {
      _isOwner: isOwner,
      reviewStatus: review
    })
  },

  // 静默刷新广场列表里已有项（排除下架、排除未过审）
  async latestByIds({ ids } = {}) {
    const list = (ids || []).filter(Boolean).slice(0, MAX_LIMIT)
    if (!list.length) return []
    const res = await db.collection(WORKS)
      .where({
        _id: _.in(list),
        isPublic: true,
        isDraft: false,
        isHidden: _.neq(true),
        reviewStatus: REVIEW_VISIBLE
      })
      .limit(MAX_LIMIT)
      .get()
    return res.data.map(publicView)
  },

  /* ---------------- 写：草稿 / 作品 ---------------- */

  // 保存草稿（写入独立的 drafts 集合）
  async saveDraft({ workData, draftId } = {}, openid) {
    const now = db.serverDate()
    const data = pickEditable(workData)

    // 草稿是私密的，只做文本检测（封面等发布时再查）
    await assertContentSafe({ title: data.title, isPublic: false }, openid)

    if (draftId) {
      await requireOwnedDraft(draftId, openid)
      await db.collection(DRAFTS).doc(draftId).update({
        data: Object.assign({}, data, { updatedAt: now })
      })
      return draftId
    }

    // 配额检查：每人最多 10 个草稿（更新已有草稿不受限制）
    const cnt = await db.collection(DRAFTS).where({ _openid: openid }).count()
    if (cnt.total >= MAX_DRAFTS_PER_USER) {
      throw new Error(`草稿最多 ${MAX_DRAFTS_PER_USER} 个，请先删除不用的草稿`)
    }

    const res = await db.collection(DRAFTS).add({
      data: Object.assign({}, data, {
        _openid: openid,
        createdAt: now,
        updatedAt: now
      })
    })
    return res._id
  },

  // 发布 / 更新作品
  async publish({ data, editId, draftId } = {}, openid) {
    const now = db.serverDate()
    const payload = pickEditable(data)

    // 公开内容必须过内容安全检测（标题 + 封面图）
    await assertContentSafe(
      { title: payload.title, cover: payload.cover, isPublic: payload.isPublic },
      openid
    )

    // 公开作品进入待审核；私有作品不公开，无需审核
    const wantPublic = payload.isPublic !== false

    // 全局发布开关：只拦「新发布」，编辑已有作品不受影响
    if (!editId) {
      const cfg = await getPublishConfig()
      if (!(await isAdminUser(openid))) {
        if (!cfg.allowUserPublish) {
          throw new Error('当前暂未开放作品发布，请稍后再试')
        }
        if (wantPublic && !cfg.allowUserPublicPublish) {
          throw new Error('当前暂不开放公开作品发布，可保存为私有作品')
        }
      }
    }

    const publishFlag = {
      type: 'work',
      isDraft: false,
      reviewStatus: wantPublic ? REVIEW_PENDING : REVIEW_APPROVED,
      reviewNote: '',
      updatedAt: now
    }

    // 1) 编辑已有作品
    if (editId) {
      await requireOwnedWork(editId, openid)
      await db.collection(WORKS).doc(editId).update({
        data: Object.assign({}, payload, publishFlag)
      })
      return editId
    }

    // 2) 草稿转正：drafts 读出 → 写入 works → 删掉草稿
    if (draftId) {
      await requireOwnedDraft(draftId, openid)

      const created = await db.collection(WORKS).add({
        data: Object.assign({}, payload, publishFlag, {
          _openid: openid,
          favCount: 0,
          madeCount: 0,
          createdAt: now
        })
      })

      try {
        await db.collection(DRAFTS).doc(draftId).remove()
      } catch (e) {
        console.warn('[works] 发布后清理草稿失败:', e && (e.errMsg || e.message))
      }
      return created._id
    }

    const res = await db.collection(WORKS).add({
      data: Object.assign({}, payload, publishFlag, {
        _openid: openid,
        favCount: 0,
        madeCount: 0,
        createdAt: now
      })
    })
    return res._id
  },

  // 公开 / 私有切换
  async updateState({ workId, isPublic } = {}, openid) {
    await requireOwnedWork(workId, openid)

    const data = {
      isPublic: isPublic === true,
      isDraft: false,
      updatedAt: db.serverDate()
    }
    // 转为公开需要重新审核；转为私有则无需
    if (isPublic === true) {
      // 全局开关：普通用户在当前配置下不允许公开发布
      const cfg = await getPublishConfig()
      if (!(await isAdminUser(openid)) && !cfg.allowUserPublicPublish) {
        throw new Error('当前暂不开放公开作品发布，作品保持私有状态')
      }
      data.reviewStatus = REVIEW_PENDING
      data.reviewNote = ''
    }

    await db.collection(WORKS).doc(workId).update({ data })
    return true
  },

  // 重命名草稿（drafts 集合）
  async updateDraftTitle({ draftId, title } = {}, openid) {
    await requireOwnedDraft(draftId, openid)
    const t = String(title || '').trim().slice(0, 60)
    if (!t) throw new Error('标题不能为空')
    await db.collection(DRAFTS).doc(draftId).update({
      data: { title: t, updatedAt: db.serverDate() }
    })
    return true
  },

  // 删除草稿（drafts 集合）
  async removeDraft({ draftId } = {}, openid) {
    if (!draftId) throw new Error('缺少草稿 id')
    await requireOwnedDraft(draftId, openid)
    await db.collection(DRAFTS).doc(draftId).remove()
    return true
  },

  // 删除作品（顺手清理收藏关系）
  async removeWork({ workId } = {}, openid) {
    await requireOwnedWork(workId, openid)
    await db.collection(WORKS).doc(workId).remove()
    try {
      await db.collection(FAVS).where({ workId }).remove()
    } catch (e) {
      console.warn('清理收藏关系失败', e)
    }
    return true
  },

  // 一次性迁移：把历史上混在 works 里的草稿搬到 drafts 集合
  // 每次最多处理 100 条，数据多的话重复调用几次
  async adminMigrateDrafts({ pin } = {}, openid) {
    await requireAdmin(openid, pin)

    const res = await db.collection(WORKS)
      .where({ isDraft: true })
      .limit(MAX_LIMIT)
      .get()

    let moved = 0
    for (let i = 0; i < res.data.length; i++) {
      const doc = res.data[i]
      const data = Object.assign({}, doc)
      delete data._id
      delete data.isDraft
      delete data.favCount
      delete data.madeCount
      try {
        await db.collection(DRAFTS).add({ data })
        await db.collection(WORKS).doc(doc._id).remove()
        moved++
      } catch (e) {
        console.warn('[works] 迁移草稿失败:', doc._id, e && (e.errMsg || e.message))
      }
    }

    return { scanned: res.data.length, moved }
  },

  /* ---------------- 计数：任何登录用户可触发 ---------------- */

  // 使用次数 +1（二创复制）
  async incMadeCount({ workId } = {}, openid) {
    const doc = await getWorkById(workId)
    if (!doc) throw new Error('作品不存在')
    if (doc.isPublic !== true || doc.isDraft === true) {
      throw new Error('该作品未公开，无法统计使用次数')
    }
    await db.collection(WORKS).doc(workId).update({
      data: { madeCount: _.inc(1) }
    })
    return true
  },

  /* ---------------- 收藏 ---------------- */

  async toggleFav({ workId, isFav } = {}, openid) {
    if (!workId) throw new Error('缺少作品 id')

    const exist = await db.collection(FAVS)
      .where({ _openid: openid, workId })
      .count()

    if (isFav) {
      if (exist.total === 0) { // 防重复收藏重复计数
        await db.collection(FAVS).add({
          data: { _openid: openid, workId, createdAt: db.serverDate() }
        })
        await db.collection(WORKS).doc(workId).update({
          data: { favCount: _.inc(1) }
        })
      }
    } else {
      const removed = await db.collection(FAVS)
        .where({ _openid: openid, workId })
        .remove()
      // 只有真的删掉收藏记录时才减计数，避免数目变负
      const count = removed && removed.stats ? removed.stats.removed : 0
      if (count > 0) {
        await db.collection(WORKS).doc(workId).update({
          data: { favCount: _.inc(-1) }
        })
      }
    }
    return true
  },

  async checkIsFav({ workId } = {}, openid) {
    if (!workId) return false
    const res = await db.collection(FAVS)
      .where({ _openid: openid, workId })
      .count()
    return res.total > 0
  },

  async myFavorites(payload, openid) {
    const favRes = await db.collection(FAVS)
      .where({ _openid: openid })
      .orderBy('createdAt', 'desc')
      .limit(MAX_LIMIT)
      .get()

    if (!favRes.data.length) return []

    const ids = favRes.data.map(item => item.workId).filter(Boolean)
    if (!ids.length) return []

    const workRes = await db.collection(WORKS)
      .where({ _id: _.in(ids) })
      .limit(MAX_LIMIT)
      .get()

    const map = {}
    workRes.data.forEach(w => { map[w._id] = w })

    // 保持收藏时间倒序；作品被删、转私有、被下架、未过审（非本人）就不再展示
    return favRes.data
      .map(fav => map[fav.workId])
      .filter(w => w
        && (w.isPublic === true || w._openid === openid)
        && (w.isHidden !== true || w._openid === openid)
        && (reviewStatusOf(w) === REVIEW_APPROVED || w._openid === openid)
      )
      .map(publicView)
  },

  /* ---------------- 举报 ---------------- */

  // 任何登录用户都可以举报公开作品
  async report({ workId, reason, detail } = {}, openid) {
    if (!workId) throw new Error('缺少作品 id')

    const doc = await getWorkById(workId)
    if (!doc) throw new Error('作品不存在或已删除')
    if (doc._openid === openid) throw new Error('不能举报自己的作品')
    if (doc.isPublic !== true || doc.isDraft === true) {
      throw new Error('该作品未公开，无法举报')
    }

    const exist = await db.collection(REPORTS)
      .where({ _openid: openid, workId })
      .count()
    if (exist.total > 0) throw new Error('你已举报过该作品，我们会尽快处理')

    await db.collection(REPORTS).add({
      data: {
        _openid: openid,
        workId,
        workTitle: String(doc.title || '').slice(0, 60),
        reason: String(reason || '其他').slice(0, 30),
        detail: String(detail || '').slice(0, 200),
        status: 'pending',
        createdAt: db.serverDate()
      }
    })
    return true
  },

  /* ---------------- 审核（仅管理员） ---------------- */

  // 当前用户是否管理员（只用于显示入口，不含口令校验）
  async checkAdmin(payload, openid) {
    return isAdminUser(openid)
  },

  // 管理员登录：校验管理口令，通过后才能进入审核页
  async adminLogin({ pin } = {}, openid) {
    await requireAdmin(openid, pin)
    return true
  },

  /* ---------------- 全局发布开关 ---------------- */

  // 任何登录用户都能读，用于前端决定「发布」入口是否可用
  async getPublishConfig(payload, openid) {
    const cfg = await getPublishConfig()
    const admin = await isAdminUser(openid)

    return {
      isAdmin: admin,
      allowUserPublish: cfg.allowUserPublish,
      allowUserPublicPublish: cfg.allowUserPublicPublish,
      // 当前这个人的实际权限（管理员不受开关限制）
      canPublish: admin || cfg.allowUserPublish,
      canPublishPublic: admin || (cfg.allowUserPublish && cfg.allowUserPublicPublish)
    }
  },

  // 管理员读取开关（含口令校验）
  async adminGetConfig({ pin } = {}, openid) {
    await requireAdmin(openid, pin)
    return await getPublishConfig()
  },

  // 管理员修改开关
  async adminSetConfig({ pin, allowUserPublish, allowUserPublicPublish } = {}, openid) {
    await requireAdmin(openid, pin)

    const cur = await getPublishConfig()
    const next = {
      allowUserPublish: typeof allowUserPublish === 'boolean'
        ? allowUserPublish
        : cur.allowUserPublish,
      allowUserPublicPublish: typeof allowUserPublicPublish === 'boolean'
        ? allowUserPublicPublish
        : cur.allowUserPublicPublish
    }

    try {
      // doc().set() 是 upsert：文档不存在时按指定 _id 创建
      await db.collection(CONFIG).doc(CONFIG_ID).set({
        data: {
          allowUserPublish: next.allowUserPublish,
          allowUserPublicPublish: next.allowUserPublicPublish,
          updatedAt: db.serverDate(),
          updatedBy: openid
        }
      })
    } catch (e) {
      console.error('[works] 写入 config 失败:', e)
      throw new Error('配置保存失败，请确认已在云开发控制台创建 config 集合')
    }

    return next
  },

  /* ---------------- 管理员名单管理 ---------------- */

  // 当前管理员列表 + 内置引导名单 + 我自己的授权状态
  async adminListAdmins({ pin } = {}, openid) {
    await requireAdmin(openid, pin)

    const res = await db.collection(ADMINS).limit(MAX_LIMIT).get()
    const admins = res.data.map(a => ({
      _openid: a._openid,
      name: a.name || '管理员',
      enabled: a.enabled !== false,
      isSelf: a._openid === openid
    }))

    return {
      admins,
      bootstrap: BOOTSTRAP_ADMIN_OPENIDS.slice(),
      self: {
        openid,
        inCollection: admins.some(a => a._openid === openid),
        viaBootstrap: BOOTSTRAP_ADMIN_OPENIDS.indexOf(openid) >= 0
      }
    }
  },

  // 把自己登记进 admins 集合（当前靠内置名单授权时用，一键转正）
  async adminSelfEnroll({ pin, name } = {}, openid) {
    await requireAdmin(openid, pin)

    const exist = await db.collection(ADMINS).where({ _openid: openid }).count()
    if (exist.total > 0) return true

    await db.collection(ADMINS).add({
      data: {
        _openid: openid,
        name: String(name || '').trim().slice(0, 20) || '管理员',
        enabled: true,
        createdAt: db.serverDate(),
        createdBy: openid
      }
    })
    return true
  },

  // 按昵称 / 账号ID / openid 找人，拿到 openid 才能加管理员
  async adminFindUser({ pin, keyword } = {}, openid) {
    await requireAdmin(openid, pin)

    const kw = String(keyword || '').trim().slice(0, 40)
    if (!kw) return []

    const reg = db.RegExp({ regexp: escapeRegExp(kw), options: 'i' })
    const res = await db.collection(USERS)
      .where(_.or([
        { nickname: reg },
        { shortId: reg },
        { _openid: kw }
      ]))
      .limit(20)
      .get()

    return res.data.map(u => ({
      openid: u._openid,
      nickname: u.nickname || '拼豆爱好者',
      shortId: u.shortId || '',
      avatar: u.avatar || ''
    }))
  },

  // 添加管理员
  async adminAddAdmin({ pin, openid: targetOpenid, name } = {}, openid) {
    await requireAdmin(openid, pin)

    const target = String(targetOpenid || '').trim()
    if (!target || target.length < 20) throw new Error('openid 不合法')

    // 自助修复：admins 集合一旦有记录就以集合为准，
    // 所以添加别人之前先确保自己也在名单里，否则加完自己就失去权限了
    const selfExist = await db.collection(ADMINS).where({ _openid: openid }).count()
    if (selfExist.total === 0) {
      await db.collection(ADMINS).add({
        data: {
          _openid: openid,
          name: '管理员（内置）',
          enabled: true,
          createdAt: db.serverDate()
        }
      })
    }

    const exist = await db.collection(ADMINS).where({ _openid: target }).count()
    if (exist.total > 0) throw new Error('该用户已经是管理员了')

    await db.collection(ADMINS).add({
      data: {
        _openid: target,
        name: String(name || '').trim().slice(0, 20) || '管理员',
        enabled: true,
        createdAt: db.serverDate(),
        createdBy: openid
      }
    })
    return true
  },

  // 移除管理员
  async adminRemoveAdmin({ pin, openid: targetOpenid } = {}, openid) {
    await requireAdmin(openid, pin)

    const target = String(targetOpenid || '').trim()
    if (!target) throw new Error('缺少 openid')
    if (target === openid) throw new Error('不能移除自己')

    await db.collection(ADMINS).where({ _openid: target }).remove()
    return true
  },

  // 待处理举报列表（附作品信息）
  async adminReports({ pin } = {}, openid) {
    await requireAdmin(openid, pin)

    const repRes = await db.collection(REPORTS)
      .where({ status: 'pending' })
      .orderBy('createdAt', 'desc')
      .limit(MAX_LIMIT)
      .get()

    if (!repRes.data.length) return []

    const ids = []
    repRes.data.forEach(r => {
      if (r.workId && ids.indexOf(r.workId) < 0) ids.push(r.workId)
    })

    const map = {}
    if (ids.length) {
      const workRes = await db.collection(WORKS)
        .where({ _id: _.in(ids) })
        .limit(MAX_LIMIT)
        .get()
      workRes.data.forEach(w => { map[w._id] = w })
    }

    return repRes.data.map(r => {
      const w = map[r.workId] || {}
      return {
        _id: r._id,
        workId: r.workId,
        reason: r.reason,
        detail: r.detail,
        createdAt: r.createdAt,
        workExists: !!map[r.workId],
        workTitle: w.title || r.workTitle || '（作品已删除）',
        workCover: w.cover || '',
        workHidden: w.isHidden === true,
        workPublic: w.isPublic === true
      }
    })
  },

  // 待审核作品列表（先审后发）
  async adminPendingWorks({ pin } = {}, openid) {
    await requireAdmin(openid, pin)

    const res = await db.collection(WORKS)
      .where({ type: 'work', isDraft: false, reviewStatus: REVIEW_PENDING })
      .orderBy('updatedAt', 'desc')
      .limit(MAX_LIMIT)
      .get()

    return res.data.map(w => Object.assign({}, publicView(w), {
      reviewStatus: reviewStatusOf(w)
    }))
  },

  // 审核通过 → 出现在广场
  async adminApproveWork({ workId, pin } = {}, openid) {
    await requireAdmin(openid, pin)
    const doc = await getWorkById(workId)
    if (!doc) throw new Error('作品不存在')

    await db.collection(WORKS).doc(workId).update({
      data: {
        reviewStatus: REVIEW_APPROVED,
        reviewNote: '',
        reviewedAt: db.serverDate(),
        reviewedBy: openid,
        updatedAt: db.serverDate()
      }
    })
    return true
  },

  // 审核不通过 → 广场不可见，作者能看到原因
  async adminRejectWork({ workId, pin, reason } = {}, openid) {
    await requireAdmin(openid, pin)
    const doc = await getWorkById(workId)
    if (!doc) throw new Error('作品不存在')

    const note = String(reason || '').trim().slice(0, 100) || '内容不符合社区规范'

    await db.collection(WORKS).doc(workId).update({
      data: {
        reviewStatus: REVIEW_REJECTED,
        reviewNote: note,
        reviewedAt: db.serverDate(),
        reviewedBy: openid,
        updatedAt: db.serverDate()
      }
    })
    return true
  },

  // 下架作品（同时把该作品的待处理举报标记为已处理）
  async adminHide({ workId, pin } = {}, openid) {
    await requireAdmin(openid, pin)
    if (!workId) throw new Error('缺少作品 id')

    const doc = await getWorkById(workId)
    if (!doc) throw new Error('作品不存在')

    await db.collection(WORKS).doc(workId).update({
      data: { isHidden: true, hiddenAt: db.serverDate(), updatedAt: db.serverDate() }
    })
    await db.collection(REPORTS).where({ workId, status: 'pending' }).update({
      data: { status: 'handled', action: 'hide', handledAt: db.serverDate(), handledBy: openid }
    })
    return true
  },

  // 恢复上架
  async adminRestore({ workId, pin } = {}, openid) {
    await requireAdmin(openid, pin)
    if (!workId) throw new Error('缺少作品 id')

    const doc = await getWorkById(workId)
    if (!doc) throw new Error('作品不存在')

    await db.collection(WORKS).doc(workId).update({
      data: { isHidden: false, updatedAt: db.serverDate() }
    })
    await db.collection(REPORTS).where({ workId, status: 'pending' }).update({
      data: { status: 'handled', action: 'restore', handledAt: db.serverDate(), handledBy: openid }
    })
    return true
  },

  // 彻底删除作品（违规内容）
  async adminDeleteWork({ workId, pin } = {}, openid) {
    await requireAdmin(openid, pin)
    if (!workId) throw new Error('缺少作品 id')

    await db.collection(WORKS).doc(workId).remove()
    await db.collection(FAVS).where({ workId }).remove()
    await db.collection(REPORTS).where({ workId }).update({
      data: { status: 'handled', action: 'delete', handledAt: db.serverDate(), handledBy: openid }
    })
    return true
  }
}

// 配置自检：不需要用户身份，可以在云开发控制台的「测试」面板直接跑。
// 只返回布尔状态，绝不回显口令 / openid 原文。
function healthCheck() {
  return {
    ok: true,
    runtime: process.version,
    adminPinConfigured: !!ADMIN_PIN,
    adminPinFromEnv: !!process.env.ADMIN_PIN,
    adminOpenidsFromEnv: !!process.env.ADMIN_OPENIDS,
    bootstrapAdminCount: BOOTSTRAP_ADMIN_OPENIDS.length,
    handlerCount: Object.keys(handlers).length
  }
}

exports.main = async (event) => {
  const { action, payload } = event || {}

  // 控制台测试面板没有微信用户上下文，只放行这条自检
  if (action === 'healthCheck') {
    return { success: true, data: healthCheck() }
  }

  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return {
      success: false,
      msg: '获取用户身份失败（该 action 需要小程序用户身份，不能在控制台测试面板调用）'
    }
  }

  const handler = handlers[action]
  if (!handler) return { success: false, msg: `未知操作: ${action}` }

  try {
    const data = await handler(payload || {}, OPENID)
    return { success: true, data }
  } catch (err) {
    console.error(`[works] ${action} 失败:`, err)
    return { success: false, msg: err.message || String(err) }
  }
}
