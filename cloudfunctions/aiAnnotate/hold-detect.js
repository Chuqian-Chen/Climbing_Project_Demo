// 岩点自动检测 v2（纯 JS，无依赖；小程序端与云函数 aiAnnotate 共用同一份文件）
//
// 输入 ImageData（{width,height,data:RGBA}，建议宽 360~540），输出 [{x,y}]（百分比坐标，自下而上）
//
// 与 v1（固定 HSV 阈值 + 连通域）相比：
//   1. 颜色自适应：先对整墙饱和像素做 k-means 得到「本墙调色板」，再把目标颜色映射到最近的色簇，
//      解决粉/紫、橙/红这类相邻色互相渗入，以及不同岩馆灯光偏色。色簇找不到时退回固定阈值。
//   2. 形状 / 质感过滤：胶带标签是细长条、海报文字是镂空细笔画、贴纸是平面无阴影；
//      岩点是有体积的实心块，表面有明暗变化。按伸长比、填充率、明度对比度三条物理规则剔除。
//
// 验证：tools/hold-detect/（TA山 真实墙照 + 岩友手工圈点作为真值，每次改参数跑一遍）
// 已知边界：大岩点 / 造型（volume）输出的是质心，不一定是抓握点；同色相邻岩点可能粘成一个块

// 颜色先验：h 色相中心，s / v 典型饱和度与明度；固定阈值（兜底用）沿用 v1 参数
const COLOR_DEFS = {
  red: { h: 358, s: 0.75, v: 0.55, win: { h: [352, 380], s: 0.45, v: 0.30 } },
  orange: { h: 26, s: 0.80, v: 0.65, win: { h: [14, 38], s: 0.50, v: 0.35 } },
  yellow: { h: 50, s: 0.75, v: 0.65, win: { h: [40, 72], s: 0.45, v: 0.26 } },
  green: { h: 135, s: 0.60, v: 0.35, win: { h: [95, 168], s: 0.30, v: 0.18 } },
  blue: { h: 212, s: 0.80, v: 0.50, win: { h: [195, 245], s: 0.35, v: 0.25 } },
  purple: { h: 290, s: 0.55, v: 0.30, win: { h: [262, 312], s: 0.22, v: 0.14 } },
  pink: { h: 342, s: 0.65, v: 0.60, win: { h: [312, 352], s: 0.30, v: 0.30 } },
  black: { dark: true },
  white: { light: true }
};

// 可调参数集中在这里；改动后跑 tools/hold-detect 看命中 / 误检变化
const CFG = {
  // 参与调色板聚类的像素条件、采样步长、簇数、迭代次数
  palSat: 0.30, palVal: 0.18, palStep: 4, palK: 10, palIters: 20,
  // 簇 → 颜色名：加权距离（色相差/40°、饱和差/0.2、明度差/0.2）超过此值视为无归属（木箱、皮肤、地垫等）
  palMaxDist: 2.6,
  // 像素进入掩膜：最低饱和 / 明度、相对固定阈值的放宽系数、离目标簇的最大色相差
  maskSat: 0.20, maskVal: 0.12, winRelax: 1.0, hueGate: 16,
  // 最小面积：基准 540 宽 = 35 像素，随分辨率平方缩放
  minAreaAt540: 35,
  // 画面边缘：太靠边多半是相邻墙面或画面切半的岩点
  xMin: 0.02, xMax: 0.98, yMax: 0.93,
  // 形状：伸长比 = sqrt(λ1/λ2)（PCA 主轴 / 次轴）
  stripElong: 3.5, stripAreaFrac: 0.0012,   // 细长且不大 → 胶带 / 文字笔画
  maxElong: 8,                              // 再长就不可能是岩点
  // 外接框填充率低 + 偏长 + 光照均匀 → 印刷文字 / 海报笔画（真岩点边缘有明暗）
  textFill: 0.33, textElong: 2.5, textContrast: 0.2,
  // 质感：明度标准差 / 均值 < flatContrast 且不是圆块、不大 → 平面贴纸 / 胶带
  flatContrast: 0.06, flatElong: 1.6, flatAreaFrac: 0.0012,
  // 质心距离小于此百分比视为同一岩点
  mergeDist: 3.5
};

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h: h, s: max === 0 ? 0 : d / max, v: max };
}

function hueDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// 色簇与颜色先验的距离（色相差/40°、饱和差/0.2、明度差/0.2 的平方和）
function priorDist(c, p) {
  return Math.pow(hueDiff(c.h, p.h) / 40, 2) + Math.pow((c.s - p.s) / 0.2, 2) + Math.pow((c.v - p.v) / 0.2, 2);
}

/* ---------- 预处理：整图 HSV ---------- */

function toHsv(imageData) {
  const W = imageData.width, H = imageData.height, px = imageData.data, n = W * H;
  const hs = new Float32Array(n), ss = new Float32Array(n), vs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const c = rgb2hsv(px[o], px[o + 1], px[o + 2]);
    hs[i] = c.h; ss[i] = c.s; vs[i] = c.v;
  }
  return { W: W, H: H, h: hs, s: ss, v: vs };
}

/* ---------- 调色板：k-means（确定性初始化，结果可复现） ---------- */

function buildPalette(img) {
  const pts = [];
  for (let i = 0; i < img.W * img.H; i += CFG.palStep) {
    if (img.s[i] < CFG.palSat || img.v[i] < CFG.palVal) continue;
    const a = img.h[i] * Math.PI / 180;
    pts.push(Math.cos(a) * img.s[i], Math.sin(a) * img.s[i], img.v[i] * 0.6);
  }
  const N = pts.length / 3;
  const K = CFG.palK;
  if (N < K * 20) return null;
  const c = new Float32Array(K * 3);
  for (let k = 0; k < K; k++) {
    const a = (k / K) * 2 * Math.PI;
    c[k * 3] = Math.cos(a) * 0.7; c[k * 3 + 1] = Math.sin(a) * 0.7; c[k * 3 + 2] = 0.35;
  }
  const sum = new Float64Array(K * 4);
  for (let it = 0; it < CFG.palIters; it++) {
    sum.fill(0);
    for (let i = 0; i < N; i++) {
      const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      let best = 0, bd = Infinity;
      for (let k = 0; k < K; k++) {
        const dx = x - c[k * 3], dy = y - c[k * 3 + 1], dz = z - c[k * 3 + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd) { bd = d; best = k; }
      }
      sum[best * 4] += x; sum[best * 4 + 1] += y; sum[best * 4 + 2] += z; sum[best * 4 + 3]++;
    }
    for (let k = 0; k < K; k++) {
      if (!sum[k * 4 + 3]) continue;
      c[k * 3] = sum[k * 4] / sum[k * 4 + 3];
      c[k * 3 + 1] = sum[k * 4 + 1] / sum[k * 4 + 3];
      c[k * 3 + 2] = sum[k * 4 + 2] / sum[k * 4 + 3];
    }
  }
  // 每个簇映射到最近的颜色先验；太远的簇不归任何颜色
  const clusters = [];
  for (let k = 0; k < K; k++) {
    if (!sum[k * 4 + 3]) continue;
    const h = (Math.atan2(c[k * 3 + 1], c[k * 3]) * 180 / Math.PI + 360) % 360;
    const s = Math.sqrt(c[k * 3] * c[k * 3] + c[k * 3 + 1] * c[k * 3 + 1]);
    const v = c[k * 3 + 2] / 0.6;
    let color = '', bd = Infinity;
    Object.keys(COLOR_DEFS).forEach((key) => {
      const p = COLOR_DEFS[key];
      if (!p.win) return;
      const d = priorDist({ h: h, s: s, v: v }, p);
      if (d < bd) { bd = d; color = key; }
    });
    clusters.push({ cx: c[k * 3], cy: c[k * 3 + 1], cz: c[k * 3 + 2], h: h, s: s, v: v, n: sum[k * 4 + 3], color: bd <= CFG.palMaxDist ? color : '' });
  }
  return clusters;
}

/* ---------- 掩膜 ---------- */

function inWindow(def, h, s, v) {
  const h2 = h < 20 ? h + 360 : h;
  return ((h >= def.h[0] && h <= def.h[1]) || (h2 >= def.h[0] && h2 <= def.h[1])) && s >= def.s && v >= def.v;
}

function buildMask(img, colorKey, palette) {
  const def = COLOR_DEFS[colorKey];
  const n = img.W * img.H;
  const mask = new Uint8Array(n);
  if (def.dark) {
    for (let i = 0; i < n; i++) if (img.v[i] < 0.16 && img.s[i] < 0.5) mask[i] = 1;
    return { mask: mask, mode: 'dark' };
  }
  if (def.light) {
    for (let i = 0; i < n; i++) if (img.v[i] > 0.85 && img.s[i] < 0.08) mask[i] = 1;
    return { mask: mask, mode: 'light' };
  }
  let mine = palette ? palette.filter((c) => c.color === colorKey) : [];
  // 本墙没有被判成该颜色的簇（如墙上没有红点，粉色簇就会被「红」抢走）：
  // 用户既然指定了颜色，就取离该颜色先验最近的那个簇
  if (!mine.length && palette && palette.length) {
    const p = COLOR_DEFS[colorKey];
    let best = null, bd = Infinity;
    palette.forEach((c) => {
      const d = priorDist(c, p);
      if (d < bd) { bd = d; best = c; }
    });
    if (best && bd <= CFG.palMaxDist) mine = [best];
  }
  if (!mine.length) {
    for (let i = 0; i < n; i++) if (inWindow(def.win, img.h[i], img.s[i], img.v[i])) mask[i] = 1;
    return { mask: mask, mode: 'window' };
  }
  // 用调色板「校准」色相窗口，而不是硬归簇：
  //   - 像素色相离目标簇 ≤ hueGate（窗口中心跟着本墙实际颜色走，灯光偏色也能对上）
  //   - 饱和 / 明度不低于该颜色的固定下限（略放宽，保住阴影面）
  //   - 最近的簇若被判成「别的颜色」则排除（粉 / 紫、橙 / 红这类相邻色不再互相渗入）
  const target = new Set(mine);
  const win = def.win;
  const sMin = Math.max(CFG.maskSat, win.s * CFG.winRelax);
  const vMin = Math.max(CFG.maskVal, win.v * CFG.winRelax);
  for (let i = 0; i < n; i++) {
    const s = img.s[i], v = img.v[i], h = img.h[i];
    if (s < sMin || v < vMin) continue;
    let near = false;
    mine.forEach((c) => { if (hueDiff(h, c.h) <= CFG.hueGate) near = true; });
    if (!near) continue;
    const a = h * Math.PI / 180;
    const x = Math.cos(a) * s, y = Math.sin(a) * s, z = v * 0.6;
    let best = null, bd = Infinity;
    for (let k = 0; k < palette.length; k++) {
      const c = palette[k];
      const dx = x - c.cx, dy = y - c.cy, dz = z - c.cz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = c; }
    }
    if (best && !target.has(best) && best.color && best.color !== colorKey) continue;
    mask[i] = 1;
  }
  return { mask: mask, mode: 'palette' };
}

/* ---------- 连通域 + 形状 / 质感统计 ---------- */

function components(img, mask) {
  const W = img.W, H = img.H, n = W * H;
  const seen = new Uint8Array(n);
  const blobs = [];
  const queue = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (!mask[i] || seen[i]) continue;
    let qh = 0, qt = 0;
    queue[qt++] = i; seen[i] = 1;
    let cnt = 0, sx = 0, sy = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    let sxx = 0, syy = 0, sxy = 0, sv = 0, svv = 0;
    while (qh < qt) {
      const p = queue[qh++];
      const x = p % W, y = (p / W) | 0;
      cnt++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      const v = img.v[p]; sv += v; svv += v * v;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x + 1 < W && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; queue[qt++] = p + 1; }
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; queue[qt++] = p - 1; }
      if (y + 1 < H && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; queue[qt++] = p + W; }
      if (y > 0 && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; queue[qt++] = p - W; }
    }
    const cx = sx / cnt, cy = sy / cnt;
    // 二阶中心矩 → 主轴伸长比
    const vxx = sxx / cnt - cx * cx, vyy = syy / cnt - cy * cy, vxy = sxy / cnt - cx * cy;
    const tr = vxx + vyy, det = vxx * vyy - vxy * vxy;
    const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(tr / 2 - disc, 1e-6);
    const vmean = sv / cnt;
    const vstd = Math.sqrt(Math.max(0, svv / cnt - vmean * vmean));
    blobs.push({
      n: cnt, cx: cx, cy: cy,
      elong: Math.sqrt(l1 / l2),
      fill: cnt / ((maxX - minX + 1) * (maxY - minY + 1)),
      contrast: vmean > 0 ? vstd / vmean : 0
    });
  }
  return blobs;
}

// 返回剔除原因；空字符串 = 像岩点
function rejectReason(b, W, H) {
  const area = W * H;
  if (b.n < Math.max(12, Math.round(CFG.minAreaAt540 * (W / 540) * (W / 540)))) return 'small';
  const fx = b.cx / W, fy = b.cy / H;
  if (fx < CFG.xMin || fx > CFG.xMax || fy > CFG.yMax) return 'edge';
  if (b.elong > CFG.maxElong) return 'too-long';
  if (b.elong > CFG.stripElong && b.n < area * CFG.stripAreaFrac) return 'strip';
  if (b.fill < CFG.textFill && b.elong > CFG.textElong && b.contrast < CFG.textContrast) return 'stroke';
  if (b.contrast < CFG.flatContrast && b.elong > CFG.flatElong && b.n < area * CFG.flatAreaFrac) return 'flat';
  return '';
}

function toHolds(blobs, W, H) {
  const holds = blobs.filter((b) => !rejectReason(b, W, H)).map((b) => ({
    x: Math.round((b.cx / W) * 1000) / 10,
    y: Math.round((b.cy / H) * 1000) / 10,
    r: Math.round(Math.sqrt(b.n / Math.PI) / W * 1000) / 10,
    area: b.n
  }));
  const merged = [];
  holds.sort((a, b) => b.area - a.area).forEach((hd) => {
    const hit = merged.find((m) => Math.hypot(m.x - hd.x, m.y - hd.y) < CFG.mergeDist);
    if (!hit) merged.push(hd);
  });
  return merged.sort((a, b) => b.y - a.y);
}

/* ---------- 对外接口 ---------- */

// 单色检测（墙面页「AI 自动圈点」）：返回 [{x,y}]
function detect(imageData, colorKey) {
  if (!COLOR_DEFS[colorKey] || !imageData) return [];
  const img = toHsv(imageData);
  const palette = COLOR_DEFS[colorKey].win ? buildPalette(img) : null;
  const m = buildMask(img, colorKey, palette);
  return toHolds(components(img, m.mask), img.W, img.H).map((h) => ({ x: h.x, y: h.y }));
}

// 多色一次检测：返回 { palette, holds: { yellow: [{x,y,r}], ... }, mode: { yellow: 'palette'|'window' } }
// colorKeys 省略时检测调色板里出现的全部颜色
function detectAll(imageData, colorKeys) {
  if (!imageData) return { palette: [], holds: {}, mode: {} };
  const img = toHsv(imageData);
  const palette = buildPalette(img) || [];
  const keys = colorKeys || palette.map((c) => c.color).filter((c, i, a) => c && a.indexOf(c) === i);
  const holds = {}, mode = {};
  keys.forEach((key) => {
    if (!COLOR_DEFS[key]) return;
    const m = buildMask(img, key, palette);
    holds[key] = toHolds(components(img, m.mask), img.W, img.H).map((h) => ({ x: h.x, y: h.y, r: h.r }));
    mode[key] = m.mode;
  });
  return {
    palette: palette.map((c) => ({ color: c.color, h: Math.round(c.h), s: +c.s.toFixed(2), v: +c.v.toFixed(2), n: c.n })),
    holds: holds,
    mode: mode
  };
}

// 调参用：返回该颜色全部色块及剔除原因
function debugBlobs(imageData, colorKey) {
  const img = toHsv(imageData);
  const palette = COLOR_DEFS[colorKey].win ? buildPalette(img) : null;
  const m = buildMask(img, colorKey, palette);
  return components(img, m.mask).map((b) => ({
    x: +(b.cx / img.W * 100).toFixed(1), y: +(b.cy / img.H * 100).toFixed(1), n: b.n,
    elong: +b.elong.toFixed(2), fill: +b.fill.toFixed(2), contrast: +b.contrast.toFixed(3),
    reason: rejectReason(b, img.W, img.H)
  }));
}

module.exports = { detect, detectAll, debugBlobs, COLOR_DEFS, CFG };
