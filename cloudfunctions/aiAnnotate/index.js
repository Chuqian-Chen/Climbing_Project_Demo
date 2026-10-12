// 云函数：aiAnnotate — AI 自动圈点 v1（云端色块算法出候选）
// 输入 { fileID, color } → 输出 { ok, holds: [{x,y}] }（坐标为照片百分比，自下而上排序）
// v2 插槽：配置环境变量 VISION_API_KEY 后，可在 refineWithLLM 中接多模态大模型
// 复刻本地验证过的 HSV 检测（scratchpad/detect-color.js），参数一致
const cloud = require('wx-server-sdk');
const Jimp = require('jimp');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const COLOR_DEFS = {
  yellow: { h: [40, 72], s: 0.45, v: 0.26, xMax: 0.95, yMax: 0.9 },
  orange: { h: [14, 38], s: 0.50, v: 0.35, xMax: 0.95, yMax: 0.9 },
  pink: { h: [312, 352], s: 0.30, v: 0.30, xMax: 0.95, yMax: 0.9 },
  green: { h: [95, 168], s: 0.30, v: 0.18, xMax: 0.95, yMax: 0.9 },
  purple: { h: [262, 312], s: 0.22, v: 0.14, xMax: 0.95, yMax: 0.9 },
  blue: { h: [195, 245], s: 0.35, v: 0.25, xMax: 0.95, yMax: 0.9 },
  red: { h: [352, 372], s: 0.45, v: 0.30, xMax: 0.95, yMax: 0.9 },
  black: { h: [0, 360], s: 0, v: 0, dark: true, xMax: 0.95, yMax: 0.9 },
  white: { h: [0, 360], s: 0, v: 0, light: true, xMax: 0.95, yMax: 0.9 }
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

function match(def, hsv) {
  if (def.dark) return hsv.v < 0.16 && hsv.s < 0.5;
  if (def.light) return hsv.v > 0.85 && hsv.s < 0.08;
  const h2 = hsv.h < 20 ? hsv.h + 360 : hsv.h; // red 跨 0 度
  return ((hsv.h >= def.h[0] && hsv.h <= def.h[1]) || (h2 >= def.h[0] && h2 <= def.h[1])) &&
    hsv.s >= def.s && hsv.v >= def.v;
}

exports.main = async (event) => {
  const fileID = event && event.fileID;
  const color = event && event.color;
  const def = COLOR_DEFS[color];
  if (!fileID || !def) return { ok: false, err: 'bad params' };

  let img;
  let rawBuf = null;
  try {
    const res = await cloud.downloadFile({ fileID: fileID });
    rawBuf = res.fileContent;
    img = await Jimp.read(res.fileContent);
  } catch (e) {
    return { ok: false, err: 'download/decode failed: ' + e.message };
  }
  img.resize(540, Jimp.AUTO);
  const W = img.bitmap.width, H = img.bitmap.height;

  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = Jimp.intToRGBA(img.getPixelColor(x, y));
      if (match(def, rgb2hsv(c.r, c.g, c.b))) mask[y * W + x] = 1;
    }
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
      const px = p % W, py = (p / W) | 0;
      n++; sx += px; sy += py;
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let d = 0; d < 4; d++) {
        const nx = px + dirs[d][0], ny = py + dirs[d][1];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const q = ny * W + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; queue.push(q); }
      }
    }
    blobs.push({ n: n, cx: sx / n, cy: sy / n, w: maxX - minX + 1, h: maxY - minY + 1 });
  }

  let holds = blobs.filter((b) =>
    b.n >= 35 &&
    (b.cx / W) > 0.04 && (b.cx / W) < def.xMax &&
    (b.cy / H) < def.yMax &&
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
  holds = merged.sort((a, b) => b.y - a.y).map((h) => ({ x: h.x, y: h.y }));

  // v2：配置 VISION_API_KEY 后用多模态大模型复核候选点（剔除胶带/海报/异物，识别起步点）
  if (process.env.VISION_API_KEY) {
    try {
      const refined = await refineWithLLM(rawBuf, color, holds);
      if (refined && refined.length) {
        return { ok: true, holds: refined, llm: true, note: 'AI 复核结果，仍可长按微调' };
      }
    } catch (e) {
      // 大模型失败 → 静默退回色块算法结果
    }
  }
  return { ok: true, holds: holds, note: '候选点为色块算法结果，请人工微调（长按删除/标记起步）' };
};

/* ---------- 多模态大模型复核（OpenAI 兼容协议） ----------
 * 环境变量（云开发控制台 → 云函数 aiAnnotate → 配置 → 环境变量）：
 *   VISION_API_KEY   必填，API 密钥
 *   VISION_API_URL   选填，默认 https://api.openai.com/v1/chat/completions
 *                    （通义/混元/智谱等兼容端点直接换 URL 即可）
 *   VISION_MODEL     选填，默认 gpt-4o-mini（国产模型填对应模型名）
 * 同时建议在控制台把本函数超时调到 30s。 */
const https = require('https');

function postJSON(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      timeout: 25000
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad json: ' + data.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function refineWithLLM(buf, color, candidates) {
  const b64 = buf.toString('base64');
  const prompt = '这是一面抱石攀岩墙的照片。以下是算法检测出的「' + color +
    '」色岩点候选坐标（x、y 为照片宽高的百分比 0-100）：\n' +
    JSON.stringify(candidates) +
    '\n请剔除其中不是岩点的项（胶带标签、海报、告示、地垫等），' +
    '并给贴有胶带标签的起步岩点加 "s":1 标记。' +
    '只输出 JSON 数组，格式 [{"x":12.3,"y":45.6}] 或 [{"x":12.3,"y":45.6,"s":1}]，不要输出其他内容。';
  const res = await postJSON(
    process.env.VISION_API_URL || 'https://api.openai.com/v1/chat/completions',
    { Authorization: 'Bearer ' + process.env.VISION_API_KEY },
    {
      model: process.env.VISION_MODEL || 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } }
        ]
      }],
      max_tokens: 1000
    }
  );
  const text = res && res.choices && res.choices[0] &&
    res.choices[0].message && res.choices[0].message.content;
  if (!text) return null;
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  const arr = JSON.parse(m[0]);
  if (!Array.isArray(arr)) return null;
  return arr
    .filter((p) => typeof p.x === 'number' && typeof p.y === 'number')
    .map((p) => (p.s ? { x: p.x, y: p.y, s: 1 } : { x: p.x, y: p.y }));
}
