// 在墙照上画编号标记，供多模态模型「按编号」判断（set-of-marks 提示法：
// 让模型引用图上清晰可见的编号，比直接回答坐标准确得多）
const Jimp = require('jimp');

const WIDTH = 1024;

function ring(img, cx, cy, rad, color, width) {
  const W = img.bitmap.width, H = img.bitmap.height;
  const r0 = rad - width / 2, r1 = rad + width / 2;
  for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) {
    for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d >= r0 && d <= r1) img.setPixelColor(color, x, y);
    }
  }
}

function box(img, x0, y0, w, h, color) {
  const W = img.bitmap.width, H = img.bitmap.height;
  for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) img.setPixelColor(color, x, y);
  }
}

// 每 10% 一条淡网格线 + 边缘刻度，模型补漏点时可以报网格坐标
function grid(img, font) {
  const W = img.bitmap.width, H = img.bitmap.height;
  const line = 0xffffff55;
  for (let k = 1; k < 10; k++) {
    const x = Math.round(W * k / 10), y = Math.round(H * k / 10);
    for (let i = 0; i < H; i += 2) img.setPixelColor(line, x, i);
    for (let i = 0; i < W; i += 2) img.setPixelColor(line, i, y);
    img.print(font, x + 2, 2, String(k * 10));
    img.print(font, 2, y + 2, String(k * 10));
  }
}

// marks: [{ id, x, y }]（百分比坐标）；返回 JPEG Buffer
async function drawMarks(buf, marks, opts) {
  opts = opts || {};
  const img = await Jimp.read(buf);
  img.resize(WIDTH, Jimp.AUTO);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  if (opts.grid) grid(img, font);
  const W = img.bitmap.width, H = img.bitmap.height;
  marks.forEach((m) => {
    const cx = m.x * W / 100, cy = m.y * H / 100;
    ring(img, cx, cy, 15, 0x000000ff, 6);
    ring(img, cx, cy, 15, 0x00ff66ff, 3);
    const label = String(m.id);
    const lw = 9 * label.length + 6;
    box(img, Math.round(cx + 12), Math.round(cy - 24), lw, 20, 0x000000cc);
    img.print(font, Math.round(cx + 15), Math.round(cy - 23), label);
  });
  return img.quality(82).getBufferAsync(Jimp.MIME_JPEG);
}

module.exports = { drawMarks };
