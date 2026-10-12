// 线路卡片
Component({
  // 让 app.wxss / 页面样式进入组件（真机默认样式隔离，全局工具类会失效）
  options: { styleIsolation: 'apply-shared' },
  properties: {
    route: { type: Object, value: null },
    // 展开模式（岩馆页用）：点击不跳详情，抛 toggle 事件由页面展开 Beta 预览区
    expandable: { type: Boolean, value: false }
  },
  methods: {
    onTap() {
      const r = this.data.route;
      if (!r) return;
      if (this.properties.expandable) {
        this.triggerEvent('toggle', { id: r.id });
        return;
      }
      wx.navigateTo({ url: '/pages/route-detail/route-detail?id=' + r.id });
    }
  }
});
