// 功能开关（上线策略集中管理）
// SOCIAL：关注/粉丝等社交入口。类目按「体育-运动健身」记录工具申报，
// 上线期弱化社交面默认关闭；相关代码全部保留，改 true 即恢复。
module.exports = {
  SOCIAL: false,

  // 腾讯位置服务 key（lbs.qq.com 免费申请）。
  // 填入后：天气改走腾讯接口（apis.map.qq.com 可过域名白名单）；
  // 为空时：天气走 Open-Meteo（仅开发者工具可用，正式版静默无天气）。
  TENCENT_LBS_KEY: '',

  // 轻埋点：关键漏斗事件批量上报 events 集合；SAMPLE<1 时按比例采样
  TRACK: true,
  TRACK_SAMPLE: 1,

  // 订阅消息模板 ID（mp 后台 → 订阅消息 → 公共模板库申请后填入；空 = 功能静默关闭）
  SUBSCRIBE_TMPLS: {
    weekly: '',   // 每周攀爬小结
    reroute: ''   // 收藏线路换线提醒
  }
};
