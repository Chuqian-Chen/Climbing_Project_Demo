# 云函数说明

小程序页面只调用 `miniprogram/utils/api.js`。云函数负责需要管理员权限、内容安全或身份校验的写入。未开通云开发时，客户端自动回退本地演示数据。

## 部署

开发者工具中对每个函数目录右键「上传并部署：云端安装依赖」。`aiAnnotate` 的超时需在控制台手动调到 30s（CLI 不会应用 `config.json`）。

## 现有函数（13）

| 函数 | 作用 | 校验要点 |
| --- | --- | --- |
| `login` | 换取 openid，写入客户端 `yy_openid` | 登录即可 |
| `fetchAll` | 管理员权限全量/增量读（`since`） | 核心集合为空时客户端拒绝覆盖本地 |
| `initDb` | 建集合 + 灌演示数据 / `mode:'prod'` 清演示 | 可选 `ADMIN_OPENIDS`；force 只按种子 id 删除 |
| `saveWall` | 墙面协作写（`setHolds` / `removeRoute` / `setPhoto`） | 必须有 OPENID；holds 按 `routeId` 字段隔离 |
| `saveGymMeta` | 众包分级标准 | 必须有 OPENID；馆不存在则失败 |
| `updateRoute` | 改难度 / 颜色 / 备注名 | 线主或已认证定线员 |
| `updateBeta` | 改标题/步骤/易掉点等 | 仅作者 |
| `deleteContent` | 删 Beta / 线路 / 评论 / 打卡 | 线路有他人内容时转下架 |
| `setterApply` | 定线员申请 / 查状态 | 已 `approved` 的申请不会被重新提交打回 pending |
| `retireWall` | 整墙线路批量下架 | 服务端校验认证定线员 |
| `secCheck` | 文本 + 图片内容安全 | 检测服务不可用时客户端放行 |
| `aiAnnotate` | 岩点识别（算法候选 + 视觉模型复核）/ 线路看图分析（`mode:'beta'`） | 未配置模型或模型失败时返回算法结果；`hold-detect.js` 是小程序同名文件的副本，改算法后在 `tools/hold-detect` 运行 `npm run sync` |
| `notify` | 周打卡订阅消息骨架 | 模板 ID 为空则跳过发送 |

## 集合（与 mock-data 字段对应）

`users` `gyms` `routes` `betas` `checkins` `comments` `walls` `routephotos` `routereports` `setterApplications` `profiles` `likes` `favs` `follows` `events`

## 改演示数据后

`miniprogram/utils/mock-data.js` 与 `gym-directory.js` 改完后，复制到本目录 `initDb/` 再重新部署 `initDb`。

## 视觉模型（aiAnnotate）

云开发控制台 → 云函数 `aiAnnotate` → 配置 → 环境变量；超时调到 30s：

| 变量 | 说明 |
| --- | --- |
| `VISION_API_KEY` | 必填。不填时只用算法，「AI 看图分析」按钮不出现 |
| `VISION_API_URL` | 选填，OpenAI 兼容的 chat/completions 地址，默认通义千问 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`；智谱 `https://open.bigmodel.cn/api/paas/v4/chat/completions`；豆包 `https://ark.cn-beijing.volces.com/api/v3/chat/completions` |
| `VISION_MODEL` | 选填，默认 `qwen-vl-max`；智谱填 `glm-4v-plus`，豆包填推理接入点 ID |

本地联调（不连云、不花钱）：`cd tools/hold-detect && npm i && (cd ../../cloudfunctions/aiAnnotate && npm i --no-save jimp@0.16.13) && npm run test:ai`；
拿到 key 后用真模型跑 TA山 样张对比真值：`VISION_API_KEY=... npm run test:ai -- --real`。
