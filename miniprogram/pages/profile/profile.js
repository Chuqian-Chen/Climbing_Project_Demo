// 我的：攀岩档案（微信头像昵称合规获取）+ 我的内容 + 设置
const api = require('../../utils/api');
const flags = require('../../utils/flags');

Page({
  data: {
    social: flags.SOCIAL,
    profile: null,
    myBetas: [],
    favRoutes: [],
    following: [],
    checkinCount: 0,
    gyms: [],
    gymNames: [],
    gymIndex: -1,
    tab: 'beta', // beta | fav | follow
    editing: false,
    editForm: null
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 3 });
    }
    this.load();
    // 定线员认证状态（审核通过会自动点亮 isSetter）
    api.checkSetterStatus().then((st) => {
      this.setData({ setterStatus: st });
      if (st === 'approved') this.load();
    });
  },

  load() {
    return api.getMy().then((res) => {
      const gymNames = res.gyms.map((g) => g.name);
      let gymIndex = -1;
      res.gyms.forEach((g, i) => {
        if (g.id === res.profile.homeGymId) gymIndex = i;
      });
      this.setData({
        profile: res.profile,
        myBetas: res.myBetas,
        favRoutes: res.favRoutes,
        following: res.following,
        checkinCount: res.checkinCount,
        gyms: res.gyms,
        gymNames: gymNames,
        gymIndex: gymIndex,
        loadError: ''
      });
    }).catch((e) => {
      this.setData({ loadError: (e && e.message) || '加载失败' });
    });
  },

  switchContentTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  /* ---------- 档案编辑 ---------- */
  startEdit() {
    this.setData({
      editing: true,
      editForm: {
        nickname: this.data.profile.nickname,
        avatarUrl: this.data.profile.avatarUrl,
        height: this.data.profile.height || '',
        armSpan: this.data.profile.armSpan || '',
        intro: this.data.profile.intro || ''
      }
    });
  },
  cancelEdit() {
    this.setData({ editing: false });
  },
  // 微信合规头像获取
  onChooseAvatar(e) {
    this.setData({ 'editForm.avatarUrl': e.detail.avatarUrl });
  },
  onNickInput(e) {
    this.setData({ 'editForm.nickname': e.detail.value });
  },
  onHeightInput(e) {
    this.setData({ 'editForm.height': e.detail.value });
  },
  onSpanInput(e) {
    this.setData({ 'editForm.armSpan': e.detail.value });
  },
  onIntroInput(e) {
    this.setData({ 'editForm.intro': e.detail.value });
  },
  // 定线员中心：注册申请/审核进度/工作台统一入口（独立页面）
  goSetterCenter() {
    wx.navigateTo({ url: '/pages/setter-center/setter-center' });
  },

  goPartner() {
    wx.navigateTo({ url: '/pages/partner/partner' });
  },
  onGymChange(e) {
    const i = Number(e.detail.value);
    this.setData({ gymIndex: i });
    api.saveProfile({ homeGymId: this.data.gyms[i].id });
  },
  saveEdit() {
    const f = this.data.editForm;
    api.saveProfile({
      nickname: (f.nickname || '').trim(),
      avatarUrl: f.avatarUrl,
      height: Number(f.height) || 0,
      armSpan: Number(f.armSpan) || 0,
      intro: (f.intro || '').trim()
      // isSetter 不再由表单控制：认证状态只能走申请审核（applySetter/checkSetterStatus）
    }).then(() => {
      this.setData({ editing: false });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.load();
    }).catch((e) => {
      wx.showToast({
        title: (e && e.secBlocked) ? e.message : '保存失败，请重试',
        icon: 'none'
      });
    });
  },

  /* ---------- 跳转 ---------- */
  goUser(e) {
    wx.navigateTo({ url: '/pages/user/user?id=' + e.currentTarget.dataset.id });
  },
  goRoute(e) {
    wx.navigateTo({ url: '/pages/route-detail/route-detail?id=' + e.currentTarget.dataset.id });
  },
  goPublish() {
    wx.navigateTo({ url: '/pages/publish/publish' });
  },
  goLogbook() {
    wx.switchTab({ url: '/pages/logbook/logbook' });
  },

  /* ---------- 设置 ---------- */
  showAbout() {
    wx.showModal({
      title: '关于岩友Beta',
      content: '抱石打卡记录与攀爬笔记工具（演示版）。个人攀爬记录可选择公开，供其他岩友参考。\n\n安全提示：攀岩有风险，Beta 仅供参考，请在自身能力范围内攀爬，注意落点与结组保护。\n\n当前为演示数据，接入云开发后即为真实数据。',
      showCancel: false,
      confirmText: '知道了'
    });
  },
  // 管理员：向云数据库灌入演示数据（幂等，已有数据默认跳过）
  // 管理员/开发操作已收纳到独立页面（普通用户不需要看到危险操作）
  goDataAdmin() {
    wx.navigateTo({ url: '/pages/data-admin/data-admin' });
  },

  onShareAppMessage() {
    return { title: '岩友Beta — 抱石打卡记录 & 攀爬笔记', path: '/pages/home/home' };
  }
});
