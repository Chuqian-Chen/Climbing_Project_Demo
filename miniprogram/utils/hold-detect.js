// 岩点自动检测（客户端版）：HSV 色相分类 + 连通域聚类
// 输入 ImageData（canvas.getImageData 结果），输出 [{x,y}]（百分比坐标，自下而上）
// 与云函数 aiAnnotate 同源算法；已知边界：同色胶带/贴纸可能混入，需人工微调
const COLOR_DEFS = {
  yellow: { h: [40, 72], s: 0.45, v: 0.26 },
  orange: { h: [14, 38], s: 0.50, v: 0.35 },
  pink: { h: [312, 352], s: 0.30, v: 0.30 },
  green: { h: [95, 168], s: 0.30, v: 0.18 },
  purple: { h: [262, 312], s: 0.22, v: 0.14 },
  blue: { h: [195, 245], s: 0.35, v: 0.25 },
  red: { h: [352, 380], s: 0.45, v: 0.30 },
  black: { dark: true },
  white: { light: true }
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

function matches(def, hsv) {
  if (def.dark) return hsv.v < 0.16 && hsv.s < 0.5;
  if (def.light) return hsv.v > 0.85 && hsv.s < 0.08;
  const h2 = hsv.h < 20 ? hsv.h + 360 : hsv.h;
  return ((hsv.h >= def.h[0] && hsv.h <= def.h[1]) || (h2 >= def.h[0] && h2 <= def.h[1])) &&
    hsv.s >= def.s && hsv.v >= def.v;
}

function detect(imageData, colorKey) {
  const def = COLOR_DEFS[colorKey];
  if (!def || !imageData) return [];
  const W = imageData.width, H = imageData.height, px = imageData.data;
  // 面积阈值随分辨率缩放（基准 540 宽 = 35 像素）
  const minArea = Math.max(12, Math.round(35 * (W / 540) * (W / 540)));

  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    if (matches(def, rgb2hsv(px[o], px[o + 1], px[o + 2]))) mask[i] = 1;
  }

  const seen = new Uint8Array(W * H);
  const blobs = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || seen[i]) continue;
    const queue = [i];
    seen[i] = 1;
    let n = 0, sx = 0, sy = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    while (queue.length) {
      const p = queue.pop();
      const x = p % W, y = (p / W) | 0;
      n++; sx += x; sy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x + 1 < W && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; queue.push(p + 1); }
      if (x - 1 >= 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; queue.push(p - 1); }
      if (y + 1 < H && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; queue.push(p + W); }
      if (y - 1 >= 0 && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; queue.push(p - W); }
    }
    blobs.push({ n: n, cx: sx / n, cy: sy / n, w: maxX - minX + 1, h: maxY - minY + 1 });
  }

  let holds = blobs.filter((b) =>
    b.n >= minArea &&
    (b.cx / W) > 0.03 && (b.cx / W) < 0.97 &&
    (b.cy / H) < 0.92 &&
    Math.max(b.w, b.h) / Math.min(b.w, b.h) < 6
  ).map((b) => ({
    x: Math.round((b.cx / W) * 1000) / 10,
    y: Math.round((b.cy / H) * 1000) / 10,
    area: b.n
  }));

  const merged = [];
  holds.sort((a, b) => b.area - a.area).forEach((hd) => {
    const hit = merged.find((m) =>
      Math.sqrt((m.x - hd.x) * (m.x - hd.x) + (m.y - hd.y) * (m.y - hd.y)) < 3.5);
    if (!hit) merged.push(hd);
  });
  return merged.sort((a, b) => b.y - a.y).map((h) => ({ x: h.x, y: h.y }));
}

module.exports = { detect, COLOR_DEFS };
