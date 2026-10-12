// 线路详情：线路信息 + 难度共识 + Beta 列表 + 打卡动态
const api = require('../../utils/api');
const cloudSync = require('../../utils/cloud-sync');
const gradeUtil = require('../../utils/grade');

Page({
  data: {
    route: null,
    betas: [],
    shownBetas: [],
    checkins: [],
    reminderOn: false,
    onlyMyHeight: false,
    hasHeight: false,
    canEdit: false,
    gradeOpts: gradeUtil.GRADE_LIST,
    colorOpts: Object.keys(gradeUtil.HOLD_COLORS).map((k) => gradeUtil.HOLD_COLORS[k].name + '点')
  },

  onLoad(options) {
    this.routeId = options.id;
  },

  onShow() {
    this.load();
  },

  load() {
    if (!this.routeId) return Promise.resolve();
    return api.getRouteDetail(this.routeId).then((res) => {
      // 真实口径的完整身份：馆 · 墙 · 颜色点 V几
      wx.setNavigationBarTitle({ title: res.route.fullName || res.route.name });
      this.setData({
        route: res.route,
        betas: res.betas,
        checkins: res.checkins,
        reminderOn: res.reminderOn,
        wallRef: res.wallRef || null,
        analysis: res.analysis || null,
        analysisMoves: res.analysisMoves || null,
        hasHeight: !!res.hasHeight,
        canEdit: !!res.route.isMine
      });
      // 认证定线员也可修正任何线的难度/名称（服务端二次校验）
      if (!res.route.isMine) {
        api.getMy().then((my) => {
          if (my.profile && my.profile.isSetter) this.setData({ canEdit: true });
        });
      }
      this.applyBetaFilter();
    }).catch(() => {
      // 线路被删/已下架：给明确的兜底页而不是空白
      this.setData({ loadFailed: true });
    });
  },

  goBackHome() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/home' });
  },

  /* ---------- 线主/定线员：修改难度与名称 ---------- */
  onGradeEdit(e) {
    const g = this.data.gradeOpts[Number(e.detail.value)];
    if (!g || g === this.data.route.grade) return;
    api.updateRoute(this.routeId, { grade: g })
      .then(() => cloudSync.refresh())
      .then(() => this.load())
      .then(() => wx.showToast({ title: '难度已改为 ' + g, icon: 'none' }))
      .catch((err) => wx.showToast({ title: (err && err.message) || '修改失败', icon: 'none' }));
  },
  onColorEdit(e) {
    const keys = Object.keys(gradeUtil.HOLD_COLORS);
    const c = keys[Number(e.detail.value)];
    if (!c || c === this.data.route.color) return;
    api.updateRoute(this.routeId, { color: c })
      .then(() => cloudSync.refresh())
      .then(() => this.load())
      .then(() => wx.showToast({ title: '已改为' + gradeUtil.HOLD_COLORS[c].name + '点', icon: 'none' }))
      .catch((err) => wx.showToast({ title: (err && err.message) || '修改失败', icon: 'none' }));
  },

  deleteRouteTap() {
    wx.showModal({
      title: '删除这条线路？',
      content: '删除后不可恢复。若线上已有其他岩友的 Beta 或打卡，将自动改为「下架」；你自己挂在这条线上的 Beta 和打卡记录会一并移除。',
      confirmText: '删除',
      confirmColor: '#e5484d',
      success: (r) => {
        if (!r.confirm) return;
        api.deleteRoute(this.routeId)
          .then((res) => cloudSync.refresh().then(() => res))
          .then((res) => {
            wx.showToast({ title: res.mode === 'retired' ? '已下架（线上有他人内容）' : '已删除', icon: 'none' });
            setTimeout(() => wx.navigateBack(), 800);
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' }));
      }
    });
  },

  applyBetaFilter() {
    const d = this.data;
    let list = d.onlyMyHeight ? d.betas.filter((b) => b.heightMatch) : d.betas;
    // 默认把身高匹配的排前面（稳定排序，组内保持原热度序）——矮个子第一眼看到矮个子的解法
    if (!d.onlyMyHeight) {
      list = list.filter((b) => b.heightMatch).concat(list.filter((b) => !b.heightMatch));
    }
    this.setData({ shownBetas: list });
  },

  toggleHeightFilter() {
    this.setData({ onlyMyHeight: !this.data.onlyMyHeight });
    this.applyBetaFilter();
  },

  /* ---------- 互动 ---------- */
  vote(e) {
    const feel = e.currentTarget.dataset.feel;
    api.voteFeel(this.routeId, feel).then((route) => {
      this.setData({ route: route });
    });
  },

  toggleFav() {
    api.toggleFav(this.routeId).then((res) => {
      this.setData({ 'route.faved': res.faved });
      wx.showToast({ title: res.faved ? '已收藏' : '已取消收藏', icon: 'none' });
    });
  },

  // 众包换线报告：≥2 人报告后线路页出提示
  reportRemoved() {
    if (this.data.route.myReported) {
      wx.showToast({ title: '你已报告过，等其他岩友确认', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '报告已换线',
      content: '确认这条线已经被拆掉/换掉了吗？多位岩友报告后会提示所有人。',
      success: (r) => {
        if (!r.confirm) return;
        api.reportRouteRemoved(this.routeId).then(() => {
          wx.showToast({ title: '已报告，谢谢维护线路信息', icon: 'none' });
          this.load();
        });
      }
    });
  },

  // 拆线提醒：正式环境使用订阅消息，演示环境记录意向
  toggleReminder() {
    const doToggle = () => {
      api.toggleReminder(this.routeId).then((res) => {
        this.setData({ reminderOn: res.on });
        wx.showToast({
          title: res.on ? '拆线前会提醒你' : '已取消提醒',
          icon: 'none'
        });
      });
    };
    if (wx.requestSubscribeMessage) {
      wx.requestSubscribeMessage({
        // 正式环境替换为真实的订阅消息模板 ID
        tmplIds: ['DEMO_TMPL_ROUTE_REMOVE'],
        complete: doToggle
      });
    } else {
      doToggle();
    }
  },

  goCheckin() {
    wx.navigateTo({ url: '/pages/checkin/checkin?routeId=' + this.routeId });
  },
  previewPhoto() {
    if (this.data.route.photo) {
      wx.previewImage({ urls: [this.data.route.photo] });
    }
  },
  // 为这条线补照片：云存储共享，无云时本地保存
  addRoutePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const temp = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '保存中…' });
        const done = (p) => p
          .then(() => { wx.hideLoading(); this.load(); })
          .catch(() => { wx.hideLoading(); wx.showToast({ title: '保存失败', icon: 'none' }); });
        if (wx.cloud) {
          done(wx.cloud.uploadFile({
            cloudPath: 'routes/' + this.routeId + '_' + Date.now() + '.jpg',
            filePath: temp
          }).then((r) => api.setRoutePhoto(this.routeId, r.fileID, ''))
            .catch(() => api.setRoutePhoto(this.routeId, '', this.persistLocal(temp))));
        } else {
          done(api.setRoutePhoto(this.routeId, '', this.persistLocal(temp)));
        }
      }
    });
  },
  persistLocal(temp) {
    try {
      return wx.getFileSystemManager().saveFileSync(temp);
    } catch (e) {
      return temp;
    }
  },
  goWall() {
    const w = this.data.wallRef;
    if (!w) return;
    wx.navigateTo({
      url: '/pages/wall-photo/wall-photo?gymId=' + w.gymId + '&wallId=' + w.wallId + '&highlight=' + this.routeId
    });
  },
  goPublish() {
    wx.navigateTo({ url: '/pages/publish/publish?routeId=' + this.routeId });
  },
  goUser(e) {
    const id = e.currentTarget.dataset.id;
    if (id && id !== 'me') wx.navigateTo({ url: '/pages/user/user?id=' + id });
  },

  onShareAppMessage() {
    const r = this.data.route || {};
    const w = this.data.wallRef;
    return {
      title: '「' + r.name + '」' + r.grade + ' · ' + (r.betaCount || 0) + ' 条Beta等你研究',
      path: '/pages/route-detail/route-detail?id=' + this.routeId,
      imageUrl: r.photo || (w && w.photo) || ''
    };
  },
  onShareTimeline() {
    const r = this.data.route || {};
    return { title: '「' + r.name + '」' + r.grade + ' · 岩友Beta' };
  }
});
