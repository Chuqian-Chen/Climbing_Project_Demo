// 数据源切换层：云端同步成功后自动替换 mock 数据（api.js 无感切换）
// 读取优先级：云端快照 > 本地演示数据
const mockData = require('./mock-data');

let cloud = null;        // { GYMS, ROUTES, BETAS, USERS, CHECKINS, COMMENTS, WALLS }
const syncCallbacks = [];

function setCloudData(d) {
  cloud = d;
  syncCallbacks.forEach((cb) => {
    try { cb(); } catch (e) { /* ignore */ }
  });
}

function onSync(cb) {
  if (typeof cb === 'function') syncCallbacks.push(cb);
}

function isCloud() {
  return !!cloud;
}

module.exports = {
  setCloudData,
  onSync,
  isCloud,
  // 演示岩馆（云端时 = 快照里的 isDemo 岩馆）
  get GYMS() { return cloud ? cloud.GYMS.filter((g) => g.isDemo) : mockData.GYMS; },
  // 全量岩馆（云端时已含名录馆，本地时由 api.js 自行合并 gym-directory）
  get ALLGYMS() { return cloud ? cloud.GYMS : null; },
  get ROUTES() { return cloud ? cloud.ROUTES : mockData.ROUTES; },
  get BETAS() { return cloud ? cloud.BETAS : mockData.BETAS; },
  get USERS() { return cloud ? cloud.USERS : mockData.USERS; },
  get CHECKINS() { return cloud ? cloud.CHECKINS : mockData.CHECKINS; },
  get COMMENTS() { return cloud ? cloud.COMMENTS : mockData.COMMENTS; },
  get WALLS() { return cloud ? cloud.WALLS : []; },
  get ROUTEPHOTOS() { return (cloud && cloud.ROUTEPHOTOS) || []; },
  get ROUTEREPORTS() { return (cloud && cloud.ROUTEREPORTS) || []; }
};
