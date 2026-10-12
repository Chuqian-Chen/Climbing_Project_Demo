// Beta 瀑布流卡片（小红书式：大图/封面优先，双列布局用）
const api = require('../../utils/api');

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    beta: { type: Object, value: null }
  },
  methods: {
    onTap() {
      const b = this.data.beta;
      if (!b) return;
      wx.navigateTo({ url: '/pages/beta-detail/beta-detail?id=' + b.id });
    },
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
