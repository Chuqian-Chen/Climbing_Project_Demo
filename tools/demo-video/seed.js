// 录屏用的初始本地数据（写入小程序 storage：yanyoubeta_state_v1）
// - 个人档案 + 近两个月的打卡记录：让「足迹」页的热力图 / 金字塔 / 成就有内容
// - TA山 真实墙照与圈点：来自 cloudfunctions/initDb/real-content.js（真实用户标注），
//   墙照用 docs/tashan.jpg；日期按「今天」滚动，避免演示时线路已过拆线日
const path = require('path');

const REAL = require(path.resolve(__dirname, '../../cloudfunctions/initDb/real-content.js'));

const STORE_KEY = 'yanyoubeta_state_v1';

function day(offset) {
  const t = new Date();
  t.setDate(t.getDate() + offset);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
}

// 9 条完攀 + 3 条磕线；刻意不含「Flash V4+」，录屏时打卡一条 V4 闪送会解锁新成就
// 按时间正序（store 里新打卡追加在末尾，首页「继续磕线」取最后一条磕线中）
const HISTORY = [
  [50, 'r204', 'attempt', 3], [43, 'r301', 'flash', 1], [36, 'r306', 'attempt', 4],
  [29, 'r203', 'top', 7], [24, 'r303', 'top', 5], [22, 'r302', 'top', 2],
  [17, 'r202', 'top', 4], [15, 'r201', 'flash', 1], [10, 'r104', 'attempt', 6],
  [8, 'r102', 'top', 2], [4, 'r101', 'flash', 1], [2, 'r103', 'top', 3]
];

function buildState() {
  const checkins = HISTORY.map(([ago, routeId, result, attempts], i) => ({
    id: 'k_seed' + i, userId: 'me', routeId, result, attempts, note: '', date: day(-ago)
  }));
  const myRoutes = REAL.ROUTES.map((r) => {
    const o = Object.assign({}, r, { setDate: day(-6), removeDate: day(24) });
    delete o._id;
    return o;
  });
  const walls = {};
  REAL.WALLS.forEach((w) => {
    const o = Object.assign({}, w, {
      photoFileID: '',
      photoPath: 'sim-asset://docs/tashan.jpg',
      updatedAt: day(-1),
      updatedAtTs: Date.now() - 86400000
    });
    delete o._id;
    walls[w.key] = o;
  });
  return {
    profile: {
      nickname: '小攀', avatarUrl: '', emoji: '🧗', height: 165, armSpan: 167,
      homeGymId: 'g1', intro: '周三周六固定磕线，主攻平衡线', isSetter: false
    },
    onboarded: true,
    checkins,
    myBetas: [],
    myRoutes,
    walls,
    routePhotos: {},
    likes: {},
    favs: { r105: true },
    follows: {},
    comments: {},
    feels: {},
    reminders: {},
    gymMeta: {},
    routeReports: {},
    retiredWalls: {},
    searchHistory: ['挂脚跟', 'V4'],
    demoSeeded: true
  };
}

function seedScript() {
  return 'window.__SIM_SEED__ = ' + JSON.stringify({ [STORE_KEY]: buildState() }) + ';\n';
}

module.exports = { buildState, seedScript, STORE_KEY };
