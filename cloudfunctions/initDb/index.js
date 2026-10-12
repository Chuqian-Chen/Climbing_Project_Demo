// 云函数：initDb — 建集合 + 灌入演示数据（幂等：已有数据的集合默认跳过）
// 数据源：mock-data.js / gym-directory.js（从 miniprogram/utils 同步复制，改动后需重新复制+部署）
// 调用：小程序端「我的 → 设置 → 初始化云数据库」；传 { force: true } 可清空重灌
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const mock = require('./mock-data.js');
const dir = require('./gym-directory.js');
const real = require('./real-content.js');

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
    return 'created';
  } catch (e) {
    return 'exists';
  }
}

async function seed(name, docs, force) {
  await ensureCollection(name);
  const cnt = await db.collection(name).count();
  if (cnt.total > 0) {
    if (!force) return { skipped: true, existing: cnt.total };
    // force 重灌 = 只刷新种子文档本身（按已知 _id 精确删再插）。
    // 严禁清空整表：真实用户内容（如用户建的线路/打卡）必须保留。
    // 教训：2026-07-29 v6.1 用旧版清表逻辑重灌，误删了 TA山 4 条真实线路。
    await removeIds(name, docs.map((d) => d._id));
  }
  let inserted = 0;
  for (const part of chunk(docs, 50)) {
    const res = await db.collection(name).add({ data: part });
    inserted += (res._ids && res._ids.length) || part.length;
  }
  return { inserted: inserted };
}

// 真实内容种子：缺失则补回，已存在完全不动（不覆盖后续编辑）
async function ensureDocs(name, docs) {
  await ensureCollection(name);
  let restored = 0;
  for (const d of docs) {
    const got = await db.collection(name).doc(d._id).get().catch(() => null);
    if (got && got.data) continue;
    const body = Object.assign({}, d, { mtime: Date.now() });
    delete body._id;
    await db.collection(name).doc(d._id).set({ data: body });
    restored++;
  }
  return restored;
}

// 按已知 id 精确删除（生产模式清演示数据用：不碰真实用户文档）
async function removeIds(name, ids) {
  await ensureCollection(name);
  let removed = 0;
  for (const part of chunk(ids, 100)) {
    const r = await db.collection(name).where({ _id: _.in(part) }).remove();
    removed += (r.stats && r.stats.removed) || 0;
  }
  return removed;
}

// upsert 名录馆（保留真实用户建的内容，馆信息以最新名录为准）
async function upsertDocs(name, docs) {
  await ensureCollection(name);
  let n = 0;
  for (const d of docs) {
    await db.collection(name).doc(d._id).set({ data: (() => {
      const c = Object.assign({}, d); delete c._id; return c;
    })() });
    n++;
  }
  return n;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const allow = String(process.env.ADMIN_OPENIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length && OPENID && allow.indexOf(OPENID) < 0) {
    return { ok: false, error: 'forbidden' };
  }

  const force = !!(event && event.force);
  const mode = (event && event.mode) || 'demo';
  // mtime：客户端增量同步（fetchAll since）依赖
  const withId = (x) => Object.assign({ _id: x.id, mtime: Date.now() }, x);

  // 岩馆 = 演示馆（含墙面/线路）+ 名录馆（北京/上海索引图）
  const gyms = mock.GYMS
    .map((g) => Object.assign({}, g, { city: 'bj', isDemo: true }))
    .concat(dir.DIRECTORY.map((d) => Object.assign({}, d, { isDirectory: true })))
    .map(withId);

  // 评论表：betaId -> 数组 摊平为文档
  const comments = [];
  Object.keys(mock.COMMENTS).forEach((bid) => {
    mock.COMMENTS[bid].forEach((c) => comments.push(Object.assign({ betaId: bid }, c)));
  });

  // ---- 生产模式：清除演示数据、upsert 真实名录，保留一切真实用户内容 ----
  // walls / profiles / likes / favs / follows / routephotos 完全不动；
  // users/routes/betas/checkins/comments 只删「已知演示 id」的文档。
  if (mode === 'prod') {
    const result = { mode: 'prod' };
    result.demoGyms = await removeIds('gyms', mock.GYMS.map((g) => g.id));
    result.demoUsers = await removeIds('users', mock.USERS.map((u) => u.id));
    result.demoRoutes = await removeIds('routes', mock.ROUTES.map((r) => r.id));
    result.demoBetas = await removeIds('betas', mock.BETAS.map((b) => b.id));
    result.demoCheckins = await removeIds('checkins', mock.CHECKINS.map((k) => k.id));
    result.demoComments = await removeIds('comments', comments.map((c) => c.id));
    result.directoryGyms = await upsertDocs('gyms',
      dir.DIRECTORY.map((d) => Object.assign({ _id: d.id }, d, { isDirectory: true, mtime: Date.now() })));
    result.realRoutes = await ensureDocs('routes', real.ROUTES);
    result.realWalls = await ensureDocs('walls', real.WALLS);
    return result;
  }

  const result = {};
  result.users = await seed('users', mock.USERS.map(withId), force);
  result.gyms = await seed('gyms', gyms, force);
  result.routes = await seed('routes', mock.ROUTES.map(withId), force);
  result.betas = await seed('betas', mock.BETAS.map(withId), force);
  result.checkins = await seed('checkins', mock.CHECKINS.map(withId), force);
  result.comments = await seed('comments', comments.map(withId), force);

  // 用户内容集合先建空表（档案/点赞/收藏/关注）
  const empties = ['profiles', 'likes', 'favs', 'follows', 'walls', 'routephotos'];
  for (const name of empties) {
    result[name] = { ensured: await ensureCollection(name) };
  }

  // 真实内容（TA山线路/墙面）：任何模式下缺失都补回
  result.realRoutes = await ensureDocs('routes', real.ROUTES);
  result.realWalls = await ensureDocs('walls', real.WALLS);
  return result;
};
