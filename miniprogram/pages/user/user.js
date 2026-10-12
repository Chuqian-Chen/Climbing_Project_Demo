// 岩友主页
const api = require('../../utils/api');
const flags = require('../../utils/flags');

Page({
  data: {
    social: flags.SOCIAL,
    loadFailed: false,
    user: null,
    homeGymName: '',
    betas: [],
    stats: null,
    following: false
  },

  onLoad(options) {
    this.userId = options.id;
  },

  onShow() {
    this.load();
  },

  load() {
    if (!this.userId) return Promise.resolve();
    return api.getUserPage(this.userId).then((res) => {
      wx.setNavigationBarTitle({ title: res.user.nickname });
      this.setData({
        user: res.user,
        homeGymName: res.homeGymName,
        betas: res.betas,
        stats: res.stats,
        following: res.following,
        loadFailed: false
      });
    }).catch(() => {
      this.setData({ loadFailed: true, user: null });
    });
  },

  goBackHome() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/home' });
  },

  toggleFollow() {
    api.toggleFollow(this.userId).then((res) => {
      this.setData({ following: res.following });
      wx.showToast({ title: res.following ? '已关注' : '已取消关注', icon: 'none' });
    });
  },

  onShareAppMessage() {
    const u = this.data.user || {};
    return {
      title: u.nickname + ' 的攀岩主页 · ' + (this.data.stats ? this.data.stats.betaCount : 0) + ' 条Beta',
      path: '/pages/user/user?id=' + this.userId
    };
  }
});
