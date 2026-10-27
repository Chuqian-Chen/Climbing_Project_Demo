// 发布 Beta：三步向导 —— ① 选线（城市→区域→岩馆，支持在名录馆「新建线路」开荒）+ 素材
//                         ② 标题 + 三段拆解 + 易掉点  ③ 动作标签 / 适合身高 / 可见范围 → 发布
const api = require('../../utils/api');
const gradeUtil = require('../../utils/grade');

const HEIGHT_RANGES = [
  '不限', '150-160', '155-165', '160-170', '165-175',
  '170-180', '175-185', '180-190', '185-195'
];

Page({
  data: {
    // 选馆：城市 × 区域 × 岩馆 三列选择器
    gymPickerRange: [[], [], []],
    gymPickerValue: [0, 0, 0],
    gymId: '',
    gymLabel: '',
    // 选线 / 新建线路
    routeLabels: [],
    routeIdx: -1,
    hasRoutes: true,
    newRouteMode: false,
    newName: '',
    colorNames: [],
    colorIdx: -1,
    grades: gradeUtil.GRADE_LIST,
    gradeIdx: -1,
    // 内容
    media: [],
    title: '',
    caution: '',   // 易掉点提醒（选填，核心场景「要注意的点」的结构化字段）
    steps: [
      { phase: '起手', text: '' },
      { phase: '中段', text: '' },
      { phase: '收尾', text: '' }
    ],
    shownTags: [],
    tagsExpanded: false,
    pickedTags: [],
    heightRanges: HEIGHT_RANGES,
    heightIdx: 0,
    isPublic: true,
    showTips: false,
    // 向导
    step: 1,
    step1Ok: false,
    step2Ok: false,
    routeSummary: '',
    firstStep: '',
    canSubmit: false,
    routeLocked: false,
    lockedRouteText: ''
  },

  onLoad(options) {
    this.presetRouteId = options.routeId || '';
    this.editId = options.edit || '';   // 编辑模式：修改自己已发布的 Beta
    this.cities = [];
    this.tree = {}; // cityKey -> { districts: [名], gyms: { 区域名: [gym] } }
    this.colorKeys = Object.keys(gradeUtil.HOLD_COLORS);
    this.allTags = gradeUtil.MOVE_TAGS;
    this.setData({
      colorNames: this.colorKeys.map((k) => gradeUtil.HOLD_COLORS[k].name),
      shownTags: this.allTags.slice(0, 8)
    });

    api.getPublishGyms().then((res) => {
      this.cities = res.cities;
      res.cities.forEach((c) => {
        const cityGyms = res.gyms.filter((g) => g.city === c.key);
        const byDistrict = {};
        cityGyms.forEach((g) => {
          if (!byDistrict[g.district]) byDistrict[g.district] = [];
          byDistrict[g.district].push(g);
        });
        // 按预设顺序排区域，未收录的区域追加在后
        const order = (res.districtOrder && res.districtOrder[c.key]) || [];
        const districts = order.filter((d) => byDistrict[d])
          .concat(Object.keys(byDistrict).filter((d) => order.indexOf(d) < 0));
        this.tree[c.key] = { districts: districts, gyms: byDistrict };
      });

      // 默认选中：预选线路所在馆，否则第一城第一区第一家
      let ci = 0, di = 0, gi = 0, ri = -1;
      if (this.presetRouteId) {
        res.gyms.forEach((g) => {
          g.routes.forEach((r, idx) => {
            if (r.id !== this.presetRouteId) return;
            ci = Math.max(0, this.cities.findIndex((c) => c.key === g.city));
            const t = this.tree[g.city];
            di = Math.max(0, t.districts.indexOf(g.district));
            gi = Math.max(0, t.gyms[g.district].findIndex((x) => x.id === g.id));
            ri = idx;
          });
        });
      }
      this.applySelection(ci, di, gi, ri, !!this.presetRouteId && ri >= 0);
    });

    // 编辑模式：预填现有内容；线路与媒体不可改
    if (this.editId) {
      api.getBetaDetail(this.editId).then((res) => {
        const b = res.beta;
        if (!b || !b.isMine) {
          wx.showToast({ title: '只能编辑自己的 Beta', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
        const steps = this.data.steps.map((slot) => {
          const hit = (b.steps || []).find((s) => s.phase === slot.phase);
          return { phase: slot.phase, text: hit ? hit.text : '' };
        });
        const hf = b.heightFit || [];
        const rangeStr = hf.length === 2 ? hf[0] + '-' + hf[1] : '不限';
        const hIdx = Math.max(0, this.data.heightRanges.indexOf(rangeStr));
        this.setData({
          editMode: true,
          step: 2,
          editRouteText: (res.route ? res.route.fullName : b.routeName) || '',
          title: b.title || '',
          caution: b.caution || '',
          steps: steps,
          pickedTags: (b.moveTags || []).slice(0, 5),
          heightIdx: hIdx,
          isPublic: b.visibility !== 'private'
        }, () => this.checkSubmit());
      }).catch(() => {
        wx.showToast({ title: 'Beta 不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
      });
    }
  },

  // 应用选中的 城市/区域/岩馆，刷新线路选项
  applySelection(ci, di, gi, ri, lock) {
    const city = this.cities[ci];
    if (!city) return;
    const t = this.tree[city.key];
    const dIdx = Math.min(di, Math.max(t.districts.length - 1, 0));
    const district = t.districts[dIdx];
    const gyms = t.gyms[district] || [];
    const gIdx = Math.min(gi, Math.max(gyms.length - 1, 0));
    const gym = gyms[gIdx] || null;
    const routes = gym ? gym.routes : [];
    this.currentRoutes = routes;
    this.currentGradeSystem = (gym && gym.gradeSystem) || null;
    this.currentGradeBy = (gym && gym.gradeBy) || 'hold';
    this.tmpVal = [ci, dIdx, gIdx];
    const patch = {
      gymPickerRange: [
        this.cities.map((c) => c.name),
        t.districts,
        gyms.map((g) => g.name)
      ],
      gymPickerValue: [ci, dIdx, gIdx],
      gymId: gym ? gym.id : '',
      gymLabel: gym ? city.name + ' · ' + district + ' · ' + gym.name : '',
      routeLabels: routes.map((r) => r.label).concat(['＋ 新建线路']),
      hasRoutes: routes.length > 0,
      routeIdx: ri,
      newRouteMode: routes.length === 0 || (ri >= 0 && ri >= routes.length)
    };
    if (lock && ri >= 0 && routes[ri]) {
      patch.routeLocked = true;
      patch.lockedRouteText = gym.name + ' · ' + routes[ri].label;
    }
    this.setData(patch, () => this.checkSubmit());
  },
  unlockRoute() {
    this.setData({ routeLocked: false });
  },

  onGymColumn(e) {
    const col = e.detail.column;
    const val = e.detail.value;
    const tmp = this.tmpVal || [0, 0, 0];
    if (col === 0) {
      const city = this.cities[val];
      if (!city) return;
      const t = this.tree[city.key];
      const gyms = t.gyms[t.districts[0]] || [];
      this.tmpVal = [val, 0, 0];
      this.setData({
        'gymPickerRange[1]': t.districts,
        'gymPickerRange[2]': gyms.map((g) => g.name),
        gymPickerValue: [val, 0, 0]
      });
    } else if (col === 1) {
      const city = this.cities[tmp[0]];
      if (!city) return;
      const t = this.tree[city.key];
      const district = t.districts[val];
      const gyms = t.gyms[district] || [];
      this.tmpVal = [tmp[0], val, 0];
      this.setData({
        'gymPickerRange[2]': gyms.map((g) => g.name),
        gymPickerValue: [tmp[0], val, 0]
      });
    } else {
      this.tmpVal = [tmp[0], tmp[1], val];
    }
  },
  onGymChange(e) {
    const v = e.detail.value;
    this.applySelection(Number(v[0]), Number(v[1]), Number(v[2]), -1, false);
  },
  onRouteChange(e) {
    const i = Number(e.detail.value);
    this.setData({
      routeIdx: i,
      newRouteMode: i >= this.data.routeLabels.length - 1
    }, () => this.checkSubmit());
  },
  onNewName(e) {
    this.setData({ newName: e.detail.value }, () => this.checkSubmit());
  },
  onColorChange(e) {
    const colorIdx = Number(e.detail.value);
    const patch = { colorIdx: colorIdx };
    // 仅岩点色定级馆联动难度；tape=看标签色，sign=看难度牌，均不联动
    if (this.currentGradeSystem && this.currentGradeBy === 'hold') {
      const colorKey = this.colorKeys[colorIdx];
      const hit = this.currentGradeSystem.find((gs) => gs.color === colorKey);
      if (hit) {
        const gi = this.data.grades.indexOf(hit.grade);
        if (gi >= 0) patch.gradeIdx = gi;
      }
    }
    this.setData(patch, () => this.checkSubmit());
  },
  onGradeChange(e) {
    this.setData({ gradeIdx: Number(e.detail.value) }, () => this.checkSubmit());
  },

  chooseMedia() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      maxDuration: 60,
      success: (res) => {
        const media = res.tempFiles.map((f) => ({
          type: res.type === 'video' || f.fileType === 'video' ? 'video' : 'image',
          path: f.tempFilePath,
          thumb: f.thumbTempFilePath || f.tempFilePath,
          durText: f.duration ? this.formatDur(f.duration) : ''
        }));
        this.setData({ media: this.data.media.concat(media).slice(0, 9) });
      }
    });
  },
  formatDur(sec) {
    const s = Math.round(sec);
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  },
  removeMedia(e) {
    const i = e.currentTarget.dataset.index;
    const media = this.data.media.slice();
    media.splice(i, 1);
    this.setData({ media: media });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value }, () => this.checkSubmit());
  },
  onCautionInput(e) {
    this.setData({ caution: e.detail.value });
  },
  onStepInput(e) {
    const i = e.currentTarget.dataset.index;
    this.setData({ ['steps[' + i + '].text']: e.detail.value }, () => this.checkSubmit());
  },
  toggleTagsExpand() {
    const expanded = !this.data.tagsExpanded;
    this.setData({
      tagsExpanded: expanded,
      shownTags: expanded ? this.allTags : this.allTags.slice(0, 8)
    });
  },
  toggleTag(e) {
    const tag = e.currentTarget.dataset.tag;
    let picked = this.data.pickedTags.slice();
    if (picked.indexOf(tag) >= 0) picked = picked.filter((t) => t !== tag);
    else if (picked.length < 5) picked.push(tag);
    else {
      wx.showToast({ title: '最多选 5 个标签', icon: 'none' });
      return;
    }
    this.setData({ pickedTags: picked });
  },
  onHeightChange(e) {
    this.setData({ heightIdx: Number(e.detail.value) });
  },
  setPublic(e) {
    this.setData({ isPublic: e.currentTarget.dataset.v === '1' });
  },
  toggleTips() {
    this.setData({ showTips: !this.data.showTips });
  },

  // 每步是否填好 + 是否可发布；顺带算出顶部线路摘要与第 3 步预览
  checkSubmit() {
    const d = this.data;
    const hasStep = d.steps.some((s) => s.text.trim());
    const step2Ok = !!d.title.trim() && hasStep;
    const first = d.steps.find((s) => s.text.trim());
    let step1Ok;
    let summary;
    if (d.editMode) {
      // 编辑模式：线路已固定
      step1Ok = true;
      summary = d.editRouteText;
    } else if (d.newRouteMode) {
      // 真实口径：线路不命名，颜色+难度即身份
      step1Ok = !!d.gymId && d.colorIdx >= 0 && d.gradeIdx >= 0;
      summary = step1Ok ? d.colorNames[d.colorIdx] + '点 ' + d.grades[d.gradeIdx] + '（新建）· ' + d.gymLabel : '';
    } else {
      step1Ok = !!d.gymId && d.routeIdx >= 0 && d.routeIdx < d.routeLabels.length - 1;
      summary = step1Ok ? d.routeLabels[d.routeIdx] + ' · ' + d.gymLabel : '';
    }
    this.setData({
      step1Ok: step1Ok,
      step2Ok: step2Ok,
      canSubmit: step1Ok && step2Ok,
      routeSummary: summary,
      firstStep: first ? first.phase + '：' + first.text.trim() : ''
    });
  },

  /* ---------- 向导翻页 ---------- */
  stepBlocker(step) {
    if (step === 1 && !this.data.step1Ok) return '先选好岩馆和线路';
    if (step === 2 && !this.data.step2Ok) return '写个标题和至少一步拆解';
    return '';
  },
  setStep(n) {
    this.setData({ step: n });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  nextStep() {
    const block = this.stepBlocker(this.data.step);
    if (block) {
      wx.showToast({ title: block, icon: 'none' });
      return;
    }
    this.setStep(Math.min(3, this.data.step + 1));
  },
  prevStep() {
    // 编辑模式没有可改的第 1 步内容，但仍可回看线路说明
    this.setStep(Math.max(1, this.data.step - 1));
  },
  goStep(e) {
    const target = Number(e.currentTarget.dataset.s);
    // 往后跳要经过的每一步都得填好
    for (let s = this.data.step; s < target; s++) {
      const block = this.stepBlocker(s);
      if (block) {
        wx.showToast({ title: block, icon: 'none' });
        return;
      }
    }
    this.setStep(target);
  },

  submit() {
    const d = this.data;
    if (!d.canSubmit) {
      wx.showToast({ title: '请选好线路、填写标题和至少一步拆解', icon: 'none' });
      return;
    }

    // 编辑模式：只改内容字段，不动线路与媒体
    if (d.editMode) {
      const range = d.heightRanges[d.heightIdx];
      wx.showLoading({ title: '保存中…' });
      api.updateBeta(this.editId, {
        title: d.title.trim(),
        caution: d.caution.trim(),
        steps: d.steps.filter((s) => s.text.trim()),
        moveTags: d.pickedTags,
        heightFit: range === '不限' ? [] : range.split('-').map(Number),
        visibility: d.isPublic ? 'public' : 'private'
      }).then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      }).catch((e) => {
        wx.hideLoading();
        wx.showToast({ title: (e && e.secBlocked) ? e.message : '保存失败，请重试', icon: 'none' });
      });
      return;
    }
    const video = d.media.find((m) => m.type === 'video');
    const range = d.heightRanges[d.heightIdx];
    const payload = {
      type: video ? 'video' : 'text',
      videoDur: video ? video.durText : '',
      mediaCount: d.media.length,
      title: d.title.trim(),
      caution: d.caution.trim(),
      steps: d.steps.filter((s) => s.text.trim()),
      moveTags: d.pickedTags,
      heightFit: range === '不限' ? [] : range.split('-').map(Number),
      visibility: d.isPublic ? 'public' : 'private'
    };
    if (d.newRouteMode) {
      payload.newRoute = {
        gymId: d.gymId,
        name: '',
        color: this.colorKeys[d.colorIdx],
        grade: d.grades[d.gradeIdx]
      };
    } else {
      payload.routeId = this.currentRoutes[d.routeIdx].id;
    }
    wx.showLoading({ title: '发布中…' });
    const firstImg = d.media.find((m) => m.type === 'image');
    this.uploadMedia()
      .then((m) => {
        payload.imageFileIDs = m.images;
        payload.videoFileID = m.video;
        // 本地模式下持久化首图作为线路封面
        if (!m.images.length && firstImg) {
          payload.localImage = this.persistLocal(firstImg.path);
        }
        return api.publishBeta(payload);
      })
      .then((beta) => {
        wx.hideLoading();
        wx.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/route-detail/route-detail?id=' + beta.routeId });
        }, 800);
      })
      .catch((e) => {
        wx.hideLoading();
        wx.showToast({
          title: (e && e.secBlocked) ? e.message : '发布失败，请重试',
          icon: 'none'
        });
      });
  },

  persistLocal(temp) {
    try {
      return wx.getFileSystemManager().saveFileSync(temp);
    } catch (e) {
      return temp;
    }
  },

  // 素材上传云存储（未开通云时跳过，仅本地记录）
  uploadMedia() {
    const media = this.data.media;
    if (!wx.cloud || !media.length) return Promise.resolve({ images: [], video: '' });
    const ts = Date.now();
    const tasks = media.map((m, i) => {
      const ext = m.type === 'video' ? '.mp4' : '.jpg';
      return wx.cloud.uploadFile({
        cloudPath: 'beta/' + ts + '_' + i + ext,
        filePath: m.path
      }).then((r) => ({ type: m.type, fileID: r.fileID })).catch(() => null);
    });
    return Promise.all(tasks).then((rs) => {
      const ok = rs.filter(Boolean);
      const v = ok.find((x) => x.type === 'video');
      return {
        images: ok.filter((x) => x.type === 'image').map((x) => x.fileID),
        video: v ? v.fileID : ''
      };
    });
  }
});
