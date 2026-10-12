// 订阅消息：模板 ID 在 flags.SUBSCRIBE_TMPLS 配置（mp 后台申请）
// 未配置时所有调用静默 no-op，不影响任何流程
const flags = require('./flags');

// ask('weekly') → 弹订阅授权（一次性订阅：每次发送前都需用户点过一次）
function ask(kind) {
  const id = (flags.SUBSCRIBE_TMPLS || {})[kind];
  if (!id || typeof wx === 'undefined' || !wx.requestSubscribeMessage) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [id],
      complete: (res) => resolve(res && res[id] === 'accept')
    });
  });
}

module.exports = { ask };
