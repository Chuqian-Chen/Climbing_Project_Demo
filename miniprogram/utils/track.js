// 轻埋点：关键漏斗事件 → 云端 events 集合
// 设计约束（免费额度友好）：批量上报（8 条一包或 15s 一冲）、可采样、云不可用静默丢弃。
// 页面级访问路径用微信自带「数据分析」，这里只记业务漏斗事件。
const flags = require('./flags');

let queue = [];
let timer = null;
let sessionId = '';

function sid() {
  if (!sessionId) sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return sessionId;
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  if (typeof wx === 'undefined' || !wx.cloud) return;
  try {
    wx.cloud.database().collection('events').add({
      data: { sid: sid(), events: batch, mtime: Date.now() }
    }).catch(() => {});
  } catch (e) { /* ignore */ }
}

// track('view_route', { routeId: 'r1' })
function track(name, props) {
  if (!flags.TRACK) return;
  if (flags.TRACK_SAMPLE < 1 && Math.random() > flags.TRACK_SAMPLE) return;
  queue.push({ n: name, p: props || {}, t: Date.now() });
  if (queue.length >= 8) {
    flush();
  } else if (!timer) {
    timer = setTimeout(flush, 15000);
  }
}

module.exports = { track, flush };
