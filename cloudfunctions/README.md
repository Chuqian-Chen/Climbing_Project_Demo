# 云函数说明

小程序页面只调用 `miniprogram/utils/api.js`。云函数负责需要管理员权限、内容安全或身份校验的写入。未开通云开发时，客户端自动回退本地演示数据。

## 部署

开发者工具中对每个函数目录右键「上传并部署：云端安装依赖」。`aiAnnotate` 的超时需在控制台手动调到 30s（CLI 不会应用 `config.json`）。

## 现有函数（13）

| 函数 | 作用 | 校验要点 |
| --- | --- | --- |
| `login` | 换取 openid，写入客户端 `yy_openid` | 登录即可 |
| `fetchAll` | 管理员权限全量/增量读（`since`）；含 likes/favs；软删墓碑 | 核心集合为空时客户端拒绝覆盖本地 |
| `initDb` | 建集合 + 灌演示数据 / `mode:'prod'` 清演示 | 可选 `ADMIN_OPENIDS`；force 只按种子 id 删除 |
| `saveWall` | 墙面协作写（`setHolds` / `removeRoute` / `setPhoto`） | 必须有 OPENID；holds 按 `routeId` 字段隔离 |
| `saveGymMeta` | 众包分级标准 | 必须有 OPENID；馆不存在则失败 |
| `updateRoute` | 改难度 / 颜色 / 备注名 | 线主或已认证定线员 |
| `updateBeta` | 改标题/步骤/易掉点等 | 仅作者 |
| `deleteContent` | 软删 Beta / 线路 / 评论 / 打卡（`deleted`+`mtime`） | 线路有他人内容时转下架 |
| `setterApply` | 定线员申请 / 查状态 | 已 `approved` 的申请不会被重新提交打回 pending |
| `retireWall` | 整墙线路批量下架 | 服务端校验认证定线员 |
| `secCheck` | 文本 + 图片内容安全 | 检测服务不可用时客户端放行 |
| `aiAnnotate` | 视觉模型圈点插槽 | 失败回退客户端色块算法 |
| `notify` | 周打卡订阅消息骨架 | 模板 ID 为空则跳过发送 |

## 集合（与 mock-data 字段对应）

`users` `gyms` `routes` `betas` `checkins` `comments` `walls` `routephotos` `routereports` `setterApplications` `profiles` `likes` `favs` `follows` `events`

## 改演示数据后

`miniprogram/utils/mock-data.js` 与 `gym-directory.js` 改完后，复制到本目录 `initDb/` 再重新部署 `initDb`。名录更新后需再跑一次「生产灌库」才会把新地址/坐标写进云数据库。
