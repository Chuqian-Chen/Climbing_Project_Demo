// 馆方合作：说明 + 联系方式
Page({
  copyContact() {
    wx.setClipboardData({
      data: 'chloe.c.chuqian@gmail.com',
      success: () => wx.showToast({ title: '邮箱已复制', icon: 'none' })
    });
  },
  onShareAppMessage() {
    return { title: '岩友Beta · 馆方合作', path: '/pages/partner/partner' };
  }
});
