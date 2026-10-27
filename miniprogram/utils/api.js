// API 服务层：页面唯一数据入口
// 演示模式 = mock 数据 + 本地 storage 增量；全部返回 Promise，
// 未来接入云开发时仅需把各函数内部替换为 wx.cloud.callFunction / 云数据库查询。
// mock 实为数据源切换层：云同步成功后自动读云端快照，否则读演示数据
const mock = require('./data-source');
const store = require('./store');
// 注意：不能叫 util.js —— 模板的 util.ts 编译后会在真机包里同名覆盖（已踩坑）
const util = require('./helpers');
const gradeUtil = require('./grade');
const dir = require('./gym-directory');
const track = require('./track');

const RESULT_META = {
  flash: { text: '闪送' },
  top: { text: '完攀' },
  attempt: { text: '磕线中' }
};

/* ================= 内部工具 ================= */

function myOpenid() {
  try {
    return wx.getStorageSync('yy_openid') || '';
  } catch (e) {
    return '';
  }
}

// 把文档写入云数据库（未开通云/失败时静默跳过，本地体验不受影响）
// mtime：增量同步（fetchAll since）依赖的修改时间戳
function cloudAdd(coll, doc) {
  if (typeof wx === 'undefined' || !wx.cloud) return;
  try {
    wx.cloud.database().collection(coll)
      .add({ data: Object.assign({ mtime: Date.now() }, doc) })
      .catch(() => {});
  } catch (e) { /* ignore */ }
}

// 内容安全检测（云函数 secCheck）：所有 UGC 写入前调用。
// 明确违规 → reject（err.secBlocked=true，页面据此提示）；
// 未开通云 / 检测服务不可用 → 放行，不阻断正常使用。
function secCheck(texts, imageFileIDs, scene) {
  if (typeof wx === 'undefined' || !wx.cloud) return Promise.resolve(true);
  const ts = (texts || []).filter((t) => t && String(t).trim());
  const fids = (imageFileIDs || []).filter((f) => f && String(f).indexOf('cloud://') === 0);
  if (!ts.length && !fids.length) return Promise.resolve(true);
  let call;
  try {
    call = wx.cloud.callFunction({
      name: 'secCheck',
      data: { texts: ts, imageFileIDs: fids, scene: scene || 2 }
    });
  } catch (e) {
    return Promise.resolve(true);
  }
  return call.then((r) => {
    const res = (r && r.result) || {};
    if (res.ok === false) {
      const err = new Error(res.reason === 'image'
        ? '图片未通过内容安全检测，请更换后重试'
        : '文字内容未通过安全检测，请修改后重试');
      err.secBlocked = true;
      throw err;
    }
    return true;
  }).catch((e) => {
    if (e && e.secBlocked) throw e;
    return true; // 云函数缺失/网络失败：放行
  });
}

// 云端文档的作者快照（其他用户看到我发的内容时用）
function mySnap(state) {
  const p = (state || store.get()).profile;
  return {
    nickname: p.nickname || '岩友',
    emoji: p.emoji || '🧗',
    color: '#fff1ea',
    avatarUrl: p.avatarUrl || '',
    height: p.height || 0,
    armSpan: p.armSpan || 0,
    isSetter: !!p.isSetter
  };
}

function findUser(userId, state) {
  if (userId === 'me' || (userId && userId === myOpenid())) {
    const p = (state || store.get()).profile;
    return {
      id: 'me',
      nickname: p.nickname || '我',
      emoji: p.emoji || '🧗',
      color: '#fff1ea',
      avatarUrl: p.avatarUrl || '',
      height: p.height || 0,
      armSpan: p.armSpan || 0,
      maxGrade: '',
      intro: p.intro || '',
      isSetter: !!p.isSetter
    };
  }
  return mock.USERS.find((u) => u.id === userId) || {
    id: userId, nickname: '岩友', emoji: '🧗', color: '#f0f2f5', height: 0, generic: true
  };
}

function wallRetireKey(gymId, wallId) {
  return String(gymId || '') + '_' + String(wallId || '');
}

function isWallRetired(gymId, wallId, state) {
  return !!((state || store.get()).retiredWalls || {})[wallRetireKey(gymId, wallId)];
}

function overlayRoute(route, state) {
  if (!route) return null;
  if (route.status === 'active' && isWallRetired(route.gymId, route.wallId, state)) {
    return Object.assign({}, route, { status: 'removed', removeDate: util.today() });
  }
  return route;
}

function allRoutes(state) {
  const s = state || store.get();
  return dedupConcat(s.myRoutes, mock.ROUTES).map((r) => overlayRoute(r, s));
}

function gymActiveRoutes(gymId, state) {
  return allRoutes(state).filter((r) => r.gymId === gymId && r.status === 'active');
}

function findRoute(routeId, state) {
  return allRoutes(state).find((r) => r.id === routeId) || null;
}

/* ---------- 岩馆合并源：演示岩馆（含线路） + 名录岩馆 ---------- */
const TYPE_GRADIENTS = {
  '综合': 'linear-gradient(135deg, #2b2f3a, #4a5164)',
  '抱石': 'linear-gradient(135deg, #1f4a38, #2f7a58)',
  '难度': 'linear-gradient(135deg, #4a2b30, #8a4a3a)',
  '': 'linear-gradient(135deg, #33384a, #5a6280)'
};

// 扁平风格的类型色（列表卡左色条用；渐变已弃用但字段保留兼容）
const TYPE_COLORS = {
  '综合': '#4a5164',
  '抱石': '#2f7a58',
  '难度': '#8a4a3a',
  '': '#8a90a3'
};

function normalizeDirGym(d) {
  return {
    id: d.id,
    city: d.city,
    district: d.district || '',
    isDirectory: true,
    name: d.name,
    area: d.near || '',
    lat: d.lat,
    lng: d.lng,
    gradient: TYPE_GRADIENTS[d.type || ''] || TYPE_GRADIENTS[''],
    tags: d.type ? [d.type + '馆'] : [],
    openHours: '',
    announcement: '',
    walls: [],
    gradeSystem: d.gradeSystem || null,
    gradeBy: d.gradeBy || 'hold',
    gradeNote: d.gradeNote || '',
    price: d.price || '',
    comingSoon: !!d.comingSoon,
    unlisted: !!d.unlisted
  };
}

function allGymsList() {
  // 云同步后快照已含全部岩馆
  if (mock.ALLGYMS) return mock.ALLGYMS;
  // 本地模式：演示岩馆（city 统一为 key）+ 名录岩馆
  const demo = mock.GYMS.map((g) => Object.assign({}, g, { city: 'bj', isDemo: true }));
  return demo.concat(dir.DIRECTORY.map(normalizeDirGym));
}

function findGym(gymId) {
  const g = allGymsList().find((x) => x.id === gymId) || null;
  if (!g) return null;
  // 众包分级标准的本地覆盖层（云端广播前先立即生效）
  const m = (store.get().gymMeta || {})[gymId];
  return m ? Object.assign({}, g, m) : g;
}

// 根据定位判断所在城市（150km 内），否则返回 ''
function nearestCityKey(loc) {
  if (!loc || !loc.latitude) return '';
  let best = '';
  let bestD = Infinity;
  dir.CITIES.forEach((c) => {
    const d = util.distanceKm(loc.latitude, loc.longitude, c.lat, c.lng);
    if (d < bestD) { bestD = d; best = c.key; }
  });
  return bestD <= 150 ? best : '';
}

function getCities() {
  return dir.CITIES;
}

// 本地副本与云端快照按 id 去重（我发的内容在云同步后以云端为准）
function dedupConcat(localArr, cloudArr) {
  const has = {};
  cloudArr.forEach((x) => { has[x.id] = true; });
  return (localArr || []).filter((x) => !has[x.id]).concat(cloudArr);
}

function allBetas(state) {
  return dedupConcat(state.myBetas, mock.BETAS);
}

function allCheckins(state) {
  return dedupConcat(state.checkins, mock.CHECKINS);
}

function isMineId(userId) {
  return userId === 'me' || (!!userId && userId === myOpenid());
}

// 线路显示名：真实抱石线没有名字，身份 = 馆+墙+岩点颜色+难度（如「磐石 大仰角 红点 V4」）。
// name 字段保留为可选备注（旧数据兼容）。派生短名只含颜色（「红点」）——
// 列表/卡片场景旁边都有难度徽章，名字再带 V几 会重复；无徽章场景自行拼 grade。
function routeShortName(route, color) {
  const custom = (route.name || '').trim();
  if (custom) return custom;
  return (color.name || '?') + '点';
}

function decorateRoute(route, state) {
  if (!route) return null;
  const s = state || store.get();
  const gym = findGym(route.gymId) || {};
  const wall = (gym.walls || []).find((w) => w.id === route.wallId) || {};
  const color = gradeUtil.HOLD_COLORS[route.color] || { name: '?', hex: '#ccc', light: false };
  const setter = findUser(route.setterId, s);
  const daysLeft = util.daysUntil(route.removeDate);
  const myFeel = (s.feels || {})[route.id] || '';
  const feel = Object.assign({ soft: 0, fair: 0, hard: 0 }, route.feel);
  if (myFeel && feel[myFeel] != null) feel[myFeel] += 1;
  const feelTotal = feel.soft + feel.fair + feel.hard;
  const mySends = (s.checkins || []).filter(
    (k) => k.routeId === route.id && k.result !== 'attempt'
  ).length;
  const routeBetas = allBetas(s).filter((b) => b.routeId === route.id);

  // 换线报告（众包）：云端他人报告 + 我的本地报告去重
  const myReported = !!(s.routeReports || {})[route.id];
  let reportCount = mock.ROUTEREPORTS.filter((rp) => rp.routeId === route.id).length;
  if (myReported && !mock.ROUTEREPORTS.some(
    (rp) => rp.routeId === route.id && rp.userId === (myOpenid() || 'me'))) {
    reportCount += 1;
  }

  // 线路照片：手动上传 > 云端共享 > Beta 首图
  let photo = '';
  const localP = (s.routePhotos || {})[route.id];
  if (localP) photo = localP.fileID || localP.path || '';
  if (!photo) {
    const cloudP = mock.ROUTEPHOTOS.filter((p) => p.routeId === route.id).pop();
    if (cloudP) photo = cloudP.fileID || '';
  }
  if (!photo) {
    const withImg = routeBetas.find((b) => b.imageFileIDs && b.imageFileIDs.length);
    if (withImg) photo = withImg.imageFileIDs[0];
  }

  // 认线缩略图：线路照片，或墙面图+点位
  let visual = photo ? { src: photo, wall: false, x: 0, y: 0 } : null;
  if (!visual) {
    const ref = findRouteWall(route);
    if (ref && ref.photo) visual = { src: ref.photo, wall: true, x: ref.x, y: ref.y };
  }

  const shortName = routeShortName(route, color);
  return Object.assign({}, route, {
    photo: photo,
    visual: visual,
    name: shortName,
    fullName: (gym.name ? gym.name + ' · ' : '') + (wall.name ? wall.name + ' · ' : '') +
      shortName + ' ' + (route.grade || ''),
    gymName: gym.name || '',
    wallName: wall.name || '',
    wallAngle: wall.angle || '',
    colorName: color.name,
    colorHex: color.hex,
    colorLight: !!color.light,
    gradeColor: gradeUtil.gradeColor(route.grade),
    setterName: setter.nickname,
    daysLeft: daysLeft,
    isNew: util.daysSince(route.setDate) <= 7,
    removingSoon: daysLeft >= 0 && daysLeft <= 7,
    sendsTotal: (route.sends || 0) + mySends,
    betaCount: routeBetas.length,
    faved: !!(s.favs || {})[route.id],
    myFeel: myFeel,
    feelTotal: feelTotal,
    softPct: feelTotal ? Math.round((feel.soft / feelTotal) * 100) : 0,
    fairPct: feelTotal ? Math.round((feel.fair / feelTotal) * 100) : 0,
    hardPct: feelTotal ? Math.round((feel.hard / feelTotal) * 100) : 0,
    myReported: myReported,
    reportCount: reportCount,
    possiblyRemoved: reportCount >= 2, // ≥2 人报告 → 「可能已换线」标记
    isMine: isMineId(route.setterId) // 线主可修改难度/名称
  });
}

// 线路认线图：线路照片，或墙面照片+点位（Beta 卡片缩略图用）
function routeVisualOf(route, state) {
  if (!route) return null;
  const s = state || store.get();
  const localP = (s.routePhotos || {})[route.id];
  let photo = localP ? (localP.fileID || localP.path || '') : '';
  if (!photo) {
    const cloudP = mock.ROUTEPHOTOS.filter((p) => p.routeId === route.id).pop();
    if (cloudP) photo = cloudP.fileID || '';
  }
  if (!photo) {
    const withImg = allBetas(s).find(
      (b) => b.routeId === route.id && b.imageFileIDs && b.imageFileIDs.length
    );
    if (withImg) photo = withImg.imageFileIDs[0];
  }
  if (photo) return { src: photo, wall: false, x: 0, y: 0 };
  const ref = findRouteWall(route);
  if (ref && ref.photo) return { src: ref.photo, wall: true, x: ref.x, y: ref.y };
  return null;
}

function decorateBeta(beta, state) {
  if (!beta) return null;
  const s = state || store.get();
  let author = findUser(beta.userId, s);
  // 云端真实用户：用文档里的作者快照
  if (author.generic && beta.authorSnap) {
    author = Object.assign({ id: beta.userId }, beta.authorSnap);
  }
  const route = findRoute(beta.routeId);
  const gym = route ? findGym(route.gymId) : null;
  const color = route ? (gradeUtil.HOLD_COLORS[route.color] || {}) : {};
  const liked = !!(s.likes || {})[beta.id];
  // 云同步后我的评论会同时存在于本地与云端，按 id 去重
  const allComments = dedupConcat(
    (s.comments || {})[beta.id] || [],
    mock.COMMENTS[beta.id] || []
  );
  const heightFit = beta.heightFit || [];

  return Object.assign({}, beta, {
    author: author,
    isMine: isMineId(beta.userId),
    routeName: route ? routeShortName(route, color) : '未知线路',
    routeGrade: route ? route.grade : '',
    routeGradeColor: route ? gradeUtil.gradeColor(route.grade) : '#999',
    routeColorHex: color.hex || '#ccc',
    routeColorLight: !!color.light,
    gymId: route ? route.gymId : '',
    gymName: gym ? gym.name : '',
    liked: liked,
    likeCount: (beta.likes || 0) + (liked ? 1 : 0),
    commentCount: allComments.length,
    timeText: util.relativeDate(beta.createdAt),
    heightText: heightFit.length === 2 ? heightFit[0] + '-' + heightFit[1] + 'cm' : '',
    heightMatch: matchHeight(heightFit, s),
    routeVisual: routeVisualOf(route, s)
  });
}

// 身高匹配：我的身高落在 beta 适配区间（±3cm 容差）
function matchHeight(heightFit, state) {
  const h = ((state || store.get()).profile || {}).height || 0;
  if (!h || !heightFit || heightFit.length !== 2) return false;
  return h >= heightFit[0] - 3 && h <= heightFit[1] + 3;
}

function decorateCheckin(k, state) {
  const s = state || store.get();
  const meta = RESULT_META[k.result] || RESULT_META.attempt;
  const route = decorateRoute(findRoute(k.routeId), s);
  let user = findUser(k.userId, s);
  if (user.generic && k.userSnap) {
    user = Object.assign({ id: k.userId }, k.userSnap);
  }
  return Object.assign({}, k, {
    user: user,
    isMine: isMineId(k.userId),
    resultText: meta.text,
    dateText: util.relativeDate(k.date),
    route: route ? {
      id: route.id, name: route.name, grade: route.grade,
      gradeColor: route.gradeColor, colorHex: route.colorHex,
      colorLight: route.colorLight, gymName: route.gymName, wallName: route.wallName
    } : null
  });
}

function sortByLikes(a, b) {
  return (b.likes || 0) - (a.likes || 0);
}

/* ================= 页面接口 ================= */

// 首页聚合（loc 可选：有定位时「附近岩馆」按距离排真实岩馆，否则演示馆兜底）
function getHome(loc) {
  const s = store.get();
  const todayStr = util.today();
  const todayCount = (s.checkins || []).filter((k) => k.date === todayStr).length;
  const attemptKs = (s.checkins || []).filter((k) => k.result === 'attempt');
  const lastAttempt = attemptKs.length ? attemptKs[attemptKs.length - 1] : null;
  // 首页 Beta 流：按热度取 30 条（支持按难度筛选后仍有内容）
  const hotBetas = allBetas(s).slice().sort(sortByLikes).slice(0, 30)
    .map((b) => decorateBeta(b, s));
  const newRoutes = allRoutes(s)
    .filter((r) => util.daysSince(r.setDate) <= 7 && r.status === 'active')
    .sort((a, b) => (a.setDate < b.setDate ? 1 : -1))
    .slice(0, 6)
    .map((r) => decorateRoute(r, s));
  const counts = { bj: 0, sh: 0 };
  allGymsList().forEach((g) => {
    if (counts[g.city] != null) counts[g.city] += 1;
  });
  // 附近岩馆：有定位时与岩馆页同逻辑（同城过滤 + 距离排序）取前 3
  let nearGyms;
  if (loc && loc.latitude) {
    const cityKey = nearestCityKey(loc);
    let list = allGymsList();
    if (cityKey) list = list.filter((g) => g.city === cityKey);
    nearGyms = list.map((g) => decorateGym(g, s, loc))
      .sort((a, b) =>
        (a.distance == null ? 1e9 : a.distance) - (b.distance == null ? 1e9 : b.distance))
      .slice(0, 3);
  } else {
    nearGyms = mock.GYMS.map((g) => decorateGym(g, s, null));
    // 生产模式无演示馆：退回全量名录前 3（有内容的馆置顶逻辑与岩馆页一致）
    if (!nearGyms.length) {
      nearGyms = allGymsList().slice(0, 3).map((g) => decorateGym(g, s, null));
    }
  }
  // 到馆场景：人在某馆 2km 内时，该馆的 Beta 置顶（打「本馆」标），其余按热度
  let feedBetas = hotBetas;
  const nearest = nearGyms[0];
  const atGym = nearest && nearest.distance != null && nearest.distance <= 2
    ? buildAtGym(nearest, s) : null;
  if (atGym) {
    const local = [];
    const rest = [];
    hotBetas.forEach((b) => {
      if (b.gymId === nearest.id) local.push(Object.assign({}, b, { isLocalGym: true }));
      else rest.push(b);
    });
    feedBetas = local.concat(rest);
  }
  return Promise.resolve({
    profile: s.profile,
    onboarded: !!s.onboarded,
    todayCount: todayCount,
    projectRoute: lastAttempt ? decorateRoute(findRoute(lastAttempt.routeId), s) : null,
    hotBetas: feedBetas,
    newRoutes: newRoutes,
    gyms: nearGyms,
    gymCounts: counts,
    atGym: atGym
  });
}

// 到馆卡：本馆我在磕的线 / 新线 / 即将拆线 / 墙面照入口
function buildAtGym(gym, s) {
  const routes = gymActiveRoutes(gym.id, s).map((r) => decorateRoute(r, s));
  const sent = {};
  (s.checkins || []).forEach((k) => { if (k.result !== 'attempt') sent[k.routeId] = true; });
  const projectIds = [];
  (s.checkins || []).slice().reverse().forEach((k) => {
    if (k.result === 'attempt' && !sent[k.routeId] && projectIds.indexOf(k.routeId) < 0) projectIds.push(k.routeId);
  });
  const chip = (r) => ({
    id: r.id, name: r.name, grade: r.grade, gradeColor: r.gradeColor,
    colorHex: r.colorHex, colorLight: r.colorLight, wallName: r.wallName,
    daysLeft: r.daysLeft, betaCount: r.betaCount, visual: r.visual
  });
  const walls = gymWalls(gym).map((w) => {
    const doc = getWallDoc(gym.id, w.id, s);
    return { id: w.id, name: w.name, photo: doc ? (doc.photoFileID || doc.photoPath || '') : '', markerCount: doc ? (doc.markers || []).length : 0 };
  });
  return {
    id: gym.id,
    name: gym.name,
    distanceText: gym.distanceText,
    routeCount: routes.length,
    projects: projectIds.map((id) => routes.find((r) => r.id === id)).filter(Boolean).slice(0, 4).map(chip),
    newRoutes: routes.filter((r) => r.isNew).sort((a, b) => (a.setDate < b.setDate ? 1 : -1)).slice(0, 6).map(chip),
    removing: routes.filter((r) => r.removingSoon).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 6).map(chip),
    wall: walls.find((w) => w.photo) || walls[0] || null
  };
}

function markOnboarded() {
  store.update((s) => { s.onboarded = true; });
  return Promise.resolve(true);
}

function decorateGym(gym, state, loc) {
  const s = state || store.get();
  // 含本地开荒线路（与云端去重）
  const routes = gymActiveRoutes(gym.id, s);
  const newCount = routes.filter((r) => util.daysSince(r.setDate) <= 7).length;
  const weekCheckins = allCheckins(s).filter((k) => {
    const r = findRoute(k.routeId);
    return r && r.gymId === gym.id && util.daysSince(k.date) <= 7 && util.daysSince(k.date) >= 0;
  }).length;
  let distanceText = '';
  let distance = null;
  // gym.lat 缺失（如新址未公布的馆）时不算距离，排序时自动垫底
  if (loc && loc.latitude && gym.lat) {
    distance = util.distanceKm(loc.latitude, loc.longitude, gym.lat, gym.lng);
    distanceText = util.formatKm(distance);
  }
  return Object.assign({}, gym, {
    routeCount: routes.length,
    newCount: newCount,
    weekCheckins: weekCheckins,
    distance: distance,
    distanceText: distanceText,
    typeColor: TYPE_COLORS[gym.type || ''] || TYPE_COLORS['']
  });
}

function getGyms(loc, cityKey) {
  const s = store.get();
  let list = allGymsList();
  if (cityKey) list = list.filter((g) => g.city === cityKey);
  const decorated = list.map((g) => decorateGym(g, s, loc));
  if (loc) {
    decorated.sort((a, b) =>
      (a.distance == null ? 1e9 : a.distance) - (b.distance == null ? 1e9 : b.distance));
  } else {
    // 无定位时演示岩馆置顶（有线路内容），其余保持名录顺序
    decorated.sort((a, b) => (b.isDemo ? 1 : 0) - (a.isDemo ? 1 : 0));
  }
  return Promise.resolve(decorated);
}

function getGymDetail(gymId, loc) {
  const s = store.get();
  const gym = findGym(gymId);
  if (!gym) return Promise.reject(new Error('gym not found'));
  track.track('view_gym', { gymId: gymId });
  const routes = gymActiveRoutes(gymId, s).map((r) => decorateRoute(r, s));
  // 周打卡榜：近7天完攀数（云端真实用户用打卡快照显示）
  const counter = {};
  allCheckins(s).forEach((k) => {
    const r = findRoute(k.routeId);
    if (!r || r.gymId !== gymId) return;
    if (k.result === 'attempt') return;
    if (util.daysSince(k.date) > 7 || util.daysSince(k.date) < 0) return;
    if (!counter[k.userId]) counter[k.userId] = { sends: 0, snap: k.userSnap || null };
    counter[k.userId].sends += 1;
  });
  const leaderboard = Object.keys(counter)
    .map((uidKey) => {
      let user = findUser(uidKey, s);
      if (user.generic && counter[uidKey].snap) {
        user = Object.assign({ id: uidKey }, counter[uidKey].snap);
      }
      return { user: user, sends: counter[uidKey].sends };
    })
    .sort((a, b) => b.sends - a.sends)
    .slice(0, 5);
  // 馆内分级标准（颜色 → 难度）
  const gradeSystem = (gym.gradeSystem || []).map((gs) => {
    const c = gradeUtil.HOLD_COLORS[gs.color] || {};
    return {
      color: gs.color,
      colorHex: c.hex || '#ccc',
      colorLight: !!c.light,
      grade: gs.grade
    };
  });

  // 墙面照片状态（KAYA 式整墙浏览入口）；有照片的墙带上各线徽章，馆详情顶部大图直接显示
  const walls = gymWalls(gym).map((w) => {
    const doc = getWallDoc(gym.id, w.id, s);
    const photo = doc ? (doc.photoFileID || doc.photoPath || '') : '';
    const markers = photo ? (doc.markers || []).map((m) => {
      const r = findRoute(m.routeId, s);
      if (!r || r.status !== 'active') return null;
      const c = gradeUtil.HOLD_COLORS[r.color] || {};
      return { routeId: r.id, x: m.x, y: m.y, grade: r.grade, colorHex: c.hex || '#ccc', colorLight: !!c.light };
    }).filter(Boolean) : [];
    return Object.assign({}, w, {
      photo: photo,
      markerCount: doc ? (doc.markers || []).length : 0,
      markers: markers
    });
  });
  return Promise.resolve({
    gym: decorateGym(gym, s, loc),
    routes: routes,
    leaderboard: leaderboard,
    walls: walls,
    gradeSystem: gradeSystem,
    gradeBy: gym.gradeBy || 'hold',
    gradeNote: gym.gradeNote || '',
    isSetter: !!((s.profile || {}).isSetter)
  });
}

function getRouteDetail(routeId) {
  const s = store.get();
  const route = findRoute(routeId);
  if (!route) return Promise.reject(new Error('route not found'));
  track.track('view_route', { routeId: routeId });
  // 排序：适合我身高的优先，其次按赞
  const betas = allBetas(s)
    .filter((b) => b.routeId === routeId)
    .map((b) => decorateBeta(b, s))
    .sort((a, b) =>
      (Number(b.heightMatch) - Number(a.heightMatch)) || (b.likeCount - a.likeCount));
  const checkins = allCheckins(s)
    .filter((k) => k.routeId === routeId)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 10)
    .map((k) => decorateCheckin(k, s));
  const todayStr = util.today();
  const wallRef = findRouteWall(route);
  return Promise.resolve({
    route: decorateRoute(route, s),
    betas: betas,
    checkins: checkins,
    reminderOn: !!(s.reminders || {})[routeId],
    wallRef: wallRef,
    analysis: analyzeRouteHolds(wallRef && wallRef.holds),
    analysisMoves: buildMoves(wallRef && wallRef.holds),
    aiBeta: cachedRouteBeta(routeId, wallRef, s),
    aiBetaAvailable: !!(wallRef && isCloudPhoto(wallRef.photo) && (wallRef.holds || []).length >= 2),
    myTodayCount: (s.checkins || []).filter(
      (k) => k.routeId === routeId && k.date === todayStr
    ).length,
    hasHeight: !!(s.profile && s.profile.height)
  });
}

// 某条线的 Beta 预览（岩馆页线路卡展开区用）：按热度前 3 条 + 总数
function getRouteBetas(routeId) {
  const s = store.get();
  const list = allBetas(s).filter((b) => b.routeId === routeId).sort(sortByLikes);
  return Promise.resolve({
    total: list.length,
    betas: list.slice(0, 3).map((b) => decorateBeta(b, s))
  });
}

function getBetaDetail(betaId) {
  const s = store.get();
  const beta = allBetas(s).find((b) => b.id === betaId);
  if (!beta) return Promise.reject(new Error('beta not found'));
  const comments = dedupConcat(
    (s.comments || {})[beta.id] || [],
    mock.COMMENTS[beta.id] || []
  )
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .map((c) => {
      let user = findUser(c.userId, s);
      // 云端真实用户：用评论里的作者快照
      if (user.generic && c.userSnap) user = Object.assign({ id: c.userId }, c.userSnap);
      return Object.assign({}, c, {
        user: user,
        isMine: isMineId(c.userId),
        dateText: util.relativeDate(c.date)
      });
    });
  const others = allBetas(s)
    .filter((b) => b.routeId === beta.routeId && b.id !== beta.id)
    .sort(sortByLikes)
    .map((b) => decorateBeta(b, s));
  return Promise.resolve({
    beta: decorateBeta(beta, s),
    route: decorateRoute(findRoute(beta.routeId), s),
    comments: comments,
    others: others,
    following: !!(s.follows || {})[beta.userId]
  });
}

function getBetaFeed() {
  const s = store.get();
  return Promise.resolve(
    allBetas(s).slice().sort(sortByLikes).map((b) => decorateBeta(b, s))
  );
}

/* ---------- 互动 ---------- */

function toggleLike(betaId) {
  const s = store.update((st) => {
    if (st.likes[betaId]) delete st.likes[betaId];
    else st.likes[betaId] = true;
  });
  return Promise.resolve({ liked: !!s.likes[betaId] });
}

function toggleFav(routeId) {
  const s = store.update((st) => {
    if (st.favs[routeId]) delete st.favs[routeId];
    else st.favs[routeId] = true;
  });
  return Promise.resolve({ faved: !!s.favs[routeId] });
}

function toggleFollow(userId) {
  const s = store.update((st) => {
    if (st.follows[userId]) delete st.follows[userId];
    else st.follows[userId] = true;
  });
  return Promise.resolve({ following: !!s.follows[userId] });
}

function toggleReminder(routeId) {
  const s = store.update((st) => {
    if (st.reminders[routeId]) delete st.reminders[routeId];
    else st.reminders[routeId] = true;
  });
  return Promise.resolve({ on: !!s.reminders[routeId] });
}

function addComment(betaId, text) {
  return secCheck([text], [], 2).then(() => {
    const comment = {
      id: util.uid('c'),
      userId: 'me',
      text: text,
      date: util.today()
    };
    store.update((st) => {
      if (!st.comments[betaId]) st.comments[betaId] = [];
      st.comments[betaId].push(comment);
    });
    cloudAdd('comments', Object.assign({ betaId: betaId }, comment, {
      userId: myOpenid() || 'me',
      userSnap: mySnap()
    }));
    const s = store.get();
    return Object.assign({}, comment, {
      user: findUser('me', s),
      dateText: '今天'
    });
  });
}

function voteFeel(routeId, feel) {
  store.update((st) => {
    if (st.feels[routeId] === feel) delete st.feels[routeId];
    else st.feels[routeId] = feel;
  });
  const s = store.get();
  return Promise.resolve(decorateRoute(findRoute(routeId), s));
}

/* ---------- 发布 / 打卡 ---------- */

// 建线（发布页开荒 / 墙面页快速建线共用）
function buildRoute(data) {
  const d = new Date();
  const remove = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 30);
  const route = {
    id: util.uid('r'),
    gymId: data.gymId,
    wallId: data.wallId || ((gymWalls(findGym(data.gymId))[0] || {}).id || 'w-main'),
    name: data.name,
    color: data.color,
    grade: data.grade,
    setterId: 'me',
    setDate: util.today(),
    removeDate: util.formatDate(remove),
    tags: [],
    sends: 0,
    attempts: 0,
    feel: { soft: 0, fair: 0, hard: 0 },
    status: 'active',
    isUserRoute: true
  };
  store.update((st) => { st.myRoutes.unshift(route); });
  // 同步到云端（所有人可见）
  cloudAdd('routes', Object.assign({}, route, {
    setterId: myOpenid() || 'me',
    setterSnap: mySnap()
  }));
  return route;
}

function createRoute(data) {
  return secCheck([data.name], [], 1).then(() => buildRoute(data));
}

function publishBeta(data) {
  const texts = [data.title, data.caution]
    .concat((data.steps || []).map((st) => st.text))
    .concat(data.newRoute ? [data.newRoute.name] : []);
  return secCheck(texts, data.imageFileIDs || [], 2).then(() => {
    track.track('publish_beta', { type: data.type || 'text', pioneer: !data.routeId });
    return doPublishBeta(data);
  });
}

function doPublishBeta(data) {
  let routeId = data.routeId;
  // 在还没有线路数据的岩馆「开荒」：先建线路再挂 Beta
  if (!routeId && data.newRoute) {
    routeId = buildRoute(data.newRoute).id;
  }
  const beta = {
    id: util.uid('b'),
    routeId: routeId,
    userId: 'me',
    type: data.type || 'text',
    videoDur: data.videoDur || '',
    mediaCount: data.mediaCount || 0,
    likes: 0,
    createdAt: util.today(),
    title: data.title,
    caution: data.caution || '',
    heightFit: data.heightFit || [],
    moveTags: data.moveTags || [],
    steps: data.steps || [],
    visibility: data.visibility || 'public',
    imageFileIDs: data.imageFileIDs || [],
    videoFileID: data.videoFileID || ''
  };
  store.update((st) => { st.myBetas.unshift(beta); });
  // 本地模式下 Beta 首图持久化为线路封面（云模式由 imageFileIDs 自动生效）
  if (data.localImage && !(store.get().routePhotos || {})[routeId]) {
    setRoutePhoto(routeId, '', data.localImage);
  }
  // 公开 Beta 同步到云端（所有人可见）
  if (beta.visibility === 'public') {
    cloudAdd('betas', Object.assign({}, beta, {
      userId: myOpenid() || 'me',
      authorSnap: mySnap()
    }));
  }
  return beta;
}

function addCheckin(data) {
  return secCheck([data.note], [], 2).then(() => {
    track.track('checkin', { result: data.result });
    return doAddCheckin(data);
  });
}

function doAddCheckin(data) {
  // 打卡前的已解锁成就（用于对比解锁提示）
  const beforeBadges = buildLogbook(store.get()).badges
    .filter((b) => b.unlocked).map((b) => b.name);
  const checkin = {
    id: util.uid('k'),
    userId: 'me',
    routeId: data.routeId,
    result: data.result,
    attempts: data.attempts || 1,
    note: data.note || '',
    date: util.today()
  };
  store.update((st) => {
    st.checkins.push(checkin);
    if (data.feel) st.feels[data.routeId] = data.feel;
  });
  cloudAdd('checkins', Object.assign({}, checkin, {
    userId: myOpenid() || 'me',
    userSnap: mySnap()
  }));
  const s = store.get();
  const todayCount = s.checkins.filter((k) => k.date === checkin.date).length;
  const newBadges = buildLogbook(s).badges.filter(
    (b) => b.unlocked && beforeBadges.indexOf(b.name) < 0
  );
  return Promise.resolve({
    checkin: decorateCheckin(checkin, s),
    route: decorateRoute(findRoute(data.routeId), s),
    todayCount: todayCount,
    newBadges: newBadges
  });
}

// 打卡后推荐下一条：同馆在墙、我还没完攀；难度贴近（同级 > 高一级 > 低一级 > 其余 ±2 内），有 Beta 的优先
function recommendNext(routeId) {
  const s = store.get();
  const cur = findRoute(routeId, s);
  if (!cur) return Promise.resolve([]);
  const sent = {};
  (s.checkins || []).forEach((k) => { if (k.result !== 'attempt') sent[k.routeId] = true; });
  const base = gradeUtil.gradeIndex(cur.grade);
  const why = (d) => (d === 0 ? '同难度' : d === 1 ? '进阶一级' : d === -1 ? '稳一手' : d > 0 ? '挑战一下' : '热身');
  const list = gymActiveRoutes(cur.gymId, s)
    .filter((r) => r.id !== routeId && !sent[r.id])
    .map((r) => {
      const d = gradeUtil.gradeIndex(r.grade) - base;
      const rank = d === 0 ? 0 : (d === 1 ? 1 : (d === -1 ? 2 : 2 + Math.abs(d)));
      return { r: decorateRoute(r, s), rank: rank, d: d };
    })
    .filter((x) => x.rank <= 4)
    .sort((a, b) => (a.rank - b.rank) || (b.r.betaCount - a.r.betaCount))
    .slice(0, 3)
    .map((x) => ({
      id: x.r.id, name: x.r.name, grade: x.r.grade, gradeColor: x.r.gradeColor,
      colorHex: x.r.colorHex, colorLight: x.r.colorLight, wallName: x.r.wallName,
      betaCount: x.r.betaCount, why: why(x.d)
    }));
  return Promise.resolve(list);
}

/* ---------- 足迹 ---------- */

function getLogbook() {
  return Promise.resolve(buildLogbook(store.get()));
}

// 同步构建足迹数据（addCheckin 复用它做成就解锁对比）
function buildLogbook(s) {
  const list = (s.checkins || []).slice();
  const sends = list.filter((k) => k.result !== 'attempt');
  const monthStr = util.today().slice(0, 7);

  // 最高难度
  let maxGrade = '';
  let maxIdx = -1;
  sends.forEach((k) => {
    const r = findRoute(k.routeId);
    if (r && gradeUtil.gradeIndex(r.grade) > maxIdx) {
      maxIdx = gradeUtil.gradeIndex(r.grade);
      maxGrade = r.grade;
    }
  });

  // 连续周：必须接到本周或上周，历史连续周不算当前 streak
  const weeks = {};
  list.forEach((k) => { weeks[util.weekKey(k.date)] = true; });
  const thisWeek = util.weekKey(util.today());
  let cursor = util.parseDate(thisWeek);
  if (!weeks[thisWeek]) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
  }
  let streak = 0;
  while (weeks[util.formatDate(cursor)]) {
    streak += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
  }

  // 难度金字塔
  const gradeCount = {};
  sends.forEach((k) => {
    const r = findRoute(k.routeId);
    if (r) gradeCount[r.grade] = (gradeCount[r.grade] || 0) + 1;
  });
  const maxCount = Math.max.apply(null, [1].concat(Object.keys(gradeCount).map((g) => gradeCount[g])));
  const pyramid = gradeUtil.GRADE_LIST
    .filter((g) => gradeCount[g])
    .reverse()
    .map((g) => ({
      grade: g,
      count: gradeCount[g],
      pct: Math.round((gradeCount[g] / maxCount) * 100),
      color: gradeUtil.gradeColor(g)
    }));

  // 近10周热力图（70天，周一起始对齐）
  const dayCount = {};
  list.forEach((k) => { dayCount[k.date] = (dayCount[k.date] || 0) + 1; });
  const heat = [];
  const todayD = new Date();
  const dow = (todayD.getDay() + 6) % 7; // 周一=0
  const totalDays = 63 + dow + 1; // 9整周 + 本周
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate() - i);
    const ds = util.formatDate(d);
    const c = dayCount[ds] || 0;
    heat.push({ date: ds, level: Math.min(c, 3), isToday: i === 0 });
  }

  // 按日期分组的时间线
  const byDate = {};
  list.slice().reverse().forEach((k) => {
    if (!byDate[k.date]) byDate[k.date] = [];
    byDate[k.date].push(decorateCheckin(k, s));
  });
  const groups = Object.keys(byDate).sort().reverse().map((d) => ({
    date: d,
    dateText: util.relativeDate(d),
    list: byDate[d]
  }));

  // 造访岩馆数
  const gymSet = {};
  list.forEach((k) => {
    const r = findRoute(k.routeId);
    if (r) gymSet[r.gymId] = true;
  });

  const badges = [
    { name: '首攀', desc: '完成第一次打卡', unlocked: list.length >= 1 },
    { name: '出坑', desc: '完攀一条 V3 或以上', unlocked: sends.some((k) => { const r = findRoute(k.routeId); return r && gradeUtil.gradeIndex(r.grade) >= 3; }) },
    { name: '硬核', desc: '完攀一条 V5 或以上', unlocked: maxIdx >= 5 },
    { name: 'Beta布道者', desc: '发布第一条 Beta', unlocked: (s.myBetas || []).length >= 1 },
    { name: '十全十美', desc: '累计完攀 10 条', unlocked: sends.length >= 10 },
    { name: '广撒网', desc: '在 3 家岩馆打过卡', unlocked: Object.keys(gymSet).length >= 3 },
    { name: '周更侠', desc: '连续 4 周打卡', unlocked: streak >= 4 },
    { name: '闪电手', desc: 'Flash 一条 V4 或以上', unlocked: sends.some((k) => { const r = findRoute(k.routeId); return k.result === 'flash' && r && gradeUtil.gradeIndex(r.grade) >= 4; }) }
  ];

  return {
    stats: {
      totalSends: sends.length,
      totalCheckins: list.length,
      monthCount: list.filter((k) => k.date.slice(0, 7) === monthStr).length,
      maxGrade: maxGrade || '-',
      streak: streak,
      gymCount: Object.keys(gymSet).length
    },
    pyramid: pyramid,
    heat: heat,
    groups: groups,
    badges: badges,
    demoSeeded: !!s.demoSeeded
  };
}

// 载入一批演示打卡（便于体验足迹页效果）
function seedDemoCheckins() {
  const routesPool = ['r101', 'r102', 'r103', 'r105', 'r201', 'r203', 'r302', 'r303', 'r105', 'r204'];
  const results = ['flash', 'top', 'top', 'top', 'flash', 'top', 'top', 'attempt', 'top', 'attempt'];
  const daysAgo = [1, 3, 5, 9, 14, 20, 27, 34, 41, 49];
  store.update((st) => {
    if (st.demoSeeded) return;
    daysAgo.forEach((n, i) => {
      const d = new Date();
      const ds = util.formatDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n));
      st.checkins.push({
        id: util.uid('k'), userId: 'me', routeId: routesPool[i],
        result: results[i], attempts: results[i] === 'flash' ? 1 : 2 + (i % 5),
        note: '', date: ds
      });
    });
    st.demoSeeded = true;
  });
  return Promise.resolve(true);
}

/* ---------- 用户 ---------- */

function getMy() {
  const s = store.get();
  const followingUsers = Object.keys(s.follows || {}).map((uidKey) => findUser(uidKey, s));
  return Promise.resolve({
    profile: s.profile,
    myBetas: (s.myBetas || []).map((b) => decorateBeta(b, s)),
    favRoutes: Object.keys(s.favs || {})
      .map((rid) => decorateRoute(findRoute(rid), s))
      .filter((r) => !!r),
    following: followingUsers,
    checkinCount: (s.checkins || []).length,
    gyms: allGymsList().map((g) => ({ id: g.id, name: g.name }))
  });
}

function saveProfile(patch) {
  // 昵称/简介属于用户资料 UGC（scene 1）
  return secCheck([patch.nickname, patch.intro], [], 1).then(() => {
    store.update((st) => {
      st.profile = Object.assign({}, st.profile, patch);
    });
    return store.get().profile;
  });
}

/* ---------- 换线维护（众包报告 + 定线员整墙下架） ---------- */

// 报告线路已换线：≥2 人报告后线路页显示「可能已换线」提示
function reportRouteRemoved(routeId) {
  if ((store.get().routeReports || {})[routeId]) {
    return Promise.resolve({ already: true });
  }
  store.update((st) => {
    if (!st.routeReports) st.routeReports = {};
    st.routeReports[routeId] = true;
  });
  cloudAdd('routereports', {
    id: util.uid('rr'),
    routeId: routeId,
    userId: myOpenid() || 'me',
    date: util.today()
  });
  const s = store.get();
  return Promise.resolve({ route: decorateRoute(findRoute(routeId), s) });
}

// 整墙换线（认证定线员）：本墙所有 active 线路批量下架
function retireWall(gymId, wallId) {
  const s0 = store.get();
  if (!s0.profile || !s0.profile.isSetter) {
    return Promise.reject(new Error('仅认证定线员可整墙换线'));
  }
  // 本地立即生效：开荒线 + mock 线路覆盖层
  store.update((st) => {
    if (!st.retiredWalls) st.retiredWalls = {};
    st.retiredWalls[wallRetireKey(gymId, wallId)] = true;
    (st.myRoutes || []).forEach((r) => {
      if (r.gymId === gymId && r.wallId === wallId && r.status === 'active') {
        r.status = 'removed';
        r.removeDate = util.today();
      }
    });
  });
  if (typeof wx === 'undefined' || !wx.cloud) return Promise.resolve({ ok: true, demo: true });
  return wx.cloud.callFunction({
    name: 'retireWall',
    data: { gymId: gymId, wallId: wallId }
  }).then((r) => {
    if (r.result && r.result.ok) return r.result;
    throw new Error((r.result && r.result.error) || '操作失败');
  });
}

/* ---------- 定线员认证（申请制，替代自封开关） ---------- */

// 提交认证申请；云端审核制（控制台改 status='approved'），无云环境（纯演示）直接生效
// 入参：结构化对象 { gymName, realName, years, contact, note }；兼容旧签名 (gymName, note)
function applySetter(info, legacyNote) {
  const f = (typeof info === 'string') ? { gymName: info, note: legacyNote || '' } : (info || {});
  return secCheck([f.gymName, f.realName, f.contact, f.note], [], 1).then(() => {
    if (typeof wx === 'undefined' || !wx.cloud) {
      store.update((st) => { st.profile.isSetter = true; });
      return { status: 'approved', demo: true };
    }
    return wx.cloud.callFunction({
      name: 'setterApply',
      data: {
        action: 'apply',
        gymName: f.gymName || '',
        realName: f.realName || '',
        years: f.years || '',
        contact: f.contact || '',
        note: f.note || '',
        snap: mySnap()
      }
    }).then((r) => {
      if (r.result && r.result.ok) return { status: 'pending' };
      throw new Error((r.result && r.result.error) || '提交失败');
    });
  });
}

// 修改线路难度/名称：本地即时生效（自建线），云端经 updateRoute 校验（线主或认证定线员）
function updateRoute(routeId, patch) {
  const p = {};
  if (patch && patch.grade) p.grade = String(patch.grade).toUpperCase();
  if (patch && patch.name) p.name = String(patch.name).trim().slice(0, 15);
  if (patch && patch.color && gradeUtil.HOLD_COLORS[patch.color]) p.color = patch.color;
  if (!p.grade && !p.name && !p.color) return Promise.reject(new Error('nothing to update'));
  return secCheck(p.name ? [p.name] : [], [], 1).then(() => {
    store.update((st) => {
      const r = (st.myRoutes || []).find((x) => x.id === routeId);
      if (r) Object.assign(r, p);
    });
    if (typeof wx === 'undefined' || !wx.cloud) return { ok: true, local: true };
    return wx.cloud.callFunction({
      name: 'updateRoute',
      data: Object.assign({ routeId: routeId }, p)
    }).then((r) => {
      const res = (r && r.result) || {};
      if (!res.ok) throw new Error(res.error || '修改失败');
      return res;
    });
  });
}

// 编辑自己的 Beta（白名单字段，媒体不可改）：本地即时生效，云端经 updateBeta 校验作者
function updateBeta(betaId, patch) {
  const p = {};
  if (patch.title != null) p.title = String(patch.title).trim();
  if (patch.caution != null) p.caution = String(patch.caution).trim();
  if (Array.isArray(patch.steps)) p.steps = patch.steps;
  if (Array.isArray(patch.moveTags)) p.moveTags = patch.moveTags;
  if (Array.isArray(patch.heightFit)) p.heightFit = patch.heightFit;
  if (patch.visibility) p.visibility = patch.visibility;
  const texts = [p.title, p.caution].concat((p.steps || []).map((st) => st.text));
  return secCheck(texts, [], 2).then(() => {
    store.update((st) => {
      const b = (st.myBetas || []).find((x) => x.id === betaId);
      if (b) Object.assign(b, p);
    });
    if (typeof wx === 'undefined' || !wx.cloud) return { ok: true, local: true };
    return wx.cloud.callFunction({ name: 'updateBeta', data: { id: betaId, patch: p } })
      .then((r) => {
        const res = (r && r.result) || {};
        if (!res.ok) throw new Error(res.error || '保存失败');
        return res;
      });
  });
}

// 删除自己的评论
function deleteComment(betaId, commentId) {
  store.update((st) => {
    if (st.comments && st.comments[betaId]) {
      st.comments[betaId] = st.comments[betaId].filter((c) => c.id !== commentId);
    }
  });
  if (typeof wx === 'undefined' || !wx.cloud) return Promise.resolve({ ok: true, local: true });
  return wx.cloud.callFunction({ name: 'deleteContent', data: { type: 'comment', id: commentId } })
    .then((r) => {
      const res = (r && r.result) || {};
      if (!res.ok) throw new Error(res.error || '删除失败');
      return res;
    });
}

// 删除自己的打卡（足迹统计自动随之修正）
function deleteCheckin(checkinId) {
  store.update((st) => {
    st.checkins = (st.checkins || []).filter((k) => k.id !== checkinId);
  });
  if (typeof wx === 'undefined' || !wx.cloud) return Promise.resolve({ ok: true, local: true });
  return wx.cloud.callFunction({ name: 'deleteContent', data: { type: 'checkin', id: checkinId } })
    .then((r) => {
      const res = (r && r.result) || {};
      if (!res.ok) throw new Error(res.error || '删除失败');
      return res;
    });
}

// 删除自己的 Beta：本地立即移除；云端经 deleteContent 校验作者身份（连带评论）
function deleteBeta(betaId) {
  store.update((st) => {
    st.myBetas = (st.myBetas || []).filter((b) => b.id !== betaId);
    if (st.comments && st.comments[betaId]) delete st.comments[betaId];
    if (st.likes && st.likes[betaId]) delete st.likes[betaId];
  });
  if (typeof wx === 'undefined' || !wx.cloud) return Promise.resolve({ ok: true, local: true });
  return wx.cloud.callFunction({ name: 'deleteContent', data: { type: 'beta', id: betaId } })
    .then((r) => {
      const res = (r && r.result) || {};
      if (!res.ok) throw new Error(res.error || '删除失败');
      return res;
    });
}

// 删除线路（线主/认证定线员）：
// 云端有他人 Beta/打卡时自动转「下架」而非硬删（deleteContent 内判定）；
// 本地清掉自己的相关内容与墙面圈点（removeWallMarker 会同步云端 removeRoute op）
function deleteRoute(routeId) {
  const r0 = findRoute(routeId);
  const gymId = r0 && r0.gymId;
  const wallId = r0 && r0.wallId;
  store.update((st) => {
    st.myRoutes = (st.myRoutes || []).filter((r) => r.id !== routeId);
    st.myBetas = (st.myBetas || []).filter((b) => b.routeId !== routeId);
    st.checkins = (st.checkins || []).filter((k) => k.routeId !== routeId);
    if (st.favs && st.favs[routeId]) delete st.favs[routeId];
    if (st.feels && st.feels[routeId]) delete st.feels[routeId];
    if (st.routePhotos && st.routePhotos[routeId]) delete st.routePhotos[routeId];
    if (st.routeReports && st.routeReports[routeId]) delete st.routeReports[routeId];
  });
  if (gymId && wallId) removeWallMarker(gymId, wallId, routeId);
  if (typeof wx === 'undefined' || !wx.cloud) return Promise.resolve({ ok: true, local: true });
  return wx.cloud.callFunction({ name: 'deleteContent', data: { type: 'route', id: routeId } })
    .then((r) => {
      const res = (r && r.result) || {};
      if (!res.ok) throw new Error(res.error || '删除失败');
      return res;
    });
}

// 查询认证详情（状态+所属岩馆）；供定线员中心页展示
function getSetterInfo() {
  if (typeof wx === 'undefined' || !wx.cloud) {
    return Promise.resolve({
      status: store.get().profile.isSetter ? 'approved' : 'none',
      gymName: ''
    });
  }
  let call;
  try {
    call = wx.cloud.callFunction({ name: 'setterApply', data: { action: 'status' } });
  } catch (e) {
    return Promise.resolve({ status: 'none', gymName: '' });
  }
  return call.then((r) => {
    const res = (r && r.result) || {};
    const st = res.status || 'none';
    if (st === 'approved' && !store.get().profile.isSetter) {
      store.update((s2) => { s2.profile.isSetter = true; });
    }
    return { status: st, gymName: res.gymName || '', appliedAt: res.appliedAt || '' };
  }).catch(() => ({
    status: store.get().profile.isSetter ? 'approved' : 'none',
    gymName: ''
  }));
}

// 查询认证状态；audit 通过后自动点亮本地 isSetter
function checkSetterStatus() {
  if (typeof wx === 'undefined' || !wx.cloud) {
    return Promise.resolve(store.get().profile.isSetter ? 'approved' : 'none');
  }
  let call;
  try {
    call = wx.cloud.callFunction({ name: 'setterApply', data: { action: 'status' } });
  } catch (e) {
    return Promise.resolve('none');
  }
  return call.then((r) => {
    const st = (r.result && r.result.status) || 'none';
    if (st === 'approved' && !store.get().profile.isSetter) {
      store.update((s2) => { s2.profile.isSetter = true; });
    }
    return st;
  }).catch(() => (store.get().profile.isSetter ? 'approved' : 'none'));
}

function getUserPage(userId) {
  const s = store.get();
  let user = findUser(userId, s);
  const rawBetas = allBetas(s).filter((b) => b.userId === userId);
  // 云端真实用户：从其内容快照还原资料
  if (user.generic) {
    const snapSrc = rawBetas.find((b) => b.authorSnap) ||
      allCheckins(s).find((k) => k.userId === userId && k.userSnap);
    const snap = snapSrc ? (snapSrc.authorSnap || snapSrc.userSnap) : null;
    if (snap) user = Object.assign({ id: userId }, snap);
  }
  const betas = rawBetas.sort(sortByLikes).map((b) => decorateBeta(b, s));
  const ks = allCheckins(s).filter((k) => k.userId === userId);
  const sends = ks.filter((k) => k.result !== 'attempt');
  const homeGym = findGym(user.homeGymId);
  return Promise.resolve({
    user: user,
    homeGymName: homeGym ? homeGym.name : '',
    betas: betas,
    stats: { betaCount: betas.length, sendCount: sends.length },
    following: !!(s.follows || {})[userId]
  });
}

// 众包补充/修正岩馆分级标准（认证定线员用）：本地立即生效 + 云端广播给所有用户
function setGymGrading(gymId, meta) {
  const patch = {
    gradeBy: meta.gradeBy || 'hold',
    gradeSystem: meta.gradeSystem || [],
    gradeNote: meta.gradeNote || ''
  };
  return secCheck([patch.gradeNote], [], 1).then(() => {
    store.update((st) => {
      if (!st.gymMeta) st.gymMeta = {};
      st.gymMeta[gymId] = patch;
    });
    if (typeof wx !== 'undefined' && wx.cloud) {
      try {
        wx.cloud.callFunction({
          name: 'saveGymMeta',
          data: { gymId: gymId, meta: patch, editorSnap: mySnap() }
        }).catch(() => {});
      } catch (e) { /* ignore */ }
    }
    return findGym(gymId);
  });
}

/* ---------- 线路照片 ---------- */

// 手动为线路设置照片（本地立即生效 + 云端共享）
function setRoutePhoto(routeId, fileID, path) {
  store.update((st) => {
    if (!st.routePhotos) st.routePhotos = {};
    st.routePhotos[routeId] = { fileID: fileID || '', path: path || '' };
  });
  if (fileID) {
    cloudAdd('routephotos', {
      routeId: routeId,
      fileID: fileID,
      createdAt: util.today(),
      userId: myOpenid() || 'me'
    });
  }
  return Promise.resolve(true);
}

/* ---------- 墙面照片（KAYA 式：整墙照片 + 线路点位标注） ---------- */

function wallKey(gymId, wallId) {
  return gymId + '_' + wallId;
}

// 文档时间：本地副本 updatedAtTs(ms) > 云端 mtime(ms) > updatedAt(日期字符串)
function wallDocTs(d) {
  if (!d) return 0;
  if (d.updatedAtTs) return d.updatedAtTs;
  if (d.mtime) return d.mtime;
  if (d.updatedAt) {
    const t = new Date(String(d.updatedAt).replace(/-/g, '/')).getTime();
    if (t) return t;
  }
  return 0;
}

// 合并视图：本地编辑副本 vs 云端文档，谁新用谁。
// 教训（2026-07-30）：旧逻辑「本地永远优先」——手机上一份过期本地副本
// 会永久遮蔽云端恢复/他人更新的墙面数据。改为按时间裁决后可自愈：
// 用户下次编辑会以最新文档为底重建本地副本。
function getWallDoc(gymId, wallId, state) {
  const s = state || store.get();
  const key = wallKey(gymId, wallId);
  const local = (s.walls || {})[key];
  const cloud = mock.WALLS.find((w) => w.key === key) || null;
  if (local && cloud) return wallDocTs(cloud) > wallDocTs(local) ? cloud : local;
  return local || cloud;
}

// 岩馆的墙面列表（名录馆没有墙面数据时给一面「主墙」承载照片）
function gymWalls(gym) {
  const walls = (gym && gym.walls && gym.walls.length)
    ? gym.walls
    : [{ id: 'w-main', name: '主墙', angle: '' }];
  return walls;
}

function getWallPhoto(gymId, wallId) {
  const s = store.get();
  const gym = findGym(gymId);
  if (!gym) return Promise.reject(new Error('gym not found'));
  const wall = gymWalls(gym).find((w) => w.id === wallId) || { id: wallId, name: '墙面' };
  const doc = getWallDoc(gymId, wallId, s);
  const routes = gymActiveRoutes(gymId, s);
  const markers = ((doc && doc.markers) || []).map((m) => {
    const r = decorateRoute(findRoute(m.routeId), s);
    return Object.assign({}, m, r ? {
      name: r.name, grade: r.grade, gradeColor: r.gradeColor,
      colorHex: r.colorHex, colorLight: r.colorLight,
      betaCount: r.betaCount || 0
    } : { name: '已拆线', grade: '', gradeColor: '#999', colorHex: '#ccc', betaCount: 0 });
  });
  return Promise.resolve({
    gymName: gym.name,
    wallName: wall.name,
    photo: doc ? (doc.photoFileID || doc.photoPath || '') : '',
    markers: markers,
    holds: (function () {
      const raw = (doc && doc.holds) || {};
      const out = {};
      Object.keys(raw).forEach((k) => { out[k] = labelHolds(raw[k]); });
      return out;
    })(),
    gradeSystem: gym.gradeSystem || null,
    gradeBy: gym.gradeBy || 'hold',
    isSetter: !!(s.profile && s.profile.isSetter),
    routes: routes.map((r) => {
      const c = gradeUtil.HOLD_COLORS[r.color] || {};
      // 选线器无难度徽章 → 标签带上 V几：「红点 V4」
      return { id: r.id, color: r.color, label: routeShortName(r, c) + ' ' + (r.grade || '') };
    })
  });
}

// 保存/更新墙面文档（本地立即生效 + 尽力同步云端）
// op 传入时走操作级云端合并（服务端读-改-写，只动涉及的线路，多人同时标注不同线不互吞）；
// 不传 op 时退回整文档覆盖（初次创建等场景）
function saveWallDoc(gymId, wallId, patch, op) {
  const key = wallKey(gymId, wallId);
  const s = store.update((st) => {
    if (!st.walls) st.walls = {};
    const cur = st.walls[key] || getWallDoc(gymId, wallId) || {
      key: key, gymId: gymId, wallId: wallId, markers: []
    };
    st.walls[key] = Object.assign({}, cur, patch, {
      updatedAt: util.today(),
      updatedAtTs: Date.now() // 与云端 mtime 做新旧裁决用
    });
  });
  const doc = s.walls[key];
  if (typeof wx !== 'undefined' && wx.cloud) {
    try {
      // 经 saveWall 云函数写入（管理员权限，支持多人协作编辑同一面墙）
      const payload = op
        ? { key: key, gymId: gymId, wallId: wallId, op: op, editorSnap: mySnap(s) }
        : { key: key, doc: Object.assign({}, doc, { editorSnap: mySnap(s) }) };
      wx.cloud.callFunction({ name: 'saveWall', data: payload }).catch(() => {});
    } catch (e) { /* ignore */ }
  }
  return Promise.resolve(doc);
}

function setWallPhoto(gymId, wallId, photoFileID, photoPath) {
  // 墙照会被全馆用户看到，云端图先过内容安全检测
  return secCheck([], photoFileID ? [photoFileID] : [], 2).then(() =>
    saveWallDoc(gymId, wallId, {
      photoFileID: photoFileID || '',
      photoPath: photoPath || ''
    }, { type: 'setPhoto', photoFileID: photoFileID || '', photoPath: photoPath || '' }));
}

// 某线路的岩点+徽章 → 操作级同步 op（云端只合并这条线，不动别人标的线）
function holdsOp(routeId, arr, markers) {
  const mk = (markers || []).find((m) => m.routeId === routeId);
  return {
    type: 'setHolds',
    routeId: routeId,
    holds: arr || [],
    marker: mk ? { x: mk.x, y: mk.y } : null
  };
}

function setWallMarker(gymId, wallId, routeId, x, y) {
  const doc = getWallDoc(gymId, wallId) || { markers: [] };
  const markers = (doc.markers || []).filter((m) => m.routeId !== routeId);
  markers.push({ routeId: routeId, x: x, y: y });
  return saveWallDoc(gymId, wallId, { markers: markers },
    holdsOp(routeId, ((doc.holds || {})[routeId]) || [], markers));
}

// 徽章落点：取手点里最高的（脚点不背徽章）；没有手点时退回全部点
function topHold(arr) {
  const hands = (arr || []).filter((h) => h.t !== 'f');
  const base = hands.length ? hands : (arr || []);
  return base.reduce((a, b) => (b.y < a.y ? b : a), base[0]);
}

// 给线路圈一个岩点（可连续多点）；type='f' 表示脚点（Stokt 惯例：手脚分开标）
function setWallHold(gymId, wallId, routeId, x, y, type) {
  const doc = getWallDoc(gymId, wallId) || { markers: [], holds: {} };
  const holds = Object.assign({}, doc.holds || {});
  const hold = { x: x, y: y };
  if (type === 'f') hold.t = 'f';
  const arr = (holds[routeId] || []).concat([hold]);
  holds[routeId] = arr;
  const top = topHold(arr);
  const markers = (doc.markers || []).filter((m) => m.routeId !== routeId)
    .concat([{ routeId: routeId, x: top.x, y: top.y }]);
  return saveWallDoc(gymId, wallId, { holds: holds, markers: markers },
    holdsOp(routeId, arr, markers));
}

// 岩点标签：起步点组显示「起」，手点按手序编号；脚点不编号（f 标记供渲染虚线小圈）
function labelHolds(arr) {
  const list = arr || [];
  const hands = list.filter((h) => h.t !== 'f');
  const hasStart = hands.some((h) => h.s);
  let n = 0;
  let handIdx = 0;
  return list.map((h) => {
    const isFoot = h.t === 'f';
    let label = '';
    if (isFoot) {
      label = h.s ? '起' : '';
    } else {
      if (hasStart) {
        if (h.s) { label = '起'; } else { n++; label = String(n); }
      } else {
        label = handIdx === 0 ? '起' : String(handIdx + 1);
      }
      handIdx++;
    }
    return Object.assign({}, h, { label: label, f: isFoot });
  });
}

// 批量设置某线路的全部岩点（AI 自动圈点用；候选默认手点，编辑时可改）
function setWallHolds(gymId, wallId, routeId, arr) {
  const doc = getWallDoc(gymId, wallId) || { markers: [], holds: {} };
  const holds = Object.assign({}, doc.holds || {});
  holds[routeId] = arr || [];
  let markers = (doc.markers || []).filter((m) => m.routeId !== routeId);
  if (arr && arr.length) {
    const top = topHold(arr);
    markers = markers.concat([{ routeId: routeId, x: top.x, y: top.y }]);
  }
  return saveWallDoc(gymId, wallId, { holds: holds, markers: markers },
    holdsOp(routeId, arr || [], markers));
}

// 删除某线路的第 idx 个岩点（编辑模式单点删除，可删中间的点）
function deleteWallHold(gymId, wallId, routeId, idx) {
  const doc = getWallDoc(gymId, wallId);
  if (!doc || !doc.holds || !doc.holds[routeId] || !doc.holds[routeId][idx]) {
    return Promise.resolve(doc);
  }
  const holds = Object.assign({}, doc.holds);
  const arr = holds[routeId].filter((h, i) => i !== idx);
  let markers = (doc.markers || []).filter((m) => m.routeId !== routeId);
  if (arr.length) {
    holds[routeId] = arr;
    const top = topHold(arr);
    markers = markers.concat([{ routeId: routeId, x: top.x, y: top.y }]);
  } else {
    delete holds[routeId];
  }
  return saveWallDoc(gymId, wallId, { holds: holds, markers: markers },
    arr.length ? holdsOp(routeId, arr, markers) : { type: 'removeRoute', routeId: routeId });
}

// 切换某个岩点的手点/脚点类型
function toggleWallHoldFoot(gymId, wallId, routeId, idx) {
  const doc = getWallDoc(gymId, wallId);
  if (!doc || !doc.holds || !doc.holds[routeId] || !doc.holds[routeId][idx]) {
    return Promise.resolve(doc);
  }
  const holds = Object.assign({}, doc.holds);
  const arr = holds[routeId].map((h, i) => {
    if (i !== idx) return h;
    const next = Object.assign({}, h);
    if (next.t === 'f') delete next.t; else next.t = 'f';
    return next;
  });
  holds[routeId] = arr;
  // 徽章重算（脚点不背徽章）
  let markers = (doc.markers || []).filter((m) => m.routeId !== routeId);
  const top = topHold(arr);
  markers = markers.concat([{ routeId: routeId, x: top.x, y: top.y }]);
  return saveWallDoc(gymId, wallId, { holds: holds, markers: markers },
    holdsOp(routeId, arr, markers));
}

// 切换某个岩点的「起步点」标记
function toggleWallHoldStart(gymId, wallId, routeId, idx) {
  const doc = getWallDoc(gymId, wallId);
  if (!doc || !doc.holds || !doc.holds[routeId] || !doc.holds[routeId][idx]) {
    return Promise.resolve(doc);
  }
  const holds = Object.assign({}, doc.holds);
  const arr = holds[routeId].map((h, i) =>
    i === idx ? Object.assign({}, h, { s: h.s ? 0 : 1 }) : h);
  holds[routeId] = arr;
  return saveWallDoc(gymId, wallId, { holds: holds },
    holdsOp(routeId, arr, doc.markers || []));
}

// 撤销该线路最后一个岩点
function undoWallHold(gymId, wallId, routeId) {
  const doc = getWallDoc(gymId, wallId);
  if (!doc || !doc.holds || !(doc.holds[routeId] || []).length) {
    return Promise.resolve(doc);
  }
  const holds = Object.assign({}, doc.holds);
  const arr = holds[routeId].slice(0, -1);
  let markers = (doc.markers || []).filter((m) => m.routeId !== routeId);
  if (arr.length) {
    holds[routeId] = arr;
    const top = topHold(arr);
    markers = markers.concat([{ routeId: routeId, x: top.x, y: top.y }]);
  } else {
    delete holds[routeId];
  }
  return saveWallDoc(gymId, wallId, { holds: holds, markers: markers },
    arr.length ? holdsOp(routeId, arr, markers) : { type: 'removeRoute', routeId: routeId });
}

function removeWallMarker(gymId, wallId, routeId) {
  const doc = getWallDoc(gymId, wallId) || { markers: [] };
  const holds = Object.assign({}, doc.holds || {});
  delete holds[routeId];
  return saveWallDoc(gymId, wallId, {
    markers: (doc.markers || []).filter((m) => m.routeId !== routeId),
    holds: holds
  }, { type: 'removeRoute', routeId: routeId });
}

/* ---------- AI 路线预判（实验性：基于点位几何的规则引擎，仅供参考） ---------- */

// 手点序列的显示标签（与墙面圈点 labelHolds 同规则）：AI 文案引用点位时与图上编号一致
function handSeqLabels(seq) {
  const hasStart = seq.some((h) => h.s);
  let n = 0;
  return seq.map((h, i) => {
    if (hasStart) { if (h.s) return '起'; n++; return String(n); }
    return i === 0 ? '起' : String(i + 1);
  });
}

// 起步点组折叠：起手是同时上的（通常两手两脚），组内不构成手序移动。
// 几何分析/逐手拆解都从「起步位 → 1号点」开始算，取最后一个起步手点作为起始位置。
function collapseStartCluster(hands) {
  const starts = hands.filter((h) => h.s);
  const rest = hands.filter((h) => !h.s);
  if (!starts.length) {
    return { seq: hands, labels: hands.map((h, i) => (i === 0 ? '起' : String(i + 1))) };
  }
  return {
    seq: [starts[starts.length - 1]].concat(rest),
    labels: ['起'].concat(rest.map((h, i) => String(i + 1)))
  };
}

function analyzeRouteHolds(holds) {
  const all = holds || [];
  // 只用手点做几何分析：脚点混入手序会把间距/横移全算乱（用户实测反馈）
  const hands = all.filter((h) => h.t !== 'f');
  const feet = all.length - hands.length;
  if (hands.length < 3) return null;
  const startInfo = collapseStartCluster(hands);
  const seq = startInfo.seq;
  const labels = startInfo.labels;
  const handCount = hands.length;
  const tips = [];
  let maxGap = 0;
  let maxIdx = 1;
  let traverse = 0;
  let smallSteps = 0;
  for (let i = 1; i < seq.length; i++) {
    const dx = seq[i].x - seq[i - 1].x;
    const dy = seq[i - 1].y - seq[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > maxGap) { maxGap = len; maxIdx = i; }
    if (Math.abs(dx) > 10 && dy < 6) traverse++;
    if (len < 8) smallSteps++;
  }
  if (seq[0].y > 82) {
    tips.push('起步点位置较低，大概率坐姿起步：先收紧核心再发力，避免起步就脱手');
  }
  if (maxGap > 16) {
    tips.push('「' + labels[maxIdx - 1] + '」→「' + labels[maxIdx] + '」两点间距最大（约墙宽 ' + Math.round(maxGap) + '%），可能需要动态或高脚过渡，小个子建议先找中间脚点');
  }
  if (traverse >= 2) {
    tips.push('存在明显横移段：重心先平移到位再出手，注意侧拉发力与手序，避免交叉打结');
  }
  if (smallSteps >= seq.length - 2) {
    tips.push('点距整体较近，偏静态控制型：省着用指力，脚法和身体张力是关键');
  }
  const net = seq[seq.length - 1].x - seq[0].x;
  if (Math.abs(net) > 20) {
    tips.push('线路整体向' + (net > 0 ? '右' : '左') + '斜上：起步选对第一只手，能省掉一次换手');
  }
  if (!tips.length) {
    tips.push('点位分布均匀，按图预读手序、控制节奏即可');
  }
  tips.push('已标注手点 ' + handCount + ' 个' + (feet ? ' · 脚点 ' + feet + ' 个' : '') + ' · 上墙前对照图片过一遍手序');
  return tips;
}

// 逐手拆解：每一段的方向 / 距离 / 建议（只按手点序列；起步组折叠为同一起始位）
function buildMoves(rawHolds) {
  const hands = (rawHolds || []).filter((h) => h.t !== 'f');
  if (!hands || hands.length < 2) return null;
  const startInfo = collapseStartCluster(hands);
  const holds = startInfo.seq;
  const labels = startInfo.labels;
  if (holds.length < 2) return null;
  const DIRS = ['右', '右上', '上', '左上', '左', '左下', '下', '右下'];
  const moves = [];
  for (let i = 1; i < holds.length; i++) {
    const dx = holds[i].x - holds[i - 1].x;
    const dy = holds[i - 1].y - holds[i].y; // 向上为正
    const len = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(dy, dx);
    const idx = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    const dist = len < 8 ? '短距' : (len < 16 ? '中距' : '大跨度');
    const hint = len >= 16
      ? '考虑动态，或先找中间脚点'
      : (Math.abs(dx) > Math.abs(dy) ? '重心先平移再出手' : '静态可控');
    moves.push('「' + labels[i - 1] + '」→「' + labels[i] + '」：向' + DIRS[idx] + ' · ' + dist + ' · ' + hint);
  }
  return moves;
}

// 某条线路在墙面照片上的位置（供线路详情页反查）
function findRouteWall(route) {
  if (!route) return null;
  const gym = findGym(route.gymId);
  if (!gym) return null;
  const walls = gymWalls(gym);
  for (let i = 0; i < walls.length; i++) {
    const doc = getWallDoc(route.gymId, walls[i].id);
    if (!doc || !(doc.photoFileID || doc.photoPath)) continue;
    const m = (doc.markers || []).find((mk) => mk.routeId === route.id);
    if (m) {
      return {
        gymId: route.gymId,
        wallId: walls[i].id,
        wallName: walls[i].name,
        photo: doc.photoFileID || doc.photoPath || '',
        x: m.x,
        y: m.y,
        // 这条线的全部岩点圈注（多点标注，含起步组标签）
        holds: labelHolds((doc.holds && doc.holds[route.id]) || [])
      };
    }
  }
  return null;
}

/* ---------- AI：云函数 aiAnnotate（算法候选 + 视觉模型复核 / 线路分析） ---------- */

function isCloudPhoto(photo) {
  return typeof wx !== 'undefined' && !!wx.cloud && String(photo || '').indexOf('cloud://') === 0;
}

// 岩点识别：云端墙照走云函数（与本地同一份算法 + 模型剔除胶带 / 海报、标起步点）
// 不可用时 reject，调用方退回本地 canvas 算法
function aiDetectHolds(photo, color) {
  if (!isCloudPhoto(photo)) return Promise.reject(new Error('local'));
  return wx.cloud.callFunction({ name: 'aiAnnotate', data: { fileID: photo, color: color } }).then((r) => {
    const res = (r && r.result) || {};
    if (!res.ok || !Array.isArray(res.holds)) throw new Error(res.err || 'aiAnnotate failed');
    return res;
  });
}

// 岩点签名：圈注变了，缓存的 AI 分析就作废
function holdsSig(holds) {
  return (holds || []).map((h) => [h.x, h.y, h.s ? 1 : 0, h.t === 'f' ? 1 : 0].join(',')).join(';');
}

function cachedRouteBeta(routeId, wallRef, state) {
  const c = ((state || store.get()).aiBeta || {})[routeId];
  return c && wallRef && c.sig === holdsSig(wallRef.holds) ? c : null;
}

// 线路深度分析：把按手序编号的岩点画在墙照上交给视觉模型。结果按线路缓存在本地
function aiRouteBeta(routeId) {
  const route = findRoute(routeId);
  const ref = findRouteWall(route);
  if (!route || !ref || !isCloudPhoto(ref.photo) || (ref.holds || []).length < 2) {
    return Promise.reject(new Error('需要云端墙照和至少 2 个圈注岩点'));
  }
  const holds = ref.holds.map((h) => {
    const o = { x: h.x, y: h.y };
    if (h.s) o.s = 1;
    if (h.f) o.t = 'f';
    return o;
  });
  return wx.cloud.callFunction({
    name: 'aiAnnotate',
    data: { mode: 'beta', fileID: ref.photo, holds: holds, color: route.color, grade: route.grade }
  }).then((r) => {
    const res = (r && r.result) || {};
    if (!res.ok) throw new Error(res.err === 'llm not configured' ? 'AI 分析尚未开通' : 'AI 分析失败，稍后再试');
    const entry = { tips: res.tips || [], moves: res.moves || [], model: res.model || '', sig: holdsSig(ref.holds), date: util.today() };
    store.update((st) => {
      if (!st.aiBeta) st.aiBeta = {};
      st.aiBeta[routeId] = entry;
    });
    return entry;
  });
}

/* ---------- 搜索 ---------- */

function search(kw) {
  const s = store.get();
  const q = String(kw || '').trim().toLowerCase();
  if (!q) return Promise.resolve({ routes: [], gyms: [], users: [], betas: [] });
  const has = (str) => String(str || '').toLowerCase().indexOf(q) >= 0;
  const routes = allRoutes(s).filter((r) => {
    const c = gradeUtil.HOLD_COLORS[r.color] || {};
    // 无名线按真实口径检索：颜色（红/红点）+ 难度（V4）都能搜到
    return has(r.name) || has(r.grade) || has(c.name) || has((c.name || '') + '点') ||
      (r.tags || []).some(has);
  }).map((r) => decorateRoute(r, s));
  const gyms = allGymsList().filter((g) => has(g.name) || has(g.area) || (g.tags || []).some(has))
    .map((g) => decorateGym(g, s, null));
  const users = mock.USERS.filter((u) => has(u.nickname) || has(u.intro));
  const betas = allBetas(s).filter((b) => has(b.title) || (b.moveTags || []).some(has))
    .map((b) => decorateBeta(b, s));
  // 记录搜索历史
  store.update((st) => {
    st.searchHistory = [kw].concat(st.searchHistory.filter((h) => h !== kw)).slice(0, 10);
  });
  return Promise.resolve({ routes: routes, gyms: gyms, users: users, betas: betas });
}

function getSearchMeta() {
  const s = store.get();
  return Promise.resolve({
    history: s.searchHistory || [],
    hotTags: ['挂脚跟', '动态跳跃', 'V4', '小个子', '屋檐', '新线']
  });
}

function clearSearchHistory() {
  store.update((st) => { st.searchHistory = []; });
  return Promise.resolve(true);
}

/* ---------- 发布选项 / 重置 ---------- */

// 发布页数据：全部岩馆（按城市分列），各馆线路列表（名录馆通常为空 → 走新建线路）
function getPublishGyms() {
  const s = store.get();
  const routeLabel = (r) => {
    const c = gradeUtil.HOLD_COLORS[r.color] || {};
    return { id: r.id, label: routeShortName(r, c) + ' ' + (r.grade || '') };
  };
  const gyms = allGymsList().map((g) => ({
    id: g.id,
    name: g.name,
    city: g.city,
    district: g.district || '其他',
    gradeSystem: g.gradeSystem || null,
    gradeBy: g.gradeBy || 'hold',
    routes: gymActiveRoutes(g.id, s).map(routeLabel)
  }));
  return Promise.resolve({
    cities: dir.CITIES,
    districtOrder: dir.DISTRICT_ORDER,
    gyms: gyms
  });
}

function resetDemo() {
  store.reset();
  return Promise.resolve(true);
}

module.exports = {
  recommendNext,
  aiDetectHolds,
  aiRouteBeta,
  getHome, markOnboarded,
  getGyms, getGymDetail, getCities, nearestCityKey,
  getRouteDetail, getBetaDetail, getBetaFeed, getRouteBetas,
  toggleLike, toggleFav, toggleFollow, toggleReminder,
  addComment, voteFeel,
  publishBeta, addCheckin,
  getLogbook, seedDemoCheckins,
  getMy, saveProfile, getUserPage,
  search, getSearchMeta, clearSearchHistory,
  getPublishGyms, createRoute, resetDemo,
  getWallPhoto, setWallPhoto, setWallMarker, removeWallMarker, setRoutePhoto,
  setWallHold, undoWallHold, toggleWallHoldStart, setWallHolds,
  deleteWallHold, toggleWallHoldFoot, updateBeta, deleteComment, deleteCheckin,
  setGymGrading, applySetter, checkSetterStatus, getSetterInfo, updateRoute,
  deleteBeta, deleteRoute,
  reportRouteRemoved, retireWall,
  RESULT_META
};
