// 岩馆详情：墙面 + 线路列表（点卡进详情，点 Beta 芯片就地预览）
const api = require('../../utils/api');
const gradeUtil = require('../../utils/grade');
const util = require('../../utils/helpers');

// 分级编辑输入解析："橙=V0" / "orange V0" / "橙色：V0" 每行一条
function parseGradeLines(text) {
  const byName = {};
  Object.keys(gradeUtil.HOLD_COLORS).forEach((k) => {
    byName[gradeUtil.HOLD_COLORS[k].name] = k;
    byName[k] = k;
  });
  const out = [];
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/[=＝:：\s]+/).filter(Boolean);
    const colorKey = parts.length >= 2 ? byName[parts[0].replace(/色$/, '')] : null;
    if (!colorKey) return { error: line };
    out.push({ color: colorKey, grade: parts[1].toUpperCase() });
  }
  return { list: out };
}

const GRADE_BY_OPTS = [
  { key: 'hold', label: '岩点颜色 = 难度' },
  { key: 'tape', label: '标签/胶带颜色 = 难度' },
  { key: 'sign', label: '难度牌写 V 几' }
];

const GRADE_BANDS = [
  { key: 'all', label: '全部难度' },
  { key: 'v0-2', label: 'V0-V2', min: 0, max: 2 },
  { key: 'v3-4', label: 'V3-V4', min: 3, max: 4 },
  { key: 'v5-6', label: 'V5-V6', min: 5, max: 6 },
  { key: 'v7+', label: 'V7+', min: 7, max: 99 }
];

Page({
  data: {
    loadFailed: false,
    gym: null,
    routes: [],
    shown: [],
    expandedId: '',    // 当前展开 Beta 预览的线路（手风琴：同时只展开一条）
    routeBetas: {},    // routeId -> { total, betas }
    rbLoading: false,
    wallPhotos: [],
    gradeSystem: [],
    wallId: 'all',
    bands: GRADE_BANDS,
    bandKey: 'all',
    onlyNew: false,
    sort: 'hot', // hot | new
    // 分级标准众包编辑（认证定线员）
    isSetter: false,
    editingGrade: false,
    egOpts: GRADE_BY_OPTS,
    egByIdx: 0,
    egLines: '',
    egNote: ''
  },

  onLoad(options) {
    this.gymId = options.id;
    // 支持岩馆桌贴小程序码场景：scene=gymId
    if (!this.gymId && options.scene) {
      this.gymId = decodeURIComponent(options.scene);
    }
  },

  onShow() {
    this.load();
  },

  /* ---------- 线路卡就地展开：该线的 Beta 预览 + 发布入口 ---------- */
  onRouteToggle(e) {
    const id = e.detail.id;
    if (this.data.expandedId === id) {
      this.setData({ expandedId: '' });
      return;
    }
    this.setData({ expandedId: id });
    if (!this.data.routeBetas[id]) {
      this.setData({ rbLoading: true });
      api.getRouteBetas(id).then((res) => {
        this.setData({ ['routeBetas.' + id]: res, rbLoading: false });
      }).catch(() => this.setData({ rbLoading: false }));
    }
  },
  goBeta(e) {
    wx.navigateTo({ url: '/pages/beta-detail/beta-detail?id=' + e.currentTarget.dataset.bid });
  },
  goRouteDetail(e) {
    wx.navigateTo({ url: '/pages/route-detail/route-detail?id=' + e.currentTarget.dataset.rid });
  },
  goRouteWall(e) {
    const rid = e.currentTarget.dataset.rid;
    const route = (this.data.routes || []).find((r) => r.id === rid);
    const wall = route && (this.data.wallPhotos || []).find((w) => w.id === route.wallId);
    if (wall && wall.photo) {
      wx.navigateTo({
        url: '/pages/wall-photo/wall-photo?gymId=' + this.gymId + '&wallId=' + route.wallId + '&highlight=' + rid
      });
      return;
    }
    wx.navigateTo({ url: '/pages/route-detail/route-detail?id=' + rid });
  },
  goPublishRoute(e) {
    wx.navigateTo({ url: '/pages/publish/publish?routeId=' + e.currentTarget.dataset.rid });
  },

  load() {
    if (!this.gymId) return Promise.resolve();
    return api.getGymDetail(this.gymId).then((res) => {
      wx.setNavigationBarTitle({ title: res.gym.name });
      this.setData({
        gym: res.gym,
        routes: res.routes,
        wallPhotos: res.walls || [],
        gradeSystem: res.gradeSystem || [],
        gradeNote: res.gradeNote || '',
        gradeBy: res.gradeBy || 'hold',
        isSetter: !!res.isSetter,
        loadFailed: false
      });
      this.applyFilter();
    }).catch(() => {
      this.setData({ loadFailed: true, gym: null });
    });
  },

  /* ---------- 分级标准众包编辑 ---------- */
  startGradeEdit() {
    const d = this.data;
    const lines = (d.gradeSystem || [])
      .map((gs) => {
        const c = gradeUtil.HOLD_COLORS[gs.color] || {};
        return (c.name || gs.color) + '=' + gs.grade;
      }).join('\n');
    let idx = GRADE_BY_OPTS.findIndex((o) => o.key === d.gradeBy);
    if (idx < 0) idx = 0;
    this.setData({ editingGrade: true, egByIdx: idx, egLines: lines, egNote: d.gradeNote || '' });
  },
  cancelGradeEdit() {
    this.setData({ editingGrade: false });
  },
  egByTap(e) {
    this.setData({ egByIdx: Number(e.currentTarget.dataset.i) });
  },
  egLinesInput(e) { this.setData({ egLines: e.detail.value }); },
  egNoteInput(e) { this.setData({ egNote: e.detail.value }); },
  saveGradeEdit() {
    const d = this.data;
    const parsed = parseGradeLines(d.egLines);
    if (parsed.error) {
      wx.showToast({ title: '看不懂这行：' + parsed.error + '（格式如 橙=V0）', icon: 'none' });
      return;
    }
    api.setGymGrading(this.gymId, {
      gradeBy: GRADE_BY_OPTS[d.egByIdx].key,
      gradeSystem: parsed.list,
      gradeNote: d.egNote.trim()
    }).then(() => {
      this.setData({ editingGrade: false });
      wx.showToast({ title: '已保存', icon: 'none' });
      this.load();
    }).catch((e) => {
      wx.showToast({
        title: (e && e.secBlocked) ? e.message : '保存失败，请重试',
        icon: 'none'
      });
    });
  },

  applyFilter() {
    const d = this.data;
    const band = GRADE_BANDS.find((b) => b.key === d.bandKey);
    let list = d.routes.slice();
    if (d.wallId !== 'all') list = list.filter((r) => r.wallId === d.wallId);
    if (band && band.key !== 'all') {
      list = list.filter((r) => {
        const n = parseInt(r.grade.replace(/[^0-9]/g, ''), 10) || 0;
        return n >= band.min && n <= band.max;
      });
    }
    if (d.onlyNew) list = list.filter((r) => r.isNew);
    if (d.sort === 'hot') {
      list.sort((a, b) => (b.sendsTotal + b.betaCount * 3) - (a.sendsTotal + a.betaCount * 3));
    } else {
      list.sort((a, b) => (a.setDate < b.setDate ? 1 : -1));
    }
    this.setData({ shown: list });
  },

  pickWall(e) {
    this.setData({ wallId: e.currentTarget.dataset.id });
    this.applyFilter();
  },
  pickBand(e) {
    this.setData({ bandKey: e.currentTarget.dataset.key });
    this.applyFilter();
  },
  toggleNew() {
    this.setData({ onlyNew: !this.data.onlyNew });
    this.applyFilter();
  },
  toggleSort() {
    this.setData({ sort: this.data.sort === 'hot' ? 'new' : 'hot' });
    this.applyFilter();
  },
  goWall(e) {
    wx.navigateTo({
      url: '/pages/wall-photo/wall-photo?gymId=' + this.gymId + '&wallId=' + e.currentTarget.dataset.id
    });
  },
  goShootWall() {
    const wall = (this.data.wallPhotos || [])[0];
    wx.navigateTo({
      url: '/pages/wall-photo/wall-photo?gymId=' + this.gymId + '&wallId=' + ((wall && wall.id) || 'w-main')
    });
  },
  goGymCheckin() {
    wx.navigateTo({ url: '/pages/checkin/checkin?gymId=' + this.gymId });
  },
  openMap() {
    util.openGymMap(this.data.gym);
  },
  goBackHome() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/home' });
  },

  onShareAppMessage() {
    const g = this.data.gym || {};
    return {
      title: g.name + ' · ' + (g.routeCount || 0) + ' 条线在墙，来磕！',
      path: '/pages/gym-detail/gym-detail?id=' + this.gymId
    };
  },
  onShareTimeline() {
    const g = this.data.gym || {};
    return { title: g.name + ' · 岩友Beta' };
  }
});
