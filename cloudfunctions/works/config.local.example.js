// ============================================================
// 本地私有配置 —— 模板
//
// 用法：复制本文件为 config.local.js，再填入你自己的值。
//   copy config.local.example.js config.local.js
//
// config.local.js 不会提交到仓库（见 .gitignore）。
//
// 生产环境更推荐用云函数环境变量（云开发控制台 → 云函数 → works → 配置）：
//   ADMIN_PIN      管理口令
//   ADMIN_OPENIDS  超级管理员 openid，多个用英文逗号分隔
// 环境变量优先级高于本文件。
// ============================================================

module.exports = {
  // 管理口令：进入「内容审核」时输入。留空则审核功能整体停用。
  adminPin: '',

  // 内置超级管理员 openid 列表。留空则只认 admins 集合里的成员。
  adminOpenids: []
}
