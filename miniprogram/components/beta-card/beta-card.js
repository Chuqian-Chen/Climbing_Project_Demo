// Beta 卡片
const api = require('../../utils/api');

Component({
  // 让 app.wxss / 页面样式进入组件（真机默认样式隔离，全局工具类会失效）
  options: { styleIsolation: 'apply-shared' },
  properties: {
    beta: { type: Object, value: null },
    showRoute: { type: Boolean, value: true }
  },
  methods: {
    onTap() {
      const b = this.data.beta;
      if (!b) return;
      wx.navigateTo({ url: '/pages/beta-detail/beta-detail?id=' + b.id });
    },
    // 卡片上直接点赞
    onLike() {
      const b = this.data.beta;
      if (!b) return;
      api.toggleLike(b.id).then((res) => {
        this.setData({
          'beta.liked': res.liked,
          'beta.likeCount': b.likeCount + (res.liked ? 1 : -1)
        });
      });
    }
  }
});
