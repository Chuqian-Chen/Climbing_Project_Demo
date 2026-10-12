// 首页：Beta 瀑布流为主 + 附近岩馆紧凑条
const api = require('../../utils/api');
const cloudSync = require('../../utils/cloud-sync');
const gradeUtil = require('../../utils/grade');

// 难度筛选档（与馆详情线路筛选一致的分档）
const GRADE_BANDS = [
  { key: 'all', label: '全部', min: -1, max: 99 },
  { key: 'v02', label: 'V0-V2', min: 0, max: 2 },
  { key: 'v34', label: 'V3-V4', min: 3, max: 4 },
  { key: 'v56', label: 'V5-V6', min: 5, max: 6 },
  { key: 'v7', label: 'V7+', min: 7, max: 99 }
];

Page({
  onLoad() {
    this._boot = cloudSync.ensureInit();
  },

  data: {
    loading: true,
    onboarded: true,
    todayCount: 0,
    projectRoute: null,
    hotBetas: [],
    newRoutes: [],
    gyms: [],
    gymCounts: null,
    gradeBands: GRADE_BANDS,
    bandKey: 'all',
    loadError: ''
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 0 });
    }
    const run = () => this.load();
    if (this._boot) this._boot.then(run).catch(run);
    else run();
  },

  // 静默定位：仅在用户已授权时获取（不弹授权框，不打扰），失败返回 null
  silentLocation() {
    if (this._loc) return Promise.resolve(this._loc);
    return new Promise((resolve) => {
      wx.getSetting({
        success: (res) => {
          if (!res.authSetting['scope.userLocation']) return resolve(null);
          wx.getLocation({
            type: 'gcj02',
            success: (loc) => { this._loc = loc; resolve(loc); },
            fail: () => resolve(null)
          });
        },
        fail: () => resolve(null)
      });
    });
  },


  load() {
    return this.silentLocation().then((loc) => api.getHome(loc)).then((res) => {
      this.setData({
        loading: false,
        onboarded: res.onboarded,
        todayCount: res.todayCount,
        projectRoute: res.projectRoute,
        hotBetas: res.hotBetas,
        newRoutes: res.newRoutes,
        gyms: res.gyms,
        gymCounts: res.gymCounts,
        loadError: ''
      });
      this.applyBand();
    }).catch((e) => {
      this.setData({ loading: false, loadError: (e && e.message) || '加载失败' });
    });
  },

  // 按难度档过滤 + 双列瀑布流分列（奇偶近似均衡）
  applyBand() {
    const band = GRADE_BANDS.find((b) => b.key === this.data.bandKey) || GRADE_BANDS[0];
    const list = (this.data.hotBetas || []).filter((b) => {
      if (band.key === 'all') return true;
      const gi = gradeUtil.gradeIndex(b.routeGrade);
      return gi >= band.min && gi <= band.max;
    });
    const colL = [];
    const colR = [];
    list.forEach((b, i) => (i % 2 === 0 ? colL : colR).push(b));
    this.setData({ betaColL: colL, betaColR: colR, bandEmpty: !list.length });
  },

  pickBand(e) {
    this.setData({ bandKey: e.currentTarget.dataset.key }, () => this.applyBand());
  },

  retry() {
    this.setData({ loadError: '' });
    this.load();
  },

  onPullDownRefresh() {
    // 下拉刷新时重新同步云端
    cloudSync.refresh()
      .then(() => this.load())
      .then(() => wx.stopPullDownRefresh())
      .catch(() => wx.stopPullDownRefresh());
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },
  goGym(e) {
    wx.navigateTo({ url: '/pages/gym-detail/gym-detail?id=' + e.currentTarget.dataset.id });
  },
  goGyms() {
    wx.switchTab({ url: '/pages/gyms/gyms' });
  },
  goProject() {
    if (!this.data.projectRoute) return;
    wx.navigateTo({ url: '/pages/route-detail/route-detail?id=' + this.data.projectRoute.id });
  },
  goProfile() {
    api.markOnboarded().then(() => {
      wx.switchTab({ url: '/pages/profile/profile' });
    });
  },
  dismissOnboard() {
    api.markOnboarded().then(() => this.setData({ onboarded: true }));
  },

  onShareAppMessage() {
    return {
      title: '岩友Beta — 抱石打卡记录 & 攀爬笔记',
      path: '/pages/home/home'
    };
  },
  onShareTimeline() {
    return { title: '岩友Beta — 抱石打卡记录 & 攀爬笔记' };
  }
});
