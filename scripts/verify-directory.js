// 名录健全性：id 不重复、必填字段、与云函数副本一致、软删合并逻辑
const fs = require('fs');
const path = require('path');
const dir = require('../miniprogram/utils/gym-directory');

const errors = [];
function fail(msg) { errors.push(msg); }

const ids = {};
(dir.DIRECTORY || []).forEach((g, i) => {
  if (!g.id) fail('row ' + i + ' missing id');
  if (ids[g.id]) fail('duplicate id ' + g.id);
  ids[g.id] = true;
  if (!g.name) fail(g.id + ' missing name');
  if (g.city !== 'bj' && g.city !== 'sh') fail(g.id + ' bad city ' + g.city);
  if (!g.comingSoon && (g.lat == null || g.lng == null)) fail(g.id + ' missing lat/lng');
});

const src = fs.readFileSync(path.join(__dirname, '../miniprogram/utils/gym-directory.js'), 'utf8');
const copy = fs.readFileSync(path.join(__dirname, '../cloudfunctions/initDb/gym-directory.js'), 'utf8');
if (src !== copy) fail('initDb/gym-directory.js is out of sync with miniprogram copy');

function docKey(d) { return (d && (d._id || d.id)) || ''; }
function mergeInc(cached, inc) {
  const byId = {};
  const base = [];
  (cached || []).forEach((d) => {
    if (!d || d.deleted) return;
    const key = docKey(d);
    if (!key) return;
    byId[key] = base.length;
    base.push(d);
  });
  (inc || []).forEach((d) => {
    const key = docKey(d);
    if (!key) return;
    if (d.deleted) {
      if (byId[key] != null) base[byId[key]] = null;
      return;
    }
    if (byId[key] != null) base[byId[key]] = d;
    else {
      byId[key] = base.length;
      base.push(d);
    }
  });
  return base.filter(Boolean);
}

const merged = mergeInc(
  [{ _id: 'r1', status: 'active' }, { _id: 'r2', status: 'active' }],
  [{ _id: 'r1', deleted: true }, { _id: 'r2', status: 'removed' }]
);
if (merged.length !== 1 || merged[0]._id !== 'r2' || merged[0].status !== 'removed') {
  fail('mergeInc did not drop deleted / apply removed');
}

const listed = dir.DIRECTORY.filter((g) => !g.unlisted && !g.comingSoon).length;
const unlisted = dir.DIRECTORY.filter((g) => g.unlisted).length;
const soon = dir.DIRECTORY.filter((g) => g.comingSoon).length;

if (errors.length) {
  console.error('FAIL\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK directory=' + dir.DIRECTORY.length +
  ' listed=' + listed + ' unlisted=' + unlisted + ' comingSoon=' + soon +
  ' cities=' + dir.CITIES.map((c) => c.key).join(','));
