# 拼豆图纸工坊（leafer_pindou）

一个基于 **微信小程序 + 云开发 + Leafer UI** 的拼豆 / 像素图纸工具：可以手绘图纸、把图片转成拼豆图纸、识别已有图纸，并把作品发布到广场供他人二次创作。

## 技术栈

| 层 | 说明 |
|---|---|
| 渲染 | `@leafer-ui/miniapp`（`miniprogram_npm` 由「工具 → 构建 npm」生成） |
| 后端 | 微信云开发（云函数 + 云数据库 + 云存储） |
| 安全 | 数据库对客户端**完全关闭**，所有读写经云函数 `works` 收口 |
| UI | 原生小程序自定义组件 + 自定义 tabBar |

## 目录结构

```
miniprogram/
├── app.js / app.json / app.wxss
├── api/                      # 数据访问层，全部是云函数的薄封装
│   ├── work.js               # → 云函数 works
│   ├── favorite.js           # → 云函数 works（收藏动作）
│   ├── user.js               # → 云函数 login / updateUserInfo + 云存储
│   └── qrcode.js             # → 云函数 getQrCode
├── utils/
│   ├── bead-colors.js        # 291 色色卡（A~M 标准 + 扩展）
│   ├── grid-codec.js         # 网格 ↔ 色号索引 编解码、打包、统计
│   ├── draft-store.js        # 本地多草稿管理
│   ├── history.js            # 本地浏览记录
│   ├── recent-colors.js      # 12 色常用色
│   ├── image-to-grid.js      # 图片 → 网格（含限色数量化）
│   ├── image-parser.js       # 已有图纸识别
│   └── image-cutout.js       # 四角取色的简易抠图
├── pages/                    # 主包：广场 / 设计 / 我的
├── components/
│   └── avatar/               # 统一头像：有图显示图，无图显示「昵称首字 + 稳定配色」
├── custom-tab-bar/           # 自定义 tabBar（组件，不进 pages）
└── subpackages/
    ├── design-drawing/       # 超级画板、图片转图纸、图纸识别、发布、作品详情
    └── user-storage/         # 草稿、收藏、历史、公开/私有作品、设置、小程序码

cloudfunctions/
├── works/                    # ⭐ 作品/草稿/收藏的统一读写入口（归属校验 + 计数）
├── login/                    # 登录 + 新用户建号（生成 shortId）
├── updateUserInfo/           # 更新昵称/头像，并同步到该用户全部作品
└── getQrCode/                # 生成小程序码（注意 envVersion）
```

## 数据模型与权限（重要）

| 集合 | 用途 | 客户端权限 |
|---|---|---|
| `works` | **只放正式作品**（`isDraft` 恒为 `false`） | **不可读写** |
| `drafts` | **草稿独立存储**（`_openid`、`title`、`grid`、`gridSize`、`cover`、`updatedAt`） | **不可读写** |
| `favorites` | 收藏关系（`_openid` + `workId`） | **不可读写** |
| `users` | 用户资料（`_openid`、`shortId`、`nickname`、`avatar`） | **不可读写** |
| `reports` | 举报记录 | **不可读写** |
| `admins` | 审核人员名单 | **不可读写** |

所有集合统一设为「**所有用户不可读写**」（即只允许云函数/管理端访问）。
客户端拿不到任何集合句柄，隐私数据（草稿、私有作品）不会被 `.doc(id).get()` 直读。

### 草稿与作品分离

草稿不再混放在 `works` 里，而是独立到 `drafts` 集合，好处：

- `works` 的查询不用再带 `isDraft: false`，索引与语义都干净
- 草稿量大时不会拖累广场分页查询
- 权限模型更清晰：草稿永远是私有的，作品才涉及公开/审核/收藏

**草稿转正 = 一次搬家**：`publish(draftId)` 会从 `drafts` 读出 → 写入 `works`
→ 删除原草稿，返回新的作品 id。所以草稿和作品是两套 `_id`。

本地草稿用两个明确字段记录云端对应关系，不再共用一个含糊的 `cloudId`：

| 字段 | 指向 |
|---|---|
| `cloudDraftId` | `drafts` 集合的 `_id`（草稿发布后清空） |
| `cloudWorkId` | `works` 集合的 `_id`（发布后才有） |

老的本地草稿如果还是 `cloudId` 一个字段，`draft-store` 读取时会自动按
`isPublished` 判断拆成上面两个，无需手工处理。

> 历史遗留：升级前创建的云端草稿仍躺在 `works` 里（`isDraft: true`）。
> 到「内容审核」页点一次「**迁移历史草稿到 drafts 集合**」即可搬过去，
> 每批最多 100 条，数据多可重复点。

### 草稿配额：每人 10 个

| 层 | 上限 | 位置 |
|---|---|---|
| 云端 | 10 | `cloudfunctions/works/index.js` 的 `MAX_DRAFTS_PER_USER` |
| 本地 | 10 | `utils/draft-store.js` 的 `MAX_DRAFTS` |

- **只在「新建草稿」时校验**，更新已有草稿不受限制，不会因为满了就无法继续保存当前作品。
- 超限时抛 `err.code === 'DRAFT_LIMIT'`，各入口（自动保存、转换、识别、二创）都会弹窗提示
  用户先删草稿，并说明「当前内容尚未保存」。
- 「我的草稿」页顶部常驻显示 `草稿 N / 10`，满了会变红并提示。
- 云端草稿同步（`saveDrafts` 批量）是唯一会静默裁剪到 10 的路径（保留最新的），
  因为它是后台行为，不适合弹窗打断。

两个数字要一起改，否则会出现本地存得下、云端拒收的割裂体验。

`works` 云函数负责的事：

1. **身份**：一律用 `cloud.getWXContext().OPENID`，不信任客户端传入的 openid；
2. **归属**：写操作前校验 `doc._openid === OPENID`，越权直接报错；
3. **字段白名单**：只有 `EDITABLE_FIELDS` 里的业务字段能写入，`type` / `isDraft` /
   `favCount` / `madeCount` / `_openid` 全部由服务端决定；
4. **读取收敛**：`getDetail` 只放行「公开作品」或「作者本人（含草稿）」，并回传 `_isOwner`；
5. **计数**：`favCount` / `madeCount` 用服务端 `_.inc()`，不再需要给客户端开写权限；
6. **响应脱敏**：返回前抹掉 `_openid`，不把作者身份标识暴露给访问者。

> 注：云函数里 `add()` **不会自动写入 `_openid`**，所以新增文档时是显式写入的，
> 这也是迁移后必须走云函数、不能再用客户端 `.add()` 的原因。

## 本地存储结构

微信**单个 storage key 上限 1 MB**，而一张 128×128 草稿的网格字符串约 48 KB。
因此草稿做了拆分存储（旧数据读取时会自动迁移）：

| key | 内容 |
|---|---|
| `drafts` | 元数据数组（标题 / 时间 / 封面 / 云端 id），体积很小 |
| `draft_grid_<id>` | 单张草稿的网格字符串 |
| `baseColors` | 12 个常用色 |

写满时 `saveDraft` 会抛出 `err.code === 'STORAGE_FULL'`，页面会弹窗提示用户清理草稿，
不再静默丢失。草稿数量上限 60，超出淘汰最旧的。

## 本地运行 / 部署顺序

1. 微信开发者工具导入本目录（`miniprogramRoot: miniprogram/`）。
2. 「工具 → 构建 npm」生成 `miniprogram/miniprogram_npm`。
3. 云开发环境 ID 写在 `miniprogram/app.js` 的 `wx.cloud.init({ env })`。
4. 依次上传并部署 `cloudfunctions` 下的 **4 个**云函数（右键 → 上传并部署：云端安装依赖）。
   `works` 是新增的，**必须先部署**。
5. ⚠️ 确认 `works` 云函数部署成功、小程序能正常读到广场列表之后，
   再去控制台把 `works` / `favorites` / `users` 的权限改成「所有用户不可读写」。
   顺序反了会导致前端所有列表/详情直接失败。
6. 上线前确认 `cloudfunctions/getQrCode/index.js` 的 `envVersion` 为 `release`。

## 性能相关的实现要点

- **最近色匹配**（`utils/nearest-color.js`）：RGB 各量化到 5 bit 做缓存桶，
  实际参与全色卡比对的是「不同颜色种类数」而不是像素数。128×128 从约 477 万次
  距离计算降到与色种数同量级。
- **画布缩放**：`PixelCanvas` 按基准尺寸绘制一次，缩放/平移只改 `worldLayer` 的
  `scaleX/scaleY/x/y`，不再重建图元（原来 128×128 每缩放一次要重建 1.6 万个 Rect）。
- **导出封面**：导出前临时把视图复位，避免用户缩放/平移过之后封面偏移或被裁切。
- **触摸坐标**：用 `touch.pageX/pageY` 配合「页面绝对坐标」换算，
  页面滚动后绘图坐标依然正确。
- **云端草稿同步**：一次性读索引 + 批量写入，原来是每张草稿整表读写（O(n²)）。

## 内容安全（UGC 合规）

广场存在用户自由填写的内容，微信审核要求必须有内容安全机制，否则会被驳回。
已在云函数里接入：

| 位置 | 接口 | 说明 |
|---|---|---|
| `works.publish` | `security.msgSecCheck` v2 | 作品标题 |
| `works.publish` | `security.imgSecCheck` | 封面图（仅公开时；>1MB 跳过） |
| `works.saveDraft` | `security.msgSecCheck` v2 | 草稿标题 |
| `updateUserInfo` | `security.msgSecCheck` v2 | 用户昵称（并限长 20 字） |

策略是**检测到违规就拒绝，检测接口本身不可用则放行并打日志** ——
避免一次接口波动导致所有用户都无法发布。`config.json` 里已声明对应 openapi 权限。

## 广场搜索

首页顶部的搜索框是真实可用的：

- **匹配范围**：作品标题 + 作者昵称，不区分大小写
- **只搜合法内容**：仅返回「公开 + 已过审 + 未下架」的作品
- **防抖 400ms**：停止输入后才发请求，避免每个字符打一次云函数
- **分页**：触底继续加载，`pageSize` 与广场一致
- **空态**：无结果时提示「没有找到相关图纸，换个关键词试试」
- 清空输入框会自动退出搜索、恢复原来的广场流

关键词里的正则特殊字符（`( . * [ ]` 等）会在云函数侧用 `escapeRegExp` 转义，
避免用户输入直接导致查询报错。

> 注意：`db.RegExp` 模糊匹配走的是全表扫描，作品量大了以后建议换成
> 云开发提供的全文检索或给 `title` 建独立搜索表。

## 默认头像

新注册用户没有头像（`avatar` 为空字符串）。如果直接 `<image src="">`，广场列表里会出现空白/破图。

`components/avatar` 统一兜底：

- 有 `src` → 正常显示图片
- 没有 `src` → 显示「昵称首字」圆形头像，背景色由昵称哈希决定
  （同一个昵称永远是同一个颜色，不同用户之间能区分开）

使用点：广场卡片、我的收藏、浏览记录、个人设置。个人页头像本身已有文字兜底，保持原样。

不需要为默认头像新增任何图片资源。

## 内容审核（举报 + 人工处置）

机器检测只能挡住明显违规，UGC 还需要**举报入口**和**人工处置能力**，否则审核不通过。

### 数据

| 集合 | 用途 |
|---|---|
| `reports` | 举报记录：`_openid` / `workId` / `reason` / `detail` / `status` / `createdAt` |
| `works.isHidden` | 下架标记（`true` 表示已下架，广场与详情均不可见） |

### 先审后发

公开作品发布后**不会立刻出现在广场**，而是进入待审核队列：

```
发布(公开) → reviewStatus = 'pending' → 管理员通过 → 'approved' → 出现在广场
                                     → 管理员驳回 → 'rejected' → 仅作者可见 + 驳回原因
```

| 字段 | 说明 |
|---|---|
| `reviewStatus` | `pending` / `approved` / `rejected`；**字段缺失视为 approved** |
| `reviewNote` | 驳回原因，作者在作品详情页能看到 |
| `reviewedAt` / `reviewedBy` | 审核时间与审核人 |

关键点：

- **老数据兼容**：改造前发布的作品没有 `reviewStatus` 字段，一律按 `approved` 处理，
  否则上线瞬间所有已有作品会从广场消失。
- 发布为**私有**的作品不需要审核（`reviewStatus = 'approved'`）。
- 「私有 → 转为公开」会**重新进入待审核**。
- 作者**编辑已通过的作品**后，同样会重新进入待审核。
- 未过审的作品：广场、他人详情、他人收藏列表均不可见；作者和管理员仍可查看。

⚠️ `reports` 集合需要**在云开发控制台手动创建**，云函数的 write 不会自动建集合。

### 用户侧

- 广场卡片**长按** → 选举报理由 → 提交
- 作品详情页底部「举报该作品」（作者本人看不到）
- 同一用户对同一作品只能举报一次；不能举报自己的作品；未公开作品不可举报

### 管理侧

「我的」→「**个人设置**」→（仅管理员可见）**内容审核** → 输入**管理口令** → 两个页签：

- **待审核作品**：发布待审的作品 → 通过 / 不通过（可填驳回原因）
- **举报处理**：被举报的作品 → 下架 / 恢复上架 / 删除

**关于「管理员登录」**：小程序没有独立的登录概念，用户打开小程序时微信已完成鉴权，
服务端 `cloud.getWXContext().OPENID` 就是身份。所以管理权限做成两道服务端校验：

```
① 身份：openid 在 admins 集合里（enabled !== false）
② 口令：ADMIN_PIN，每次管理操作都会重新校验
```

两者都在云函数里校验，前端只负责显示入口；口令只存在页面实例内存里，退出页面即失效，
不写 storage。任一环节失败都会退回登录门。

**管理员名单（`admins` 集合）**

| 字段 | 说明 |
|---|---|
| `_openid` | 审核人员的 openid |
| `name` | 备注名（可选） |
| `enabled` | `false` 表示停用 |
| `createdAt` / `createdBy` | 添加时间与操作人 |

**授权规则**：两条来源取「或」——

1. **内置超级管理员**（环境变量 `ADMIN_OPENIDS`）：永远有效、不可撤销，防止把自己锁在外面
2. **`admins` 集合成员**：可在应用内添加/移除

`adminAddAdmin` 会在添加别人之前先把自己补进集合，避免「加完别人自己失去权限」。

### 怎么加管理员

**方式一（推荐）：应用内添加**

「我的」→「个人设置」→「内容审核」→ 输口令 → **管理员** 页签
→ 输入对方的**昵称或账号ID** 查找 → 点「添加」→ 填备注名。

对方需要**至少打开过一次小程序**（这样 `users` 集合里才有他的记录）。
添加后对方重新进入「个人设置」就能看到「内容审核」入口。

**方式二：云开发控制台**

1. 让对方打开一次小程序
2. 控制台 → 数据库 → `users` → 按昵称找到他的记录 → 复制 `_openid`
3. 数据库 → `admins` → 添加记录：

```json
{
  "_openid": "复制来的 openid",
  "name": "张三（审核）",
  "enabled": true
}
```

⚠️ 如果这是 `admins` 的第一条记录，记得把自己的 openid 也加一条，
否则集合变成「有记录」状态后，内置引导名单就失效了，你会进不去。
用应用内方式添加则不需要担心这点。

**管理口令**

凭证**不写在源码里**，读取优先级：

```
1. 云函数环境变量（推荐，生产用）
     云开发控制台 → 云函数 → works → 配置 → 环境变量
       ADMIN_PIN      管理口令
       ADMIN_OPENIDS  内置超级管理员 openid，多个用英文逗号分隔
2. cloudfunctions/works/config.local.js（本地兜底，已被 .gitignore 忽略）
3. 空 —— 审核功能停用（fail-closed）
```

首次克隆仓库后，先创建本地配置：

```bash
cd cloudfunctions/works
copy config.local.example.js config.local.js    # Windows
# cp config.local.example.js config.local.js    # macOS / Linux
```

然后填上 `adminPin` 和 `adminOpenids`。

> `config.local.js` 不会进仓库，但**会被「上传并部署云函数」一起传到云端**，
> 所以既能保住兜底、又不会把凭证泄漏到 GitHub。

改完环境变量或本地配置后需要**重新部署** `works`。

### 敏感信息会不会暴露？

**云函数代码不会下发到客户端。** 只有 `miniprogram/` 会被打包成小程序包发到用户手机，
`cloudfunctions/` 部署在腾讯云服务端运行，用户拿不到源码。

源码仓库里也**不含任何凭证** —— 已全部移到环境变量或 gitignore 的本地配置。

即便口令泄漏也不等于权限被攻破 —— `requireAdmin` 是**双重校验**：

```js
if (String(pin || '') !== ADMIN_PIN) throw new Error('管理口令错误')  // ① 口令
const ok = await isAdminUser(openid)                                  // ② 身份
```

其中 `openid` 来自 `cloud.getWXContext()`，是微信在服务端注入的鉴权上下文，
**客户端无法伪造**。所以「知道 openid + 知道口令」也没用，必须真的是那个微信账号登录。

`appid` 和云环境 ID 出现在代码里是正常且必要的，它们属于公开标识，不是密钥；
项目里没有任何腾讯云 SecretId/SecretKey。

openid 不是「我的」页那个 `shortId`，要去云开发控制台 → 数据库 → `users` 集合里看，
或者看小程序启动日志打印的 openid。

### 下架的效果

`listSquare`、`latestByIds`、`myFavorites` 都会过滤 `isHidden: true`，
`getDetail` 对非作者和非管理员返回「该作品已被下架」。
作者本人仍能在「我的作品」里看到自己被下架的作品。

## 隐私接口（后台必须配置）

以下接口需要在小程序后台「设置 → 服务内容声明 → 用户隐私保护指引」中声明，
审核通过后接口才可用，否则会直接 fail：

| 接口 | 使用位置 | 需声明 |
|---|---|---|
| `wx.chooseMedia` | 图片转图纸、图纸识别 | 选中的照片或视频信息 |
| `wx.saveImageToPhotosAlbum` | 我的小程序码 | 相册（仅写入）权限 |
| `open-type="chooseAvatar"` | 个人设置 | 用户信息（微信昵称、头像） |
| `wx.setClipboardData` | 我的（复制账号ID） | 剪切板 |

## 上线检查清单

- [x] 主包体积合规（清理陈旧 npm 产物后 1.08 MB / 2 MB）
- [x] 云函数 action 与 api 层对齐（14/14）
- [x] 数据库对客户端零直连，权限收敛到云函数
- [x] 内容安全检测已接入
- [x] 举报入口 + 人工处置后台已接入
- [x] `getQrCode` 的 `envVersion` 为 `release`
- [x] 清理 `console.log`，保留 `console.error` / `warn`
- [x] `libVersion` 统一为 `3.17.3`
- [ ] **重新「构建 npm」**（`@leafer-ui/draw` 已提升为直接依赖，必须重建并验证画板可用）
- [ ] **部署 `works` 云函数**（未部署则广场不可用）
- [ ] **部署 `updateUserInfo`**（昵称内容安全校验）
- [ ] **创建 `drafts` / `reports` / `admins` 集合**，权限均设为「所有用户不可读写」
- [ ] 数据库全部集合设为「所有用户不可读写」
- [ ] 升级后在审核页执行一次「迁移历史草稿」
- [ ] 云存储确认封面可被所有用户读取
- [ ] 小程序后台填写用户隐私保护指引（见上表）
- [ ] 确认 appid、云开发环境为正式环境
- [ ] 设置最低基础库版本
- [ ] **配置云函数环境变量 `ADMIN_PIN`（必填）和 `ADMIN_OPENIDS`（可选）**
      —— 不配 `ADMIN_PIN` 审核功能会直接停用
- [ ] 仓库不要设为公开，或先把 openid / 口令从源码里删掉
- [ ] 在 `admins` 集合里添加审核人员 openid

## 已知待办

- 广场列表每次翻页是一次云函数调用，量大后可考虑加缓存或按游标分页。
- `PixelCanvas` 仍是每格一个 Rect，超大画布可考虑合并为单张 ImageData / Path 绘制。
- `login` 的 `shortId` 是 `count` 后 `add`，极端并发下仍有撞号可能。
- 小程序码的 `scene` 参数尚未被首页消费，扫码目前只是打开首页。


