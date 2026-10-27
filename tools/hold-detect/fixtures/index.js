// 回归测试样张：墙照 + 每条线的真值岩点（百分比坐标）
// TA山 主墙的真值来自 cloudfunctions/initDb/real-content.js（2026-07-28 岩友在真机上圈注），不要手改
const real = require('../../../cloudfunctions/initDb/real-content');

const tashanWall = real.WALLS[0];
const tashanColor = {};
real.ROUTES.forEach((r) => { tashanColor[r.id] = r.color; });

module.exports = [
  {
    name: 'tashan',
    image: '../../docs/tashan.jpg',
    routes: Object.keys(tashanWall.holds).map((rid) => ({
      label: rid.slice(-5),
      color: tashanColor[rid],
      holds: tashanWall.holds[rid].map((h) => ({ x: h.x, y: h.y }))
    }))
  }
];
