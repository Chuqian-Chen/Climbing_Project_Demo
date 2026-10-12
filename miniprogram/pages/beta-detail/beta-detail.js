// Beta 详情：先认线 / 走线，再学动作，底部跟练打卡
const api = require('../../utils/api');
const flags = require('../../utils/flags');
const cloudSync = require('../../utils/cloud-sync');

Page({
  data: {
    social: flags.SOCIAL,
    beta: null,
    route: null,
    wallRef: null,
    seqChips: [],
    comments: [],
    others: [],
    following: false,
    commentText: '',
    loadFailed: false
  },

  onLoad(options) {
    this.betaId = options.id;
  },

  onShow() {
    this.load();
  },

  load() {
    if (!this.betaId) return Promise.resolve();
    return api.getBetaDetail(this.betaId).then((res) => {
      this.setData({
        beta: res.beta,
        route: res.route,
        wallRef: res.wallRef || null,
        seqChips: res.seqChips || [],
        comments: res.comments,
        others: res.others,
        following: res.following,
        loadFailed: false
      });
    }).catch(() => {
      this.setData({ loadFailed: true, beta: null });
    });
  },

  deleteCommentTap(e) {
    const cid = e.currentTarget.dataset.cid;
    if (!cid) return;
    wx.showModal({
      title: '删除这条评论？',
      confirmText: '删除',
      confirmColor: '#e5484d',
      success: (r) => {
        if (!r.confirm) return;
        api.deleteComment(this.betaId, cid)
          .then(() => this.load())
          .catch((err) => wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' }));
      }
    });
  },

  editBetaTap() {
    wx.navigateTo({ url: '/pages/publish/publish?edit=' + this.betaId });
  },

  deleteBetaTap() {
    wx.showModal({
      title: '删除这条 Beta？',
      content: '删除后不可恢复，评论也会一并清除。',
      confirmText: '删除',
      confirmColor: '#e5484d',
      success: (r) => {
        if (!r.confirm) return;
        api.deleteBeta(this.betaId)
          .then(() => cloudSync.refresh())
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'none' });
            setTimeout(() => wx.navigateBack(), 800);
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' }));
      }
    });
  },

  startVideo() {
    this.setData({ videoStarted: true });
    wx.createVideoContext('beta-video', this).play();
  },

  previewImg(e) {
    const cur = e.currentTarget.dataset.src;
    wx.previewImage({ current: cur, urls: this.data.beta.imageFileIDs || [cur] });
  },

  playVideo() {
    wx.showModal({
      title: '演示环境',
      content: '演示数据未内置视频文件。接入云开发后，这里将播放作者上传的攀爬视频（云存储 + video 组件）。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  toggleLike() {
    api.toggleLike(this.betaId).then((res) => {
      const delta = res.liked ? 1 : -1;
      this.setData({
        'beta.liked': res.liked,
        'beta.likeCount': this.data.beta.likeCount + delta
      });
    });
  },

  toggleFollow() {
    const uid = this.data.beta.author.id;
    if (uid === 'me') {
      wx.showToast({ title: '这是你自己的 Beta', icon: 'none' });
      return;
    }
    api.toggleFollow(uid).then((res) => {
      this.setData({ following: res.following });
      wx.showToast({ title: res.following ? '已关注' : '已取消关注', icon: 'none' });
    });
  },

  goAuthor() {
    const uid = this.data.beta.author.id;
    if (uid !== 'me') wx.navigateTo({ url: '/pages/user/user?id=' + uid });
  },
  goRoute() {
    if (this.data.route) {
      wx.navigateTo({ url: '/pages/route-detail/route-detail?id=' + this.data.route.id });
    }
  },
  goWall() {
    const w = this.data.wallRef;
    const r = this.data.route;
    if (!w || !r) return;
    wx.navigateTo({
      url: '/pages/wall-photo/wall-photo?gymId=' + w.gymId + '&wallId=' + w.wallId + '&highlight=' + r.id
    });
  },
  goCheckin() {
    if (this.data.route) {
      wx.navigateTo({ url: '/pages/checkin/checkin?routeId=' + this.data.route.id });
    }
  },
  goBackHome() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/home' });
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value });
  },
  sendComment() {
    const text = (this.data.commentText || '').trim();
    if (!text) return;
    api.addComment(this.betaId, text).then((c) => {
      this.setData({
        comments: this.data.comments.concat([c]),
        commentText: '',
        'beta.commentCount': this.data.beta.commentCount + 1
      });
    }).catch((e) => {
      wx.showToast({
        title: (e && e.secBlocked) ? e.message : '发送失败，请重试',
        icon: 'none'
      });
    });
  },

  onShareAppMessage() {
    const b = this.data.beta || {};
    const img = (b.imageFileIDs && b.imageFileIDs[0]) ||
      (b.routeVisual && b.routeVisual.src) || '';
    return {
      title: b.title + '（' + (b.routeName || '') + ' ' + (b.routeGrade || '') + '）',
      path: '/pages/beta-detail/beta-detail?id=' + this.betaId,
      imageUrl: img
    };
  },
  onShareTimeline() {
    const b = this.data.beta || {};
    return { title: b.title + ' · 岩友Beta' };
  }
});
