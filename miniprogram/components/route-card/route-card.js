// 线路卡片
Component({
  // 让 app.wxss / 页面样式进入组件（真机默认样式隔离，全局工具类会失效）
  options: { styleIsolation: 'apply-shared' },
  properties: {
    route: { type: Object, value: null },
    open: { type: Boolean, value: false },
    previewable: { type: Boolean, value: false }
  },
  methods: {
    onTap() {
      const r = this.data.route;
      if (!r) return;
      wx.navigateTo({ url: '/pages/route-detail/route-detail?id=' + r.id });
    },
    onPreview() {
      const r = this.data.route;
      if (!r) return;
      this.triggerEvent('preview', { id: r.id });
    }
  }
});
