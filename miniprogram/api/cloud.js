// api/cloud.js
// 云能力统一封装：把平台返回的技术性错误翻译成用户/开发者能看懂的话。

const NOT_DEPLOYED_HINT =
  '请先在开发者工具中右键 cloudfunctions 下的对应目录 → 「上传并部署：云端安装依赖」'

const STORAGE_PERMISSION_HINT =
  '云存储没有写入权限。请到 云开发控制台 → 存储 → 权限设置，' +
  '改成「所有用户可读，仅创建者可读写」'

/**
 * @param {String} name    云函数名
 * @param {String} action  动作名（云函数内部按 action 分发）
 * @param {Object} payload 参数
 * @returns {Promise<any>} 直接 resolve 云函数返回的 data
 */
export function callFunction(name, action, payload) {
  return wx.cloud
    .callFunction({ name, data: { action, payload } })
    .then(res => {
      const r = (res && res.result) || {}
      if (r.success) return r.data
      throw new Error(r.msg || `${name}.${action} 请求失败`)
    })
    .catch(err => {
      const msg = (err && (err.errMsg || err.message)) || ''

      // -501000 / FUNCTION_NOT_FOUND：云函数还没部署或名字不对
      if (msg.indexOf('FUNCTION_NOT_FOUND') >= 0 || msg.indexOf('-501000') >= 0) {
        throw new Error(`云函数 ${name} 不存在，${NOT_DEPLOYED_HINT}`)
      }
      // 云开发环境未开通 / 环境 ID 配错
      if (msg.indexOf('env') >= 0 && msg.indexOf('not exist') >= 0) {
        throw new Error(`云开发环境不可用，请检查 app.js 中 wx.cloud.init 的 env 配置`)
      }
      throw err instanceof Error ? err : new Error(msg || '网络异常')
    })
}

/**
 * 上传文件到云存储，并把权限类错误翻译成可操作的提示
 * @returns {Promise<String>} fileID
 */
export function uploadFile(filePath, cloudPath) {
  return wx.cloud.uploadFile({ cloudPath, filePath })
    .then(res => res.fileID)
    .catch(err => {
      const msg = (err && (err.errMsg || err.message)) || ''

      // -503002 / STORAGE_EXCEED_AUTHORITY：云存储权限不足
      if (
        msg.indexOf('-503002') >= 0 ||
        /STORAGE_EXCEED_AUTHORITY|no access right to the storage/i.test(msg)
      ) {
        throw new Error(STORAGE_PERMISSION_HINT)
      }
      throw err instanceof Error ? err : new Error(msg || '上传失败')
    })
}

