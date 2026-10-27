// 岩点检测回归测试：用真实墙照 + 岩友手工圈点作真值，输出每条线的命中 / 漏检 / 误检
//
//   npm run eval              # 跑全部样张
//   npm run eval -- --render  # 同时把检测结果画到 out/*.jpg（白圈 = 真值，彩圈 = 检出）
//   npm run eval -- --debug   # 列出被剔除的真岩点和保留下来的误检，调 CFG 参数用
//
// 判定：检出点与真值点距离 < MATCH（画面百分比）且一一对应才算命中。
// 大岩点 / 造型输出的是质心、真值是抓握点，偶尔会超出距离，属已知误差。
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const det = require('../../miniprogram/utils/hold-detect');
const fixtures = require('./fixtures');

const MATCH = 4.5;
const WIDTH = +process.env.WIDTH || 540; // 与小程序端 / 云函数的取样宽度一致
const render = process.argv.includes('--render');

function match(gt, found) {
  const used = new Set();
  let hit = 0;
  gt.forEach((g) => {
    let best = -1, bd = MATCH;
    found.forEach((p, i) => {
      if (used.has(i)) return;
      const d = Math.hypot(p.x - g.x, p.y - g.y);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { hit++; used.add(best); }
  });
  return { hit: hit, miss: gt.length - hit, fp: found.length - hit };
}

async function run() {
  const tot = { gt: 0, hit: 0, fp: 0 };
  for (const fx of fixtures) {
    const img = await Jimp.read(path.resolve(__dirname, fx.image));
    img.resize(WIDTH, Jimp.AUTO);
    const imageData = { width: img.bitmap.width, height: img.bitmap.height, data: img.bitmap.data };
    const t0 = Date.now();
    const all = det.detectAll(imageData, fx.routes.map((r) => r.color));
    const ms = Date.now() - t0;
    console.log('\n== ' + fx.name + '  ' + img.bitmap.width + '×' + img.bitmap.height + '  ' + ms + 'ms');
    console.log('   调色板: ' + all.palette.map((c) => (c.color || '?') + '(' + c.h + '°)').join(' '));
    const rows = [];
    for (const r of fx.routes) {
      const found = all.holds[r.color] || [];
      const m = match(r.holds, found);
      tot.gt += r.holds.length; tot.hit += m.hit; tot.fp += m.fp;
      rows.push({ 线路: r.label, 颜色: r.color, 方式: all.mode[r.color], 真值: r.holds.length, 检出: found.length, 命中: m.hit, 漏检: m.miss, 误检: m.fp });
    }
    console.table(rows);
    if (process.argv.includes('--debug')) {
      for (const r of fx.routes) {
        const blobs = det.debugBlobs(imageData, r.color).filter((b) => b.n >= 12);
        console.log('   [' + r.color + '] 被剔除且离真值 < ' + MATCH + ' 的色块：');
        blobs.filter((b) => b.reason && r.holds.some((g) => Math.hypot(g.x - b.x, g.y - b.y) < MATCH))
          .forEach((b) => console.log('     ', JSON.stringify(b)));
        console.log('   [' + r.color + '] 保留但不是真值的色块（误检）：');
        blobs.filter((b) => !b.reason && !r.holds.some((g) => Math.hypot(g.x - b.x, g.y - b.y) < MATCH))
          .forEach((b) => console.log('     ', JSON.stringify(b)));
      }
    }
    if (render) await draw(fx, all);
  }
  const recall = tot.hit / tot.gt, prec = tot.hit / (tot.hit + tot.fp);
  console.log('\n合计  真值 ' + tot.gt + '  命中 ' + tot.hit + '  误检 ' + tot.fp +
    '  找全率 ' + (recall * 100).toFixed(0) + '%  准确率 ' + (prec * 100).toFixed(0) + '%');
}

const TINT = { yellow: 0xffd400ff, pink: 0xff50b4ff, green: 0x00c850ff, orange: 0xff7a1aff, blue: 0x2090ffff, purple: 0x9a5cf0ff, red: 0xff3030ff, black: 0x202020ff, white: 0xf0f0f0ff };

async function draw(fx, all) {
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const base = await Jimp.read(path.resolve(__dirname, fx.image));
  base.resize(900, Jimp.AUTO);
  const W = base.bitmap.width, H = base.bitmap.height;
  for (const r of fx.routes) {
    const img = base.clone();
    r.holds.forEach((g) => circle(img, g.x * W / 100, g.y * H / 100, 14, 0xffffffff, 4));
    (all.holds[r.color] || []).forEach((p) => circle(img, p.x * W / 100, p.y * H / 100, 9, TINT[r.color] || 0xff00ffff, 4));
    const file = path.join(outDir, fx.name + '-' + r.color + '.jpg');
    await img.quality(85).writeAsync(file);
    console.log('   → ' + path.relative(process.cwd(), file));
  }
}

function circle(img, cx, cy, rad, color, width) {
  for (let y = -rad - width; y <= rad + width; y++) {
    for (let x = -rad - width; x <= rad + width; x++) {
      const d = Math.hypot(x, y);
      if (d >= rad - width / 2 && d <= rad + width / 2) {
        const px = Math.round(cx + x), py = Math.round(cy + y);
        if (px >= 0 && py >= 0 && px < img.bitmap.width && py < img.bitmap.height) img.setPixelColor(color, px, py);
      }
    }
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
