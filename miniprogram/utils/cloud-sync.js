// 云端同步：登录取 openid + 分页拉取云数据库快照 → 注入 data-source
// 任一环节失败（未开通/未设权限/断网）自动回退本地演示数据，不影响使用
const dataSource = require('./data-source');
const store = require('./store');

let initPromise = null;

// 与 api.js 中 TYPE_GRADIENTS 保持一致（名录馆在云端存的是原始字段，读回时补展示字段）
const TYPE_GRADIENTS = {
  '综合': 'linear-gradient(135deg, #2b2f3a, #4a5164)',
  '抱石': 'linear-gradient(135deg, #1f4a38, #2f7a58)',
  '难度': 'linear-gradient(135deg, #4a2b30, #8a4a3a)',
  '': 'linear-gradient(135deg, #33384a, #5a6280)'
};

function normalizeGym(g) {
  if (!g.isDirectory) return g;
  return Object.assign({}, g, {
    area: g.area || g.near || '',
    address: g.address || '',
    gradient: g.gradient || TYPE_GRADIENTS[g.type || ''] || TYPE_GRADIENTS[''],
    tags: g.tags || (g.type ? [g.type + '馆'] : []),
    openHours: g.openHours || '',
    announcement: g.announcement || '',
    walls: g.walls || []
  });
}

// 分页取整个集合（客户端单次上限 100 条）
function getAll(db, name) {
  const coll = db.collection(name);
  return coll.count().then((c) => {
    const tasks = [];
    for (let i = 0; i < c.total; i += 100) {
      tasks.push(coll.skip(i).limit(100).get().then((r) => r.data));
    }
    return Promise.all(tasks).then((parts) => [].concat.apply([], parts));
  });
}

function alive(arr) {
  return (arr || []).filter((d) => d && !d.deleted);
}

function myOpenid() {
  try {
    return wx.getStorageSync('yy_openid') || '';
  } catch (e) {
    return '';
  }
}

function isMineDoc(d, oid) {
  return d && (d.userId === oid || d.userId === 'me');
}

// 把「我的」打卡 / 点赞 / 收藏从云端快照合并进本地 store，换机也能续上
function mergePersonal(res) {
  const oid = myOpenid();
  store.update((st) => {
    const have = {};
    (st.checkins || []).forEach((k) => { have[k.id] = true; });
    alive(res.checkins).forEach((k) => {
      if (!isMineDoc(k, oid) || have[k.id]) return;
      st.checkins.push({
        id: k.id,
        routeId: k.routeId || '',
        gymId: k.gymId || '',
        result: k.result,
        attempts: k.attempts || 1,
        note: k.note || '',
        date: k.date
      });
    });
    const gone = {};
    (res.checkins || []).forEach((k) => {
      if (k && k.deleted) gone[k.id] = true;
    });
    st.checkins = (st.checkins || []).filter((k) => !gone[k.id]);

    (res.likes || []).forEach((l) => {
      if (!isMineDoc(l, oid) || !l.betaId) return;
      if (l.deleted || l.on === false) delete st.likes[l.betaId];
      else st.likes[l.betaId] = true;
    });
    (res.favs || []).forEach((f) => {
      if (!isMineDoc(f, oid) || !f.routeId) return;
      if (f.deleted || f.on === false) delete st.favs[f.routeId];
      else st.favs[f.routeId] = true;
    });
  });
}

// 快照落地（含理智检查：核心集合为空绝不覆盖本地）
function applySnapshot(res) {
  const gyms = alive(res && res.gyms);
  const routes = alive(res && res.routes);
  const betas = alive(res && res.betas);
  if (!res || !gyms.length || !routes.length || !betas.length) {
    console.warn('[cloud-sync] 云端核心集合为空（gyms/routes/betas），继续使用本地数据');
    return false;
  }
  const commentMap = {};
  alive(res.comments).forEach((c) => {
    if (!commentMap[c.betaId]) commentMap[c.betaId] = [];
    commentMap[c.betaId].push(c);
  });
  dataSource.setCloudData({
    GYMS: gyms.map(normalizeGym),
    ROUTES: routes,
    BETAS: betas,
    USERS: alive(res.users),
    CHECKINS: alive(res.checkins),
    COMMENTS: commentMap,
    WALLS: alive(res.walls),
    ROUTEPHOTOS: alive(res.routephotos),
    ROUTEREPORTS: alive(res.routereports)
  });
  try { mergePersonal(res); } catch (e) { /* 个人合并失败不阻断公共快照 */ }
  console.log('[cloud-sync] ok: gyms=' + gyms.length + ' routes=' + routes.length +
    ' betas=' + betas.length + ' checkins=' + alive(res.checkins).length +
    ' walls=' + alive(res.walls).length);
  return true;
}

/* ---------- 增量同步缓存 ----------
 * 首次全量拉取后缓存快照；之后启动只拉 mtime >= since 的增量。
 * 软删文档（deleted:true）在增量里带回，mergeInc 从快照去掉。 */
const SNAP_KEY = 'yy_snap_cache_v1';
const SNAP_TTL = 24 * 60 * 60 * 1000;
const COLLS = ['gyms', 'routes', 'betas', 'users', 'checkins', 'comments', 'walls', 'routephotos', 'routereports', 'likes', 'favs'];

function readSnapCache() {
  try {
    const c = wx.getStorageSync(SNAP_KEY);
    if (c && c.ts && c.data) return c;
  } catch (e) { /* ignore */ }
  return null;
}

function writeSnapCache(ts, data) {
  try {
    wx.setStorageSync(SNAP_KEY, { ts: ts, data: data });
  } catch (e) { /* 超过单 key 1MB 等：放弃缓存，退化为每次全量 */ }
}

function docKey(d) {
  return (d && (d._id || d.id)) || '';
}

// 增量文档并入缓存快照（按 _id/id 覆盖；deleted 从快照移除）
function mergeInc(cached, inc) {
  const out = {};
  COLLS.forEach((n) => {
    const byId = {};
    const base = [];
    (cached[n] || []).forEach((d) => {
      if (!d || d.deleted) return;
      const key = docKey(d);
      if (!key) return;
      byId[key] = base.length;
      base.push(d);
    });
    (inc[n] || []).forEach((d) => {
      const key = docKey(d);
      if (!key) return;
      if (d.deleted) {
        if (byId[key] != null) base[byId[key]] = null;
        return;
      }
      if (byId[key] != null) base[byId[key]] = d;
      else {
        byId[key] = base.length;
        base.push(d);
      }
    });
    out[n] = base.filter(Boolean);
  });
  return out;
}

function syncAll(fullOnly) {
  if (!wx.cloud) return Promise.resolve(false);
  const cache = fullOnly ? null : readSnapCache();
  const useInc = cache && (Date.now() - cache.ts < SNAP_TTL);
  // 60s 时钟余量，避免边界漏单
  const payload = useInc ? { since: cache.ts - 60 * 1000 } : {};
  // 首选：fetchAll 云函数（管理员权限读取，无需配置集合权限）
  return wx.cloud.callFunction({ name: 'fetchAll', data: payload })
    .then((r) => {
      let res = r && r.result;
      if (!res) return false;
      const now = res.now || Date.now();
      if (useInc) res = mergeInc(cache.data, res);
      const ok = applySnapshot(res);
      if (ok) {
        const toCache = {};
        COLLS.forEach((n) => { toCache[n] = alive(res[n] || []); });
        writeSnapCache(now, toCache);
      }
      return ok;
    })
    .catch(() => {
      // 兜底：客户端直读（需要集合权限为「所有用户可读」）
      const db = wx.cloud.database();
      const names = ['gyms', 'routes', 'betas', 'users', 'checkins', 'comments', 'walls', 'routephotos'];
      return Promise.all(names.map((n) => getAll(db, n)))
        .then((res) => applySnapshot({
          gyms: res[0], routes: res[1], betas: res[2], users: res[3],
          checkins: res[4], comments: res[5], walls: res[6], routephotos: res[7]
        }))
        .catch((e) => {
          console.warn('[cloud-sync] 回退本地演示数据：', (e && e.errMsg) || e);
          return false;
        });
    });
}

// 幂等初始化：登录（取 openid）→ 全量同步；供各 Tab 页 onLoad 调用
function ensureInit() {
  if (initPromise) return initPromise;
  if (typeof wx === 'undefined' || !wx.cloud) return Promise.resolve(false);
  initPromise = wx.cloud.callFunction({ name: 'login' })
    .then((r) => {
      const res = (r && r.result) || {};
      if (res.openid) wx.setStorageSync('yy_openid', res.openid);
    })
    .catch(() => { /* 登录失败不阻断同步 */ })
    .then(() => syncAll())
    .catch((e) => {
      initPromise = null; // 网络失败允许下次重试
      console.warn('[cloud-sync] init failed', e);
      return false;
    });
  return initPromise;
}

// 手动刷新（下拉刷新用）：走全量，能看到删除/重灌
function refresh() {
  return syncAll(true);
}

module.exports = { ensureInit, refresh };
