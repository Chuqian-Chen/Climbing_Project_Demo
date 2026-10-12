// 云函数：notify — 订阅消息推送（每周攀爬小结）
// 触发：config.json 定时触发器（每周一 09:00）；也可手动调用 { dryRun: true } 试跑
// 前置：mp 后台申请订阅消息模板，把模板 ID 填到 TMPL_WEEKLY，
//       并保持与 miniprogram/utils/flags.js SUBSCRIBE_TMPLS.weekly 一致。
// 模板字段假设：{{thing1.DATA}} 内容摘要 / {{number2.DATA}} 次数 —— 按实际申请到的模板改 data 字段。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TMPL_WEEKLY = ''; // ← 模板 ID 填这里

exports.main = async (event) => {
  if (!TMPL_WEEKLY) return { ok: false, skipped: 'TMPL_WEEKLY 未配置' };

  // 近 7 天有打卡的用户 → 按 openid 聚合次数
  const weekAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
  const byUser = {};
  try {
    const cnt = await db.collection('checkins').where({ date: db.command.gte(weekAgo) }).count();
    for (let i = 0; i < cnt.total; i += 100) {
      const r = await db.collection('checkins')
        .where({ date: db.command.gte(weekAgo) }).skip(i).limit(100).get();
      r.data.forEach((k) => {
        if (!k.userId || k.userId === 'me') return;
        byUser[k.userId] = (byUser[k.userId] || 0) + 1;
      });
    }
  } catch (e) {
    return { ok: false, error: String(e.errMsg || e) };
  }

  const results = { sent: 0, failed: 0 };
  for (const openid of Object.keys(byUser)) {
    if (event && event.dryRun) continue;
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: openid,
        templateId: TMPL_WEEKLY,
        page: 'pages/logbook/logbook',
        data: {
          thing1: { value: '本周你打卡了 ' + byUser[openid] + ' 次，继续保持！' },
          number2: { value: byUser[openid] }
        }
      });
      results.sent++;
    } catch (e) {
      // 43101 = 用户未订阅/次数用完，正常现象
      results.failed++;
    }
  }
  return { ok: true, users: Object.keys(byUser).length, results: results };
};
