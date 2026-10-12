// 本地状态持久化（演示模式的数据底座；接入云开发后由云端替代）
const KEY = 'yanyoubeta_state_v1';

const DEFAULTS = {
  profile: {
    nickname: '',
    avatarUrl: '',
    emoji: '🧗',
    height: 0,       // cm，0 = 未填写
    armSpan: 0,      // cm，0 = 未填写
    homeGymId: '',
    intro: '',
    isSetter: false
  },
  onboarded: false,
  checkins: [],      // 我的打卡 {id, routeId, result, attempts, feel, note, date}
  myBetas: [],       // 我发布的 Beta
  myRoutes: [],      // 我新建的线路（在名录岩馆开荒）
  walls: {},         // 墙面照片文档 key(gymId_wallId) -> {photoFileID/photoPath, markers[]}
  routePhotos: {},   // 线路照片 routeId -> {fileID, path}
  likes: {},         // betaId -> true
  favs: {},          // routeId -> true
  follows: {},       // userId -> true
  comments: {},      // betaId -> [{id, userId:'me', text, date}]
  feels: {},         // routeId -> 'soft' | 'fair' | 'hard'（我的难度感受投票）
  reminders: {},     // routeId -> true（拆线提醒订阅意向）
  gymMeta: {},       // gymId -> {gradeBy, gradeSystem, gradeNote}（众包分级标准，本地覆盖层）
  routeReports: {},  // routeId -> true（我报告过"已换线"）
  retiredWalls: {},  // gymId_wallId -> true（本地整墙换线覆盖层，演示模式也能下架 mock 线）
  searchHistory: []
};

function get() {
  let s = null;
  try {
    s = wx.getStorageSync(KEY);
  } catch (e) {
    s = null;
  }
  if (!s || typeof s !== 'object') s = {};
  // 合并默认值，保证字段齐全
  const merged = JSON.parse(JSON.stringify(DEFAULTS));
  Object.keys(s).forEach((k) => {
    if (k === 'profile') {
      merged.profile = Object.assign({}, DEFAULTS.profile, s.profile || {});
    } else {
      merged[k] = s[k];
    }
  });
  return merged;
}

function save(state) {
  try {
    wx.setStorageSync(KEY, state);
  } catch (e) {
    // 存储失败不阻断流程
  }
  return state;
}

// 读-改-存
function update(fn) {
  const state = get();
  fn(state);
  return save(state);
}

function reset() {
  try {
    wx.removeStorageSync(KEY);
  } catch (e) { /* ignore */ }
}

module.exports = { get, save, update, reset };
