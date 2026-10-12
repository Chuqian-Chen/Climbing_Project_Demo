// 自定义 TabBar：四个 Tab + 中央「发布」按钮
Component({
  data: {
    active: 0,
    items: [
      { type: 'tab', index: 0, path: '/pages/home/home', icon: '/assets/tabbar/home.png', iconOn: '/assets/tabbar/home-on.png', text: '首页' },
      { type: 'tab', index: 1, path: '/pages/gyms/gyms', icon: '/assets/tabbar/gyms.png', iconOn: '/assets/tabbar/gyms-on.png', text: '岩馆' },
      { type: 'publish' },
      { type: 'tab', index: 2, path: '/pages/logbook/logbook', icon: '/assets/tabbar/logbook.png', iconOn: '/assets/tabbar/logbook-on.png', text: '足迹' },
      { type: 'tab', index: 3, path: '/pages/profile/profile', icon: '/assets/tabbar/profile.png', iconOn: '/assets/tabbar/profile-on.png', text: '我的' }
    ]
  },
  methods: {
    onItem(e) {
      const item = e.currentTarget.dataset.item;
      if (!item) return;
      if (item.type === 'publish') {
        wx.navigateTo({ url: '/pages/publish/publish' });
        return;
      }
      if (item.index === this.data.active) return;
      wx.switchTab({ url: item.path });
    }
  }
});
