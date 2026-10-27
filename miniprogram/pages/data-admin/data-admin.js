// 数据管理（管理员/开发用）：从「我的」设置区收纳进来的危险操作，普通用户不需要进这里
const api = require('../../utils/api');
const cloudSync = require('../../utils/cloud-sync');

Page({
  initCloud() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '初始化云数据库',
      content: '将在云环境中创建集合并写入演示数据（岩馆名录/线路/Beta 等，已有数据的集合自动跳过）。继续？',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '初始化中…' });
        wx.cloud.callFunction({ name: 'initDb', data: {} })
          .then((res) => cloudSync.refresh().then(() => res).catch(() => res))
          .then((res) => {
            wx.hideLoading();
            wx.showModal({
              title: '初始化完成',
              content: JSON.stringify(res.result).slice(0, 400),
              showCancel: false
            });
          })
          .catch((e) => {
            wx.hideLoading();
            wx.showModal({
              title: '初始化失败',
              content: (e && e.errMsg) || String(e),
              showCancel: false
            });
          });
      }
    });
  },

  // 管理员：清空并按最新数据重灌云端演示集合（区域/分级标准/定线员等新字段需要重灌才生效）
  reseedCloud() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '重灌云演示数据',
      content: '将把演示数据（演示馆/假用户/假Beta/假打卡与岩馆名录）刷新为最新版。只按已知演示 id 精确删除后重灌，真实用户创建的线路、Beta、打卡、墙面照全部不受影响。确定？',
      confirmColor: '#e5484d',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '重灌中…' });
        wx.cloud.callFunction({ name: 'initDb', data: { force: true } })
          .then((res) => cloudSync.refresh().then(() => res).catch(() => res))
          .then((res) => {
            wx.hideLoading();
            wx.showModal({
              title: '重灌完成',
              content: JSON.stringify(res.result).slice(0, 400),
              showCancel: false
            });
          })
          .catch((e) => {
            wx.hideLoading();
            wx.showModal({ title: '失败', content: (e && e.errMsg) || String(e), showCancel: false });
          });
      }
    });
  },

  // 上线切换：清除云端演示数据（假用户/假Beta/演示馆），保留真实用户内容与墙面文档
  prodCloud() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '切换为生产数据',
      content: '将删除云端全部演示内容（演示馆/假用户/假Beta/假打卡），只保留真实岩馆名录和真实用户产生的数据（墙面照、开荒线路、打卡等不受影响）。上线前执行一次即可。确定？',
      confirmColor: '#e5484d',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '切换中…' });
        wx.cloud.callFunction({ name: 'initDb', data: { mode: 'prod' } })
          .then((res) => cloudSync.refresh().then(() => res).catch(() => res))
          .then((res) => {
            wx.hideLoading();
            wx.showModal({
              title: '已切换为生产数据',
              content: JSON.stringify(res.result).slice(0, 400),
              showCancel: false
            });
          })
          .catch((e) => {
            wx.hideLoading();
            wx.showModal({ title: '失败', content: (e && e.errMsg) || String(e), showCancel: false });
          });
      }
    });
  },

  resetDemo() {
    wx.showModal({
      title: '重置演示数据',
      content: '将清空你的档案、打卡、Beta、收藏等本地数据，恢复到初始演示状态。确定？',
      confirmColor: '#e5484d',
      success: (res) => {
        if (!res.confirm) return;
        api.resetDemo().then(() => {
          wx.showToast({ title: '已重置', icon: 'success' });
        });
      }
    });
  }
});
