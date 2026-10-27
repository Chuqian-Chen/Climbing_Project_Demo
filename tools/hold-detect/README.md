# 岩点检测：回归测试与云函数联调（tools/hold-detect）

算法本体在 `miniprogram/utils/hold-detect.js`（小程序端），云函数 `aiAnnotate` 用的是它的副本。

```bash
cd tools/hold-detect && npm i
npm run eval                  # TA山 真值对比：每条线的命中 / 漏检 / 误检，以及合计找全率、准确率
npm run eval -- --render      # 把结果画到 out/*.jpg（白圈 = 真值，彩圈 = 检出）
npm run eval -- --debug       # 列出被剔除的真岩点、保留下来的误检，调 CFG 参数用
WIDTH=360 npm run eval        # 换取样宽度（小程序端与云函数都是 540）
npm run sync                  # 改完算法后同步到 cloudfunctions/aiAnnotate/hold-detect.js
```

云函数本地联调（桩替代云存储和模型，不花钱）：

```bash
(cd ../../cloudfunctions/aiAnnotate && npm i --no-save jimp@0.16.13)
npm run test:ai               # 5 个用例：无模型 / 模型复核 / 回复异常兜底 / 线路分析 / 未开通
VISION_API_KEY=... VISION_API_URL=... VISION_MODEL=... npm run test:ai -- --real   # 真模型跑 TA山 并对比真值
```

加样张：在 `fixtures/index.js` 里追加 `{ name, image, routes: [{ label, color, holds: [{x,y}] }] }`，坐标为照片宽高百分比。真值最好来自真机上的人工圈注（可从云数据库 `walls` 集合导出）。样张越多，参数越不容易偏向某一面墙。
