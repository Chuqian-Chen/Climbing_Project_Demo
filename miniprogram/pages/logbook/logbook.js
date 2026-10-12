// 足迹：打卡统计、热力图、难度金字塔、成就、时间线
const api = require('../../utils/api');

Page({
  data: {
    loading: true,
    stats: null,
    pyramid: [],
    heat: [],
    groups: [],
    badges: [],
    demoSeeded: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 2 });
    }
    this.load();
  },

  load() {
    return api.getLogbook().then((res) => {
      this.setData({
        loading: false,
        loadError: '',
        stats: res.stats,
        pyramid: res.pyramid,
        heat: res.heat,
        groups: res.groups,
        badges: res.badges,
        demoSeeded: res.demoSeeded
      });
    }).catch((e) => {
      this.setData({ loading: false, loadError: (e && e.message) || '加载失败' });
    });
  },

  retry() {
    this.setData({ loading: true, loadError: '' });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  goGyms() {
    wx.switchTab({ url: '/pages/gyms/gyms' });
  },

  seedDemo() {
    api.seedDemoCheckins().then(() => {
      wx.showToast({ title: '已载入演示打卡', icon: 'success' });
      this.load();
    });
  },

  goRoute(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/route-detail/route-detail?id=' + id });
  },

  // 长按打卡条目 → 删除（手滑打错卡的撤销通道；统计随之修正）
  onCheckinLongPress(e) {
    const kid = e.currentTarget.dataset.kid;
    if (!kid) return;
    wx.showModal({
      title: '删除这条打卡？',
      content: '完攀数、热力图等统计会随之修正，删除后不可恢复。',
      confirmText: '删除',
      confirmColor: '#e5484d',
      success: (r) => {
        if (!r.confirm) return;
        api.deleteCheckin(kid)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'none' });
            this.load();
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' }));
      }
    });
  },

  onShareAppMessage() {
    const s = this.data.stats || {};
    return {
      title: '我在岩友Beta已完攀 ' + (s.totalSends || 0) + ' 条线，最高 ' + (s.maxGrade || '-'),
      path: '/pages/home/home'
    };
  }
});
