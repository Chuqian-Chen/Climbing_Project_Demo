// 打卡：记录完攀 → 生成 Canvas 打卡海报 → 保存/分享
const subscribe = require('../../utils/subscribe');
const api = require('../../utils/api');

Page({
  data: {
    route: null,
    result: 'top',       // flash | top | attempt
    attempts: 1,
    feel: '',            // soft | fair | hard
    note: '',
    done: false,
    doneInfo: null,
    posterPath: ''
  },

  onLoad(options) {
    this.routeId = options.routeId;
    if (!this.routeId) {
      wx.showToast({ title: '缺少线路参数', icon: 'none' });
      return;
    }
    api.getRouteDetail(this.routeId).then((res) => {
      this.myTodayCount = res.myTodayCount || 0;
      this.setData({ route: res.route });
    }).catch(() => {
      // 线路被下架/重灌后不存在：给出明确提示而不是白屏
      this.setData({ loadFailed: true });
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/home' });
  },

  previewPhoto() {
    if (this.data.route && this.data.route.photo) {
      wx.previewImage({ urls: [this.data.route.photo] });
    }
  },

  setResult(e) {
    const r = e.currentTarget.dataset.r;
    this.setData({
      result: r,
      attempts: r === 'flash' ? 1 : this.data.attempts
    });
  },
  addAttempt() {
    if (this.data.result === 'flash') return;
    this.setData({ attempts: Math.min(this.data.attempts + 1, 99) });
  },
  minusAttempt() {
    if (this.data.result === 'flash') return;
    this.setData({ attempts: Math.max(this.data.attempts - 1, 1) });
  },
  setFeel(e) {
    const f = e.currentTarget.dataset.f;
    this.setData({ feel: this.data.feel === f ? '' : f });
  },
  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  submit() {
    // 今天已打过这条线：温和确认，避免误触重复记录
    if (this.myTodayCount > 0 && !this.dupConfirmed) {
      wx.showModal({
        title: '今天已打过这条线',
        content: '再记一条也可以（比如又刷了一把），继续吗？',
        confirmText: '继续打卡',
        success: (r) => {
          if (r.confirm) {
            this.dupConfirmed = true;
            this.submit();
          }
        }
      });
      return;
    }
    const d = this.data;
    api.addCheckin({
      routeId: this.routeId,
      result: d.result,
      attempts: d.attempts,
      feel: d.feel,
      note: d.note.trim()
    }).then((res) => {
      this.setData({ done: true, doneInfo: res });
      api.recommendNext(this.routeId).then((list) => this.setData({ nextRoutes: list }));
      wx.vibrateShort({ type: 'medium' });
      // 顺手请求「每周小结」订阅（模板未配置时静默跳过）
      subscribe.ask('weekly');
    }).catch((e) => {
      wx.showToast({
        title: (e && e.secBlocked) ? e.message : '打卡失败，请重试',
        icon: 'none'
      });
    });
  },

  /* ---------- Canvas 打卡海报 ---------- */
  genPoster() {
    wx.showLoading({ title: '生成中…' });
    const query = wx.createSelectorQuery();
    query.select('#poster').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0]) {
        wx.hideLoading();
        wx.showToast({ title: '画布初始化失败', icon: 'none' });
        return;
      }
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2) || 2;
      const W = 300;
      const H = 480;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);

      this.drawPoster(ctx, W, H);

      wx.canvasToTempFilePath({
        canvas: canvas,
        success: (r) => this.setData({ posterPath: r.tempFilePath }),
        fail: () => wx.showToast({ title: '生成失败', icon: 'none' }),
        complete: () => wx.hideLoading()
      });
    });
  },

  drawPoster(ctx, W, H) {
    const info = this.data.doneInfo;
    const route = info.route;
    const k = info.checkin;

    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1b1e28');
    bg.addColorStop(1, '#2d3242');
    ctx.fillStyle = bg;
    this.roundRect(ctx, 0, 0, W, H, 16);
    ctx.fill();

    // 装饰圆
    ctx.fillStyle = 'rgba(255,107,53,0.14)';
    ctx.beginPath();
    ctx.arc(W - 30, 40, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,107,53,0.08)';
    ctx.beginPath();
    ctx.arc(20, H - 90, 90, 0, Math.PI * 2);
    ctx.fill();

    // 品牌
    ctx.fillStyle = '#ff8a5c';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('岩友Beta · 打卡', 24, 40);

    // 结果
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(k.resultText, 24, 96);

    // 线路名
    let name = route.name;
    if (name.length > 10) name = name.slice(0, 10) + '…';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('「' + name + '」', 24, 140);

    // 难度徽章
    ctx.fillStyle = route.gradeColor;
    this.roundRect(ctx, 24, 156, 52, 26, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(route.grade, 34, 175);

    // 岩点颜色圆
    ctx.fillStyle = route.colorHex;
    ctx.beginPath();
    ctx.arc(100, 169, 11, 0, Math.PI * 2);
    ctx.fill();

    // 岩馆信息
    ctx.fillStyle = '#9aa1b2';
    ctx.font = '12px sans-serif';
    ctx.fillText(route.gymName + ' · ' + route.wallName, 24, 210);

    // 尝试次数
    const tryText = k.result === 'flash'
      ? '一把过，手感火热'
      : (k.result === 'top' ? k.attempts + ' 次尝试后完攀' : '已尝试 ' + k.attempts + ' 次，下次就送');
    ctx.fillText(tryText, 24, 232);

    // 日期
    ctx.fillText(k.date + ' · 今日第 ' + info.todayCount + ' 条打卡', 24, 254);

    // 分隔线
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(24, 290);
    ctx.lineTo(W - 24, 290);
    ctx.stroke();

    // 引言
    ctx.fillStyle = '#c8ccd6';
    ctx.font = '12px sans-serif';
    ctx.fillText('每一次脱落，都是在测量', 24, 330);
    ctx.fillText('自己与顶点的距离。', 24, 350);

    // 小程序码占位
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    this.roundRect(ctx, W - 88, H - 100, 64, 64, 10);
    ctx.stroke();
    ctx.fillStyle = '#9aa1b2';
    ctx.font = '9px sans-serif';
    ctx.fillText('小程序码', W - 80, H - 64);
    ctx.fillText('长按识别 · 一起磕线', 24, H - 60);
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  savePoster() {
    if (!this.data.posterPath) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterPath,
      success: () => wx.showToast({ title: '已保存，去朋友圈晒吧', icon: 'success' }),
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('auth') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存到相册',
            confirmText: '去设置',
            success: (r) => { if (r.confirm) wx.openSetting(); }
          });
        }
      }
    });
  },

  previewPoster() {
    if (this.data.posterPath) {
      wx.previewImage({ urls: [this.data.posterPath] });
    }
  },

  backToRoute() {
    wx.navigateBack();
  },
  // 推荐的下一条：替换当前打卡页，返回键直接回到原线路
  goNext(e) {
    wx.redirectTo({ url: '/pages/route-detail/route-detail?id=' + e.currentTarget.dataset.id });
  },
  goLogbook() {
    wx.switchTab({ url: '/pages/logbook/logbook' });
  },

  onShareAppMessage() {
    const r = this.data.route || {};
    return {
      title: '我刚在「' + (r.name || '') + '」' + (r.grade || '') + ' 打了卡！',
      path: '/pages/route-detail/route-detail?id=' + this.routeId
    };
  }
});
