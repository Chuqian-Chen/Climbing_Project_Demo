# 岩友Beta

微信小程序 Demo：帮一个人去攀岩馆时，**更快找到该怎么爬**（Beta）并**记下自己的完攀**。

仓库：[github.com/Chuqian-Chen/Climbing_Project_Demo](https://github.com/Chuqian-Chen/Climbing_Project_Demo)

> 产品口径：打卡记录工具，个人记录可公开。不是大众点评，也不是约伴社区。

## 演示视频

- 横屏 [`docs/demo/yanyou-beta-demo.mp4`](docs/demo/yanyou-beta-demo.mp4)（约 110 秒，1080p，无声）
- 竖屏 9:16 + 讲解字幕，适合视频号：[`docs/demo/yanyou-beta-vertical.mp4`](docs/demo/yanyou-beta-vertical.mp4)（1080×1920，无声）

内容：首页 Beta 流 → Beta 详情 → 打卡与海报 → 足迹 → 岩馆名录 → TA山墙面圈点与 AI 预判 → 发布 Beta。

[![演示视频封面](docs/demo/yanyou-beta-demo-cover.jpg)](docs/demo/yanyou-beta-demo.mp4)

画面由仓库源码在浏览器中渲染后自动录制，改完页面可重新生成：`cd tools/demo-video && npm i && npm run record`（竖屏版：`npm run record:vertical`，见 [tools/demo-video](tools/demo-video/README.md)）。

## 快速开始

1. 用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)导入本仓库根目录
2. 使用项目内 `project.config.json` 的 AppID，或改成你自己的
3. 编译即可预览。未开通云开发时自动走**本地演示数据**（3 家岩馆、20 条线、15 条 Beta）

本地写入（打卡 / 发布 / 点赞）存在 storage，可在「我的 → 数据管理 → 重置本地演示数据」清空。

## 板块怎么走

```
首页 Beta 流 ──► Beta 详情 ──► 跟练打卡
     │                ▲
     ▼                │
岩馆列表 ──► 馆详情（展开线看 Beta）──► 线路详情
     │                                      │
     └──► 墙面圈点 / 建线 ──────────────────┘
                                           │
足迹（热力/金字塔/徽章）◄── 打卡完攀 / 磕线中
我的（档案/定线员/数据管理）
```

| 板块 | 入口 | 可靠逻辑 |
| --- | --- | --- |
| **首页** | Tab | 双列 Beta 瀑布流 + 难度档筛选；已授权才静默定位附近岩馆；「继续磕线」来自未完攀打卡 |
| **岩馆** | Tab | 城市切换 + 定位排序；名录 130+ 家；下拉刷新走云端全量 |
| **馆详情** | 岩馆卡 / 桌贴码 `scene=gymId` | 墙面/难度筛选；点线路卡就地预览前 3 条 Beta，可直接发这条线的 Beta |
| **线路详情** | 馆详情 / 搜索 / 分享 | 身份 = 馆·墙·颜色点·V 几；身高匹配 Beta 置顶；线主/定线员可改难度颜色、删除或下架 |
| **Beta 详情** | 瀑布流 / 线路 | 图文步骤 + 易掉点 + 评论；作者可编辑/删除 |
| **墙面** | 馆详情墙入口 | 浏览点徽章高亮该线；编辑模式圈手点/脚点；AI 色块圈点仅作候选；整墙换线仅认证定线员 |
| **发布** | Tab 中央 ＋ | 选已有线或开荒建线；开荒线自动挂到该馆第一面墙 |
| **打卡** | 线路 / Beta | 闪送 / 完攀 / 磕线中，≤3 次点击；可生成海报 |
| **足迹** | Tab | 热力图、完攀金字塔、连续周（必须接到本周或上周）、成就 |
| **我的** | Tab | 身高臂展决定「适合你」标签；定线员走申请制；危险操作收在数据管理 |

## 数据怎么流

页面只调 `miniprogram/utils/api.js`，不直接碰 mock / 云数据库。

```
页面  →  api.js
          ├─ 读：store（我的写入）+ data-source（云快照 或 mock-data + 岩馆名录）
          └─ 写：store 立即生效；云函数 / cloudAdd 尽力同步
app.ts onLaunch → cloud-sync.ensureInit()
                 → 成功后 data-source.onSync 刷新当前页 load()
```

- 云未开通、核心集合为空、网络失败：保留本地演示数据，不空刷
- 点赞 / 收藏 / 难度感受票目前是本地状态（多端不同步，已知边界）
- 线路生命周期（新线 ≤7 天、即将拆线 ≤7 天）由 `setDate` / `removeDate` 计算；演示数据相对「今天」滚动，Demo 永远能看到这两种状态

## 工程结构

```
miniprogram/
  app.ts / app.json          启动、云初始化、同步引导
  custom-tab-bar/            四 Tab + 中央发布
  pages/                     业务页（见上表）
  components/                route-card / beta-card / beta-tile / empty-state
  utils/
    api.js                   ★ 唯一数据入口
    data-source.js           云快照 ↔ mock 切换
    cloud-sync.js            login + fetchAll
    store.js                 本地持久化
    mock-data.js             演示 schema
    gym-directory.js         北京/上海馆名录
    grade.js / helpers.js    等级色、日期距离
cloudfunctions/              见目录内 README（13 个云函数）
docs/launch/                 类目 / 隐私 / 定位审核材料
```

## 云开发（可选）

开通后在 `miniprogram/app.ts` 填写环境 ID，上传 `cloudfunctions/` 下全部函数。首次用「我的 → 数据管理 → 初始化云数据库」。

`initDb` 若配置了环境变量 `ADMIN_OPENIDS`（逗号分隔），仅这些 openid 可灌库 / 重灌。

## 已知边界

- 增量同步看不到删除，下拉刷新或 24h 缓存过期后消失
- 订阅消息模板 ID 未申请（`flags.SUBSCRIBE_TMPLS` 为空）
- 视频内容安全需异步回调，尚未接入
- 关注/粉丝入口由 `flags.SOCIAL=false` 关闭
