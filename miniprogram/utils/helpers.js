// 通用工具函数
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// Date -> 'YYYY-MM-DD'
function formatDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function today() {
  return formatDate(new Date());
}

// 'YYYY-MM-DD' -> Date（避免 iOS 对字符串日期解析的兼容问题）
function parseDate(s) {
  const p = String(s || '').split('-');
  return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
}

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 距某日期还有几天（负数=已过期）
function daysUntil(dateStr) {
  return Math.round((parseDate(dateStr) - startOfToday()) / 86400000);
}

// 距某日期已过几天
function daysSince(dateStr) {
  return Math.round((startOfToday() - parseDate(dateStr)) / 86400000);
}

// 'YYYY-MM-DD' -> 今天 / 昨天 / N天前 / M月D日
function relativeDate(dateStr) {
  const diff = daysSince(dateStr);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 7) return diff + '天前';
  const d = parseDate(dateStr);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

// 两点球面距离（km）
function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatKm(km) {
  if (km == null) return '';
  return km < 1 ? Math.round(km * 1000) + 'm' : km.toFixed(1) + 'km';
}

// 'YYYY-MM-DD' -> 'YYYY-Www'（用于连续周打卡统计）
function weekKey(dateStr) {
  const d = parseDate(dateStr);
  // 以周一为一周起点
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return formatDate(monday);
}

function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

module.exports = {
  formatDate, today, parseDate, daysUntil, daysSince,
  relativeDate, distanceKm, formatKm, weekKey, uid
};
