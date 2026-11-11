// utils/draft-store.js
//
// 拆分存储的原因：
// 微信单个 storage key 上限 1MB，而一张 128x128 草稿的网格字符串约 48KB。
// 原来所有草稿（含网格）塞在一个 'drafts' 里，约 20 张就写满，
// 写失败又被 catch 掉 —— 表现就是「草稿悄悄没了」。
//
// 现在：
//   drafts            → 只存元数据数组（标题/时间/封面/云端 id），体积很小
//   draft_grid_<id>   → 单张草稿的网格字符串
// 并且旧的「网格内联在 drafts 里」的数据会在读取时自动迁移。

const INDEX_KEY = 'drafts'
const BODY_PREFIX = 'draft_grid_'
const MAX_DRAFTS = 10 // 每个用户最多 10 个草稿（与云端配额保持一致）

// ---------- 底层读写 ----------

function writeKey(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (e) {
    const err = new Error('本地存储空间不足，请删除部分草稿后重试')
    err.code = 'STORAGE_FULL'
    throw err
  }
}

function draftLimitError() {
  const err = new Error(`草稿最多 ${MAX_DRAFTS} 个，请先删除不用的草稿`)
  err.code = 'DRAFT_LIMIT'
  return err
}

function removeBody(id) {
  if (!id) return
  try { wx.removeStorageSync(BODY_PREFIX + id) } catch (e) {}
}

// ---------- 索引（含旧数据迁移） ----------

function readIndex() {
  let raw
  try {
    raw = wx.getStorageSync(INDEX_KEY)
  } catch (e) {
    return []
  }
  if (!Array.isArray(raw)) return []

  let migrated = false
  const meta = raw.map(item => {
    if (!item) return item
    let changed = false
    const next = Object.assign({}, item)

    // 旧结构：网格内联在索引里，迁移到独立 key
    if (typeof next.grid === 'string') {
      const grid = next.grid
      delete next.grid
      try { wx.setStorageSync(BODY_PREFIX + next.id, { grid }) } catch (e) {}
      changed = true
    }

    // 旧结构：一个含糊的 cloudId 同时指代草稿和作品，拆成两个明确字段
    if (next.cloudId !== undefined) {
      const legacy = next.cloudId
      if (legacy) {
        if (next.isPublished) next.cloudWorkId = next.cloudWorkId || legacy
        else next.cloudDraftId = next.cloudDraftId || legacy
      }
      delete next.cloudId
      changed = true
    }

    if (changed) migrated = true
    return next
  })

  if (migrated) {
    try { wx.setStorageSync(INDEX_KEY, meta) } catch (e) {}
  }
  return meta
}

function writeIndex(list) {
  writeKey(INDEX_KEY, list)
}

function sortByTime(list) {
  return list.slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
}

function trim(list) {
  const next = sortByTime(list)
  while (next.length > MAX_DRAFTS) {
    const removed = next.pop()
    if (removed) removeBody(removed.id)
  }
  return next
}

// ---------- 对外 API ----------

function createId() {
  return 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
}

/** 仅元数据列表（不含 grid，体积小，适合列表页） */
function getDrafts() {
  return readIndex()
}

/** 单张草稿的网格字符串 */
function getGrid(id) {
  if (!id) return ''
  try {
    const body = wx.getStorageSync(BODY_PREFIX + id)
    return (body && body.grid) || ''
  } catch (e) {
    return ''
  }
}

/** 完整草稿（元数据 + grid） */
function getDraft(id) {
  const meta = readIndex().find(d => d.id === id)
  if (!meta) return null
  return Object.assign({}, meta, { grid: getGrid(id) })
}

function splitDraft(draft) {
  const meta = Object.assign({}, draft)
  const grid = meta.grid
  delete meta.grid
  return { meta, grid }
}

/** 新增或更新单张草稿；超出配额会 throw（err.code === 'DRAFT_LIMIT'） */
function saveDraft(draft) {
  if (!draft || !draft.id) return getDrafts()

  const { meta, grid } = splitDraft(draft)

  const list = readIndex()
  const idx = list.findIndex(d => d.id === draft.id)

  // 新建时才做配额检查；更新已有草稿不受影响
  if (idx < 0 && list.length >= MAX_DRAFTS) {
    throw draftLimitError()
  }

  if (typeof grid === 'string') {
    writeKey(BODY_PREFIX + draft.id, { grid })
  }

  if (idx >= 0) list[idx] = Object.assign({}, list[idx], meta)
  else list.unshift(meta)

  const next = trim(list)
  writeIndex(next)
  return next
}

/**
 * 批量保存：索引只写一次（云端草稿同步用，避免 O(n²) 的反复读改写）
 * @param {Array} drafts
 */
function saveDrafts(drafts) {
  if (!Array.isArray(drafts) || !drafts.length) return getDrafts()

  const byId = {}
  readIndex().forEach(d => {
    if (d && d.id) byId[d.id] = d
  })

  drafts.forEach(draft => {
    if (!draft || !draft.id) return
    const { meta, grid } = splitDraft(draft)
    if (typeof grid === 'string') {
      writeKey(BODY_PREFIX + draft.id, { grid })
    }
    byId[draft.id] = Object.assign({}, byId[draft.id] || {}, meta)
  })

  const next = trim(Object.keys(byId).map(id => byId[id]))
  writeIndex(next)
  return next
}

function removeDraft(id) {
  const list = readIndex().filter(d => d.id !== id)
  removeBody(id)
  try { writeIndex(list) } catch (e) {}
  return list
}

function clearAll() {
  readIndex().forEach(d => removeBody(d.id))
  try { wx.removeStorageSync(INDEX_KEY) } catch (e) {}
}

/**
 * 把草稿层的错误转成适合直接展示给用户的文案
 * @returns {String} 非草稿相关错误返回空串
 */
function friendlyError(e) {
  if (!e) return ''
  if (e.code === 'DRAFT_LIMIT' || e.code === 'STORAGE_FULL') {
    return e.message || '草稿保存失败'
  }
  return ''
}

module.exports = {
  getDrafts,
  getDraft,
  getGrid,
  saveDraft,
  saveDrafts,
  removeDraft,
  createId,
  clearAll,
  friendlyError,
  MAX_DRAFTS
}
