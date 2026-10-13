// 岩馆列表：城市切换 + 定位排序 + 名录岩馆
const api = require('../../utils/api');
const cloudSync = require('../../utils/cloud-sync');
const util = require('../../utils/helpers');

Page({
  data: {
    gyms: [],
    shown: [],
    kw: '',
    cities: [],
    cityKey: 'bj',
    located: false,
    locationDenied: false,
    loading: true,
    loadError: ''
  },

  onLoad() {
    this.loc = null;
    this.setData({ cities: api.getCities() });
    this._boot = cloudSync.ensureInit();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 1 });
    }
    const go = () => {
      if (this._askedLoc) this.load();
      else {
        this._askedLoc = true;
        this.locate();
      }
    };
    if (this._boot) this._boot.then(go).catch(go);
    else go();
  },

  locate() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.loc = { latitude: res.latitude, longitude: res.longitude };
        const cityKey = api.nearestCityKey(this.loc) || this.data.cityKey;
        this.setData({ located: true, locationDenied: false, cityKey: cityKey });
        this.load();
      },
      fail: () => {
        this.loc = null;
        this.setData({ located: false, locationDenied: true });
        this.load();
      }
    });
  },

  load() {
    return api.getGyms(this.loc, this.data.cityKey).then((gyms) => {
      this.setData({ gyms: gyms, loading: false, loadError: '' });
      this.applyFilter();
    }).catch((e) => {
      this.setData({ loading: false, loadError: (e && e.message) || '加载失败' });
    });
  },

  applyFilter() {
    const kw = this.data.kw.trim().toLowerCase();
    const list = kw
      ? this.data.gyms.filter((g) =>
          (g.name + g.district + (g.area || '') + (g.address || '')).toLowerCase().indexOf(kw) >= 0)
      : this.data.gyms;
    this.setData({ shown: list });
  },

  onKw(e) {
    this.setData({ kw: e.detail.value });
    this.applyFilter();
  },

  pickCity(e) {
    this.setData({ cityKey: e.currentTarget.dataset.key });
    this.load();
  },

  onPullDownRefresh() {
    // 与首页一致：下拉时拉云端全量（能看到删除/重灌），再刷新列表
    cloudSync.refresh()
      .then(() => this.load())
      .then(() => wx.stopPullDownRefresh())
      .catch(() => wx.stopPullDownRefresh());
  },

  // 用户此前拒绝过定位时，引导去设置页开启
  openLocationSetting() {
    wx.openSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation']) this.locate();
      }
    });
  },

  retry() {
    this.setData({ loading: true, loadError: '' });
    this.locate();
  },

  goGym(e) {
    wx.navigateTo({ url: '/pages/gym-detail/gym-detail?id=' + e.currentTarget.dataset.id });
  },

  openMap(e) {
    const id = e.currentTarget.dataset.id;
    const gym = (this.data.shown || []).find((g) => g.id === id);
    util.openGymMap(gym);
  },

  onShareAppMessage() {
    return { title: '北京·上海 130+ 家岩馆名录，找馆磕线必备', path: '/pages/gyms/gyms' };
  },
  onShareTimeline() {
    return { title: '岩馆名录 · 岩友Beta' };
  }
});
