// 云函数：fetchAll — 管理员权限全量/增量读取（绕开集合默认权限，客户端零配置）
// event.since（毫秒时间戳）传入时：只返回 mtime >= since 的文档（增量），
// 没有 mtime 字段的旧文档只会出现在全量拉取里 —— 客户端首次全量后才用增量。
// 注意：增量看不到"删除"；客户端缓存超过 24h 或用户下拉刷新时走全量兜底。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const since = (event && Number(event.since)) || 0;
  const names = ['gyms', 'routes', 'betas', 'users', 'checkins', 'comments', 'walls', 'routephotos', 'routereports'];
  const db = cloud.database();
  const _ = db.command;
  const out = { now: Date.now(), incremental: since > 0 };
  for (const n of names) {
    const arr = [];
    try {
      const base = since > 0
        ? db.collection(n).where({ mtime: _.gte(since) })
        : db.collection(n);
      const cnt = await base.count();
      for (let i = 0; i < cnt.total; i += 100) {
        const r = await base.skip(i).limit(100).get();
        arr.push.apply(arr, r.data);
      }
    } catch (e) { /* 集合不存在则返回空 */ }
    out[n] = arr;
  }
  return out;
};
