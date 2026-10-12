// 墙面照片：整墙照片浏览 + 线路点位标注 + 快速建线 + AI 自动圈点（KAYA 式）
const api = require('../../utils/api');
const gradeUtil = require('../../utils/grade');
const holdDetect = require('../../utils/hold-detect');
const cloudSync = require('../../utils/cloud-sync');

Page({
  data: {
    gymName: '',
    wallName: '',
    photo: '',
    markers: [],
    holds: {},
    holdType: 'hand', // 当前标注模式：hand 手点 / foot 脚点
    routeLabels: [],
    editMode: false,
    pendingIdx: -1,
    pendingRouteId: '',
    selectedId: '',
    highlightId: '',
    segs: [],
    segColor: '',
    // 快速建线
    showCreate: false,
    tapeLabels: null,
    qcTapeIdx: -1,
    colorNames: [],
    qcColorIdx: -1,
    grades: gradeUtil.GRADE_LIST,
    qcGradeIdx: -1,
    qcName: ''
  },

  onLoad(options) {
    this.gymId = options.gymId;
    this.wallId = options.wallId;
    this.routes = [];
    this.gradeSystem = null;
    this.colorKeys = Object.keys(gradeUtil.HOLD_COLORS);
    this.setData({
      highlightId: options.highlight || '',
      selectedId: options.highlight || '',
      colorNames: this.colorKeys.map((k) => gradeUtil.HOLD_COLORS[k].name)
    });
  },

  onShow() {
    this.load();
  },

  load() {
    return api.getWallPhoto(this.gymId, this.wallId).then((res) => {
      wx.setNavigationBarTitle({ title: res.wallName + ' · 墙面' });
      this.routes = res.routes;
      this.gradeSystem = res.gradeSystem;
      this.gradeBy = res.gradeBy || 'hold';
      // 胶带定级馆：展示「标签颜色→难度」选择器
      if (res.gradeBy === 'tape' && res.gradeSystem) {
        this.setData({
          tapeLabels: res.gradeSystem.map((gs) => {
            const c = gradeUtil.HOLD_COLORS[gs.color] || {};
            return (c.name || gs.color) + '标 → ' + gs.grade;
          })
        });
      }
      const hid = this.data.highlightId || this.data.selectedId;
      const mk = hid ? (res.markers || []).find((m) => m.routeId === hid) : null;
      const holds = hid ? ((res.holds || {})[hid] || []).filter((h) => !h.f && h.label) : [];
      this.setData({
        gymName: res.gymName,
        wallName: res.wallName,
        photo: res.photo,
        photoIsCloud: String(res.photo).indexOf('cloud://') === 0,
        markers: res.markers,
        holds: res.holds || {},
        routeLabels: res.routes.map((r) => r.label),
        isSetter: !!res.isSetter,
        loadFailed: false,
        selectedId: hid || '',
        selectedName: mk ? (mk.name || '') : '',
        selectedGrade: mk ? (mk.grade || '') : '',
        selectedBetaCount: mk ? (mk.betaCount || 0) : 0,
        selectedSeq: holds.map((h) => h.label).join(' → ')
      }, () => this.refreshSegs());
    }).catch(() => {
      this.setData({ loadFailed: true });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  toggleEdit() {
    this.setData({
      editMode: !this.data.editMode,
      pendingIdx: -1,
      pendingRouteId: '',
      selectedId: ''
    }, () => this.refreshSegs());
  },

  // 整墙换线（认证定线员）：批量下架本墙全部在线线路
  retireWall() {
    wx.showModal({
      title: '整墙换线',
      content: '将把这面墙上所有在线线路批量标记为「已下架」（云端所有人可见），墙面照片和圈点保留。换线后重新建线即可。确定？',
      confirmColor: '#e5484d',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中…' });
        api.retireWall(this.gymId, this.wallId).then((res) => {
          wx.hideLoading();
          wx.showToast({
            title: res.demo ? '本地线路已下架（演示）' : '已下架 ' + (res.retired || 0) + ' 条线',
            icon: 'none'
          });
          this.load();
        }).catch((e) => {
          wx.hideLoading();
          wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' });
        });
      }
    });
  },
  onPickRoute(e) {
    const i = Number(e.detail.value);
    this.setData({
      pendingIdx: i,
      pendingRouteId: this.routes[i] ? this.routes[i].id : ''
    }, () => this.refreshSegs());
  },

  // 手点/脚点标注模式切换（Stokt 惯例：手脚分开标；脚点不参与手序）
  setHoldType(e) {
    this.setData({ holdType: e.currentTarget.dataset.t });
  },

  // 就地改当前标注线路的难度（线主/定线员，服务端校验）
  onEditGrade(e) {
    const g = this.data.grades[Number(e.detail.value)];
    const route = this.routes[this.data.pendingIdx];
    if (!route || !g) return;
    api.updateRoute(route.id, { grade: g })
      .then(() => cloudSync.refresh())
      .then(() => this.load())
      .then(() => wx.showToast({ title: '难度已改为 ' + g, icon: 'none' }))
      .catch((err) => wx.showToast({ title: (err && err.message) || '修改失败', icon: 'none' }));
  },

  // 选中线路的相邻岩点连线（像参考图那样一笔勾出整条线）
  refreshSegs() {
    const d = this.data;
    const rid = d.editMode ? d.pendingRouteId : d.selectedId;
    // 连线只连手点序列（脚点是补充信息，不进"一笔勾出"的攀爬路径）
    const holds = ((d.holds || {})[rid] || []).filter((h) => !h.f);
    if (!rid || holds.length < 2) {
      if (d.segs && d.segs.length) this.setData({ segs: [] });
      return;
    }
    const mk = d.markers.find((m) => m.routeId === rid);
    wx.createSelectorQuery().select('#wall-img').boundingClientRect((rect) => {
      if (!rect || !rect.width) return;
      const pts = holds.map((h) => ({
        x: (h.x / 100) * rect.width,
        y: (h.y / 100) * rect.height
      }));
      const segs = [];
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        segs.push({
          left: (pts[i - 1].x + pts[i].x) / 2 - len / 2,
          top: (pts[i - 1].y + pts[i].y) / 2,
          len: Math.round(len),
          angle: Math.round(Math.atan2(dy, dx) * 180 / Math.PI)
        });
      }
      this.setData({ segs: segs, segColor: mk ? mk.colorHex : '#ffffff' });
    }).exec();
  },
  onImgLoad() {
    this.refreshSegs();
  },
  // 浏览：岩点圈只作展示（选中后才出现）；编辑：点圆圈弹出改/删
  onRingTap(e) {
    if (!this.data.editMode) return;
    const rid = e.currentTarget.dataset.rid;
    const idx = e.currentTarget.dataset.idx;
    if (rid !== this.data.pendingRouteId) return;
    const hold = ((this.data.holds || {})[rid] || [])[idx] || {};
    const items = [
      hold.s ? '取消起步点标记' : '设为起步点',
      hold.f ? '改为手点' : '改为脚点',
      '删除这个点'
    ];
    wx.showActionSheet({
      itemList: items,
      success: (r) => {
        const done = () => this.load();
        if (r.tapIndex === 0) {
          api.toggleWallHoldStart(this.gymId, this.wallId, rid, idx).then(done);
        } else if (r.tapIndex === 1) {
          api.toggleWallHoldFoot(this.gymId, this.wallId, rid, idx).then(done);
        } else if (r.tapIndex === 2) {
          api.deleteWallHold(this.gymId, this.wallId, rid, idx).then(done);
        }
      }
    });
  },

  // 清空当前线路的全部圈点标注（原长按徽章手势的按钮化入口）
  clearLine() {
    const rid = this.data.pendingRouteId;
    if (!rid) return;
    wx.showModal({
      title: '清空这条线的标注？',
      content: '将移除这条线在墙面上的全部圈点，线路本身保留，可重新标注。',
      confirmText: '清空',
      confirmColor: '#e5484d',
      success: (r) => {
        if (!r.confirm) return;
        api.removeWallMarker(this.gymId, this.wallId, rid).then(() => this.load());
      }
    });
  },

  // 撤销当前线路最后一个圈点
  undoHold() {
    const rid = this.data.pendingRouteId;
    if (!rid) return;
    api.undoWallHold(this.gymId, this.wallId, rid).then(() => this.load());
  },

  /* ---------- 快速建线（定线员工作流：拍墙 → 建线 → 点位标注） ---------- */
  toggleCreate() {
    this.setData({ showCreate: !this.data.showCreate });
  },
  onQcColor(e) {
    const idx = Number(e.detail.value);
    const patch = { qcColorIdx: idx };
    // 难度以手选为准；岩点色定级馆仅在还没手选难度时带出参考值
    if (this.gradeSystem && this.gradeBy === 'hold' && this.data.qcGradeIdx < 0) {
      const hit = this.gradeSystem.find((gs) => gs.color === this.colorKeys[idx]);
      if (hit) {
        const gi = this.data.grades.indexOf(hit.grade);
        if (gi >= 0) patch.qcGradeIdx = gi;
      }
    }
    this.setData(patch);
  },
  // 胶带定级馆：标签色仅作参考（馆内可能有映射表之外的标签色），不覆盖已手选的难度
  onQcTape(e) {
    const i = Number(e.detail.value);
    const gs = this.gradeSystem && this.gradeSystem[i];
    if (!gs) return;
    const patch = { qcTapeIdx: i };
    if (this.data.qcGradeIdx < 0) {
      const gi = this.data.grades.indexOf(gs.grade);
      if (gi >= 0) patch.qcGradeIdx = gi;
    }
    this.setData(patch);
  },
  onQcGrade(e) {
    this.setData({ qcGradeIdx: Number(e.detail.value) });
  },
  createRoute() {
    const d = this.data;
    if (d.qcColorIdx < 0 || d.qcGradeIdx < 0) {
      wx.showToast({ title: '选一下颜色和难度', icon: 'none' });
      return;
    }
    const colorKey = this.colorKeys[d.qcColorIdx];
    // 真实口径：线路不命名，身份 = 墙面+岩点颜色+难度（显示名自动生成）
    api.createRoute({
      gymId: this.gymId,
      wallId: this.wallId,
      name: '',
      color: colorKey,
      grade: d.grades[d.qcGradeIdx]
    }).then((route) => {
      return this.load().then(() => {
        const i = this.routes.findIndex((r) => r.id === route.id);
        this.setData({
          editMode: true,
          showCreate: false,
          pendingIdx: i,
          pendingRouteId: route.id,
          qcColorIdx: -1,
          qcGradeIdx: -1,
          qcName: ''
        });
        wx.showToast({ title: '建好了，逐个点出这条线的岩点', icon: 'none' });
      });
    }).catch((e) => {
      wx.showToast({
        title: (e && e.secBlocked) ? e.message : '建线失败，请重试',
        icon: 'none'
      });
    });
  },

  /* ---------- 上传/更换整墙照片 ---------- */
  choosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const temp = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '保存中…' });
        const finish = (p) => p
          .then(() => { wx.hideLoading(); this.load(); })
          .catch((e) => {
            wx.hideLoading();
            wx.showToast({
              title: (e && e.secBlocked) ? e.message : '保存失败',
              icon: 'none'
            });
          });
        if (wx.cloud) {
          // 优先云存储（全体岩友可见），失败降级本地；安检拦截不降级
          finish(
            wx.cloud.uploadFile({
              cloudPath: 'walls/' + this.gymId + '_' + this.wallId + '_' + Date.now() + '.jpg',
              filePath: temp
            })
              .then((r) => api.setWallPhoto(this.gymId, this.wallId, r.fileID, ''))
              .catch((e) => {
                if (e && e.secBlocked) throw e;
                return api.setWallPhoto(this.gymId, this.wallId, '', this.persistLocal(temp));
              })
          );
        } else {
          finish(api.setWallPhoto(this.gymId, this.wallId, '', this.persistLocal(temp)));
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

  /* ---------- 标注 ---------- */
  onImgTap(e) {
    const d = this.data;
    if (!d.editMode) {
      if (d.selectedId) this.selectRoute(d.selectedId);
      return;
    }
    if (d.pendingIdx < 0) {
      wx.showToast({ title: '先在下方选择要标注的线路', icon: 'none' });
      return;
    }
    const route = this.routes[d.pendingIdx];
    const q = wx.createSelectorQuery();
    q.select('#wall-img').boundingClientRect();
    q.selectViewport().scrollOffset();
    q.exec((res) => {
      const rect = res[0];
      const scroll = res[1] || { scrollTop: 0, scrollLeft: 0 };
      if (!rect || !rect.width) return;
      // e.detail.x/y 是页面坐标，rect 是视口坐标，需补滚动偏移
      const px = e.detail.x - scroll.scrollLeft - rect.left;
      const py = e.detail.y - scroll.scrollTop - rect.top;
      const x = Math.max(2, Math.min(98, (px / rect.width) * 100));
      const y = Math.max(2, Math.min(98, (py / rect.height) * 100));
      // 连续圈点：每点一下给这条线加一个岩点圈（按当前手/脚模式）
      api.setWallHold(this.gymId, this.wallId, route.id,
        Math.round(x * 10) / 10, Math.round(y * 10) / 10,
        this.data.holdType === 'foot' ? 'f' : ''
      ).then(() => {
        wx.vibrateShort({ type: 'light' });
        this.load();
      });
    });
  },

  // ✨ AI 自动圈点：客户端 canvas 读像素跑检测（本地/云端照片均可，毫秒级）
  aiAnnotate() {
    const route = this.routes[this.data.pendingIdx];
    if (!route) {
      wx.showToast({ title: '先选择要标注的线路', icon: 'none' });
      return;
    }
    const existing = (this.data.holds[route.id] || []).length;
    const doRun = () => {
      wx.showLoading({ title: 'AI 识别中…' });
      this.runDetect(route.color)
        .then((holds) => {
          if (!holds.length) throw new Error('未识别到该颜色的岩点');
          return api.setWallHolds(this.gymId, this.wallId, route.id, holds)
            .then(() => holds.length);
        })
        .then((n) => {
          wx.hideLoading();
          wx.showToast({ title: '圈出 ' + n + ' 个候选点，长按可删/标起步', icon: 'none' });
          this.load();
        })
        .catch((e) => {
          wx.hideLoading();
          wx.showToast({ title: (e && e.message) || 'AI 识别失败', icon: 'none' });
        });
    };
    if (existing > 0) {
      wx.showModal({
        title: 'AI 自动圈点',
        content: '该线路已有 ' + existing + ' 个圈注，AI 结果将替换现有标注。继续？',
        success: (r) => { if (r.confirm) doRun(); }
      });
    } else {
      doRun();
    }
  },

  // 把照片画进隐藏 canvas，取像素跑检测
  runDetect(colorKey) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: this.data.photo,
        success: (info) => {
          const q = wx.createSelectorQuery();
          q.select('#detect-canvas').fields({ node: true }).exec((res) => {
            if (!res || !res[0] || !res[0].node) {
              reject(new Error('画布初始化失败'));
              return;
            }
            const canvas = res[0].node;
            const DW = 360;
            const DH = Math.round(DW * info.height / info.width);
            canvas.width = DW;
            canvas.height = DH;
            const ctx = canvas.getContext('2d');
            const img = canvas.createImage();
            img.onload = () => {
              ctx.drawImage(img, 0, 0, DW, DH);
              try {
                const data = ctx.getImageData(0, 0, DW, DH);
                resolve(holdDetect.detect(data, colorKey));
              } catch (e) {
                reject(new Error('读取像素失败'));
              }
            };
            img.onerror = () => reject(new Error('照片加载失败'));
            img.src = info.path;
          });
        },
        fail: () => reject(new Error('照片信息获取失败'))
      });
    });
  },

  // 编辑态长按圆圈：切换起步点标记
  onRingLongPress(e) {
    if (!this.data.editMode) return;
    const rid = e.currentTarget.dataset.rid;
    const idx = e.currentTarget.dataset.idx;
    api.toggleWallHoldStart(this.gymId, this.wallId, rid, idx).then(() => {
      wx.vibrateShort({ type: 'light' });
      this.load();
    });
  },

  onMarkerTap(e) {
    if (this.data.editMode) return;
    this.selectRoute(e.currentTarget.dataset.id);
  },

  selectRoute(id) {
    if (!id) return;
    if (this.data.selectedId === id) {
      this.setData({
        selectedId: '',
        selectedName: '',
        selectedGrade: '',
        selectedSeq: '',
        selectedBetaCount: 0
      }, () => this.refreshSegs());
      return;
    }
    const mk = this.data.markers.find((m) => m.routeId === id) || {};
    const holds = ((this.data.holds || {})[id] || []).filter((h) => !h.f && h.label);
    this.setData({
      selectedId: id,
      selectedName: mk.name || '',
      selectedGrade: mk.grade || '',
      selectedBetaCount: mk.betaCount || 0,
      selectedSeq: holds.map((h) => h.label).join(' → ')
    }, () => this.refreshSegs());
  },

  goSelectedRoute() {
    if (!this.data.selectedId) return;
    wx.navigateTo({ url: '/pages/route-detail/route-detail?id=' + this.data.selectedId });
  },
  goSelectedCheckin() {
    if (!this.data.selectedId) return;
    wx.navigateTo({ url: '/pages/checkin/checkin?routeId=' + this.data.selectedId });
  },
  onMarkerLongPress(e) {
    if (!this.data.editMode) return;
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这个标记？',
      success: (r) => {
        if (r.confirm) {
          api.removeWallMarker(this.gymId, this.wallId, id).then(() => this.load());
        }
      }
    });
  },

  onShareAppMessage() {
    return {
      title: this.data.gymName + ' · ' + this.data.wallName + ' 整墙找线',
      path: '/pages/wall-photo/wall-photo?gymId=' + this.gymId + '&wallId=' + this.wallId
    };
  }
});
