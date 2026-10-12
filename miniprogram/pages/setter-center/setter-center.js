// 定线员中心：普通用户免注册，定线员走独立注册申请 → 审核 → 工作台
const api = require('../../utils/api');

Page({
  data: {
    status: 'loading',        // loading | none | pending | approved
    gymName: '',              // 已认证/申请中的所属岩馆
    profile: null,
    // 注册申请表单
    form: { realName: '', contact: '', note: '' },
    gyms: [],
    gymNames: [],
    gymIndex: -1,
    yearsOpts: ['1 年以内', '1-3 年', '3-5 年', '5 年以上'],
    yearsIndex: -1,
    submitting: false
  },

  onShow() {
    this.load();
  },

  load() {
    api.getMy().then((res) => this.setData({ profile: res.profile }));
    api.getPublishGyms().then((res) => {
      const gs = (res && res.gyms) || [];
      this.setData({ gyms: gs, gymNames: gs.map((g) => g.name) });
    });
    api.getSetterInfo().then((info) => {
      this.setData({
        status: info.status === 'rejected' ? 'none' : info.status,
        rejected: info.status === 'rejected',
        gymName: info.gymName || ''
      });
    });
  },

  onNameInput(e) { this.setData({ 'form.realName': e.detail.value }); },
  onContactInput(e) { this.setData({ 'form.contact': e.detail.value }); },
  onNoteInput(e) { this.setData({ 'form.note': e.detail.value }); },
  onGymChange(e) { this.setData({ gymIndex: Number(e.detail.value) }); },
  onYearsChange(e) { this.setData({ yearsIndex: Number(e.detail.value) }); },

  submit() {
    const d = this.data;
    if (d.submitting) return;
    const realName = (d.form.realName || '').trim();
    if (!realName) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return; }
    if (d.gymIndex < 0) { wx.showToast({ title: '请选择常驻岩馆', icon: 'none' }); return; }
    if (d.yearsIndex < 0) { wx.showToast({ title: '请选择定线年限', icon: 'none' }); return; }
    const contact = (d.form.contact || '').trim();
    if (!contact) { wx.showToast({ title: '请填写联系方式（审核需要）', icon: 'none' }); return; }

    this.setData({ submitting: true });
    api.applySetter({
      gymName: d.gymNames[d.gymIndex],
      realName: realName,
      years: d.yearsOpts[d.yearsIndex],
      contact: contact,
      note: (d.form.note || '').trim()
    }).then((res) => {
      this.setData({
        submitting: false,
        status: res.status,
        gymName: d.gymNames[d.gymIndex]
      });
      wx.showToast({
        title: res.status === 'approved' ? '已生效（演示模式）' : '已提交，审核通过后自动生效',
        icon: 'none'
      });
    }).catch((e) => {
      this.setData({ submitting: false });
      wx.showToast({ title: e.secBlocked ? e.message : '提交失败，请稍后再试', icon: 'none' });
    });
  },

  // 工作台：进入所属岩馆（墙面标注 / 分级标准修正都在馆详情内）
  goMyGym() {
    const g = this.data.gyms.find((x) => x.name === this.data.gymName);
    if (!g) {
      wx.showToast({ title: '未找到岩馆，去岩馆列表进入', icon: 'none' });
      wx.switchTab({ url: '/pages/gyms/gyms' });
      return;
    }
    wx.navigateTo({ url: '/pages/gym-detail/gym-detail?id=' + g.id });
  },

  goPartner() {
    wx.navigateTo({ url: '/pages/partner/partner' });
  }
});
