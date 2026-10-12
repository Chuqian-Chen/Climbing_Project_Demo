// 天气提示，30 分钟缓存。双数据源：
// - flags.TENCENT_LBS_KEY 已配置 → 腾讯位置服务天气（apis.map.qq.com，
//   可过小程序域名白名单，正式版用这个；后台需将 apis.map.qq.com 加入 request 合法域名）
// - 未配置 → Open-Meteo（无需 key，但域名无法备案，仅开发者工具可用）
const flags = require('./flags');
const CACHE_KEY = 'yy_weather_v1';
const CACHE_MS = 30 * 60 * 1000;

// WMO 天气码 → 图标/描述
function codeInfo(code) {
  if (code === 0) return { icon: '☀️', desc: '晴' };
  if (code <= 2) return { icon: '🌤️', desc: '多云' };
  if (code === 3) return { icon: '☁️', desc: '阴' };
  if (code <= 48) return { icon: '🌫️', desc: '雾' };
  if (code <= 67) return { icon: '🌧️', desc: '有雨' };
  if (code <= 77) return { icon: '🌨️', desc: '有雪' };
  if (code <= 82) return { icon: '🌧️', desc: '阵雨' };
  if (code <= 86) return { icon: '🌨️', desc: '阵雪' };
  return { icon: '⛈️', desc: '雷雨' };
}

function advice(code, temp) {
  if (code >= 51) return '这种天，室内抱石刚刚好';
  if (temp >= 33) return '天热多补水，镁粉多带点';
  if (temp <= 0) return '天冷充分热身再上墙';
  return '状态正好，去磕线吧';
}

// 腾讯天气文字 → 图标（关键词包含匹配，顺序即优先级）
const TX_ICONS = [
  ['雷', '⛈️'], ['雪', '🌨️'], ['雨', '🌧️'], ['雾', '🌫️'], ['霾', '🌫️'],
  ['阴', '☁️'], ['多云', '🌤️'], ['晴', '☀️']
];

function txAdviceCode(weatherText) {
  // 映射到 advice() 用的粗粒度码：雨雪≥51，其他 0
  return /[雨雪雷]/.test(weatherText) ? 61 : 0;
}

function cacheAndResolve(resolve, data) {
  try {
    wx.setStorageSync(CACHE_KEY, { ts: Date.now(), data: data });
  } catch (e) { /* ignore */ }
  resolve(data);
}

// 腾讯位置服务天气（实时）
function getTencent(lat, lng, resolve) {
  wx.request({
    url: 'https://apis.map.qq.com/ws/weather/v1/',
    data: { location: lat + ',' + lng, type: 'now', key: flags.TENCENT_LBS_KEY },
    timeout: 5000,
    success: (res) => {
      const rt = res.data && res.data.status === 0 &&
        res.data.result && res.data.result.realtime && res.data.result.realtime[0];
      const infos = rt && rt.infos;
      if (!infos || infos.temp == null) return resolve(null);
      const text = infos.weather || '';
      const hit = TX_ICONS.find((p) => text.indexOf(p[0]) >= 0);
      const temp = Math.round(Number(infos.temp));
      cacheAndResolve(resolve, {
        icon: hit ? hit[1] : '🌤️',
        desc: text || '——',
        temp: temp,
        advice: advice(txAdviceCode(text), temp)
      });
    },
    fail: () => resolve(null)
  });
}

function get(lat, lng) {
  // 读缓存
  try {
    const c = wx.getStorageSync(CACHE_KEY);
    if (c && c.ts && Date.now() - c.ts < CACHE_MS) return Promise.resolve(c.data);
  } catch (e) { /* ignore */ }

  if (flags.TENCENT_LBS_KEY) {
    return new Promise((resolve) => getTencent(lat, lng, resolve));
  }

  return new Promise((resolve) => {
    wx.request({
      url: 'https://api.open-meteo.com/v1/forecast',
      data: {
        latitude: lat,
        longitude: lng,
        current_weather: true,
        timezone: 'Asia/Shanghai'
      },
      timeout: 5000,
      success: (res) => {
        const cw = res.data && res.data.current_weather;
        if (!cw) return resolve(null);
        const info = codeInfo(cw.weathercode);
        const temp = Math.round(cw.temperature);
        const data = {
          icon: info.icon,
          desc: info.desc,
          temp: temp,
          advice: advice(cw.weathercode, temp)
        };
        try {
          wx.setStorageSync(CACHE_KEY, { ts: Date.now(), data: data });
        } catch (e) { /* ignore */ }
        resolve(data);
      },
      fail: () => resolve(null)
    });
  });
}

module.exports = { get };
