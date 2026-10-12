// 真实用户内容种子（非演示数据）：TA山(sh19) 主墙 4 条真实线路 + 墙面圈点文档。
// 来源：2026-07-28 用户在 TA山 真实墙照上标注，2026-07-29 v6.1 force 重灌误删后从本地恢复。
// 语义：ensure-exists —— 文档缺失时补回，已存在则完全不动（不覆盖后续编辑）。
// 注意：id/坐标是真实领域数据，禁止改动；墙照文件在云存储 walls/sh19_w-main.jpg。

const TASHAN_PHOTO_FILEID = 'cloud://cloud1-d9gjpqqv42f005e11.636c-cloud1-d9gjpqqv42f005e11-1459753686/walls/sh19_w-main.jpg';
const OWNER_OPENID = 'oOrNR5FQ6FpLBtE2zyHVj22lUkLg';
const OWNER_SNAP = { nickname: '岩友', emoji: '🧗', color: '#fff1ea', avatarUrl: '', height: 0, armSpan: 0, isSetter: false };

function routeBase(o) {
  return Object.assign({
    _id: o.id,
    gymId: 'sh19',
    wallId: 'w-main',
    setterId: OWNER_OPENID,
    setterSnap: OWNER_SNAP,
    setDate: '2026-07-28',
    removeDate: '2026-08-27',
    tags: [],
    sends: 0,
    attempts: 0,
    feel: { soft: 0, fair: 0, hard: 0 },
    status: 'active',
    isUserRoute: true
  }, o);
}

// TA山定级：贴标岩点=起步点(s:1)，标签颜色=难度（橙V0/粉V1/绿V2/黄V3）
// 2026-07-30 全 app 统一真实口径：线路不命名（显示名自动 = 颜色点+难度），name 清空
const ROUTES = [
  routeBase({ id: 'r_ms5qhtvare3rz', name: '', color: 'yellow', grade: 'V0' }),
  routeBase({ id: 'r_ms5qhsnox5jif', name: '', color: 'green', grade: 'V2' }),
  routeBase({ id: 'r_ms5qhrfxbrso0', name: '', color: 'pink', grade: 'V3' }),
  routeBase({ id: 'r_ms5qhq84ev2uq', name: '', color: 'orange', grade: 'V0' })
];

const WALLS = [{
  _id: 'sh19_w-main',
  key: 'sh19_w-main',
  gymId: 'sh19',
  wallId: 'w-main',
  photoFileID: TASHAN_PHOTO_FILEID,
  photoPath: '',
  updatedAt: '2026-07-29',
  updatedBy: OWNER_OPENID,
  editorSnap: OWNER_SNAP,
  markers: [
    { routeId: 'r_ms5qhtvare3rz', x: 29, y: 6 },
    { routeId: 'r_ms5qhq84ev2uq', x: 28.3, y: 14.5 },
    { routeId: 'r_ms5qhrfxbrso0', x: 83.2, y: 15.5 },
    { routeId: 'r_ms5qhsnox5jif', x: 90.2, y: 33.3 }
  ],
  holds: {
    r_ms5qhtvare3rz: [
      { x: 33.5, y: 80, s: 1 }, { x: 18, y: 69.8, s: 1 }, { x: 37.3, y: 58.3 },
      { x: 32, y: 45.7, s: 1 }, { x: 46.4, y: 42.2 }, { x: 15.7, y: 36 },
      { x: 26.3, y: 26.2 }, { x: 32.7, y: 22.5 }, { x: 41, y: 17.3 }, { x: 29, y: 6 }
    ],
    r_ms5qhrfxbrso0: [
      { x: 23, y: 77.5, s: 1 }, { x: 36.5, y: 74.5, s: 1 }, { x: 23.5, y: 37.5, s: 1 },
      { x: 47.7, y: 61.1 }, { x: 48, y: 48.3 }, { x: 38.5, y: 34 }, { x: 46.6, y: 35.8 },
      { x: 62.2, y: 37.3 }, { x: 68.1, y: 32.5 }, { x: 95.2, y: 40.6 },
      { x: 86.4, y: 20.8 }, { x: 83.2, y: 15.5 }
    ],
    r_ms5qhsnox5jif: [
      { x: 55.8, y: 75.8 }, { x: 52.6, y: 70.3 }, { x: 89.7, y: 59.5 },
      { x: 52.6, y: 49.1 }, { x: 59.9, y: 45.2 }, { x: 90.2, y: 33.3 }
    ]
    // r_ms5qhq84ev2uq（橙色 V0）为早期单点标记线，只有 marker 无 holds，属实际数据现状
  }
}];

module.exports = { ROUTES, WALLS };
