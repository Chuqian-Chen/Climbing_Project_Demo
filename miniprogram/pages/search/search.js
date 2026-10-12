// 搜索：线路 / 岩馆 / Beta
const api = require('../../utils/api');

Page({
  data: {
    kw: '',
    history: [],
    hotTags: [],
    searched: false,
    searching: false,
    searchError: '',
    tab: 'route', // route | gym | beta
    result: { routes: [], gyms: [], users: [], betas: [] }
  },

  onLoad() {
    api.getSearchMeta().then((meta) => {
      this.setData({ history: meta.history, hotTags: meta.hotTags });
    });
  },

  onInput(e) {
    this.setData({ kw: e.detail.value });
    if (!e.detail.value) this.setData({ searched: false });
  },

  doSearch(e) {
    const kw = (e && e.currentTarget && e.currentTarget.dataset.kw) || this.data.kw;
    const q = String(kw || '').trim();
    if (!q) return;
    this.setData({ kw: q, searching: true, searchError: '' });
    api.search(q).then((result) => {
      // 自动跳到有结果的分类
      let tab = this.data.tab;
      const order = [
        ['route', result.routes.length],
        ['gym', result.gyms.length],
        ['beta', result.betas.length]
      ];
      const current = order.find((o) => o[0] === tab);
      if (!current || !current[1]) {
        const first = order.find((o) => o[1] > 0);
        if (first) tab = first[0];
      }
      this.setData({ result: result, searched: true, tab: tab, searching: false });
      api.getSearchMeta().then((meta) => this.setData({ history: meta.history }));
    }).catch((e) => {
      this.setData({ searching: false, searched: true, searchError: (e && e.message) || '搜索失败' });
    });
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  clearHistory() {
    api.clearSearchHistory().then(() => this.setData({ history: [] }));
  },

  goGym(e) {
    wx.navigateTo({ url: '/pages/gym-detail/gym-detail?id=' + e.currentTarget.dataset.id });
  }
});
