// 云函数：aiAnnotate — 岩点识别 + AI 路线分析
//
// mode = 'holds'（默认）：{ fileID, color } → { ok, holds: [{x,y,s?}], llm, note }
//   1. hold-detect（与小程序端同一份算法）在 540 宽缩略图上出候选点
//   2. 配置了视觉模型时：候选点画成编号标记 + 10% 网格，交给模型判定哪些是真岩点、哪些是起步点、有没有漏掉的
//   3. 模型失败或未配置 → 直接返回算法候选
//
// mode = 'beta'：{ fileID, holds: [{x,y,s?,t?}], color, grade } → { ok, tips: [], moves: [] }
//   把线路岩点按手序编号画在墙照上，请模型给出攀爬建议（需配置视觉模型；未配置返回 ok:false，客户端用规则预判兜底）
//
// hold-detect.js 是 miniprogram/utils/hold-detect.js 的副本：改算法后在 tools/hold-detect 运行 `npm run sync`
const cloud = require('wx-server-sdk');
const Jimp = require('jimp');
const detector = require('./hold-detect');
const { drawMarks } = require('./marks');
const llm = require('./llm');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const COLOR_NAMES = { red: '红', orange: '橙', yellow: '黄', green: '绿', blue: '蓝', purple: '紫', pink: '粉', black: '黑', white: '白' };
const MAX_ADD = 8;

async function loadImage(fileID) {
  const res = await cloud.downloadFile({ fileID: fileID });
  return res.fileContent;
}

async function candidates(buf, color) {
  const img = await Jimp.read(buf);
  img.resize(540, Jimp.AUTO);
  const imageData = { width: img.bitmap.width, height: img.bitmap.height, data: img.bitmap.data };
  return detector.detect(imageData, color);
}

function clampPct(v) {
  const n = Number(v);
  if (!isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

// 模型回复 → 最终岩点。只接受合法编号与 0~100 内的坐标；补点数量有上限，防止模型「编」出一整面墙
function mergeReview(cands, review) {
  const byId = {};
  cands.forEach((c) => { byId[c.id] = c; });
  const keep = Array.isArray(review.keep) ? review.keep.map(Number).filter((id) => byId[id]) : null;
  if (!keep) return null;
  const starts = new Set(Array.isArray(review.start) ? review.start.map(Number) : []);
  const holds = keep.map((id) => {
    const c = byId[id];
    return starts.has(id) ? { x: c.x, y: c.y, s: 1 } : { x: c.x, y: c.y };
  });
  (Array.isArray(review.add) ? review.add : []).slice(0, MAX_ADD).forEach((p) => {
    const x = clampPct(p && p.x), y = clampPct(p && p.y);
    if (x == null || y == null) return;
    if (holds.some((h) => Math.hypot(h.x - x, h.y - y) < 3)) return;
    holds.push(p.s ? { x: x, y: y, s: 1 } : { x: x, y: y });
  });
  return holds.sort((a, b) => b.y - a.y);
}

function holdsPrompt(color, n) {
  const name = COLOR_NAMES[color] || color;
  return [
    '这是一面室内抱石攀岩墙的照片。图上绿色圆圈和白色数字（1~' + n + '）是算法找到的「' + name + '色」候选岩点；',
    '图上还有每 10% 一格的虚线网格，边上标了刻度（横向 x、纵向 y，单位为照片宽高的百分比）。',
    '',
    '请逐个判断：',
    '1. 哪些编号是真正的' + name + '色岩点或' + name + '色造型（volume）。以下都不算：胶带标签、地垫、墙上的海报 / 告示 / 贴纸、木质造型的边、其他颜色的岩点、阴影或反光。',
    '2. 哪些编号是起步点（岩点下方贴着胶带标签的通常是起步点）。',
    '3. 有没有明显的' + name + '色岩点没被圈到？如有，按网格估计它的中心坐标。没有就返回空数组，不确定的不要加。',
    '',
    '只输出一个 JSON 对象，不要输出其他文字：',
    '{"keep":[编号...],"start":[编号...],"add":[{"x":百分比,"y":百分比}]}'
  ].join('\n');
}

function betaPrompt(color, grade, holds) {
  const name = COLOR_NAMES[color] || color;
  const hasFeet = holds.some((h) => h.t === 'f');
  return [
    '这是一面室内抱石攀岩墙的照片。图上绿色圆圈和数字标出了一条' + name + '色' + (grade ? ' ' + grade : '') + ' 线路的岩点，',
    '数字是岩友标注的手序（S 开头的是起步点' + (hasFeet ? '，F 开头的是脚点' : '') + '）。',
    '',
    '请以有经验的抱石教练身份，结合岩点的形状、朝向、间距和墙面角度，给出这条线的攀爬建议：',
    '- tips：3~5 条整体要点（起步姿势、关键难点在哪两点之间、发力方式、适合什么身材、容易掉的地方）',
    '- moves：按手序逐段说明（如「1→2：右手侧拉，左脚高踩到 S 右侧的小脚点再出手」），最多 10 段',
    '每条不超过 40 个字，用中文，看不清的地方直说不确定，不要编造图上没有的岩点。',
    '',
    '只输出一个 JSON 对象，不要输出其他文字：',
    '{"tips":["..."],"moves":["..."]}'
  ].join('\n');
}

async function modeHolds(event) {
  const color = event.color;
  if (!event.fileID || !detector.COLOR_DEFS[color]) return { ok: false, err: 'bad params' };
  let buf;
  try { buf = await loadImage(event.fileID); } catch (e) { return { ok: false, err: 'download failed: ' + e.message }; }
  let cands;
  try { cands = await candidates(buf, color); } catch (e) { return { ok: false, err: 'decode failed: ' + e.message }; }
  const base = cands.map((c) => ({ x: c.x, y: c.y }));
  if (!llm.enabled()) {
    return { ok: true, holds: base, llm: false, note: '色块算法候选点，请人工微调（长按删除 / 标记起步）' };
  }
  const marked = cands.map((c, i) => ({ id: i + 1, x: c.x, y: c.y }));
  try {
    const img = await drawMarks(buf, marked, { grid: true });
    const review = await llm.askJSON(img, holdsPrompt(color, marked.length));
    const holds = mergeReview(marked, review);
    if (holds && holds.length) {
      return {
        ok: true, holds: holds, llm: true,
        stats: { candidates: marked.length, kept: (review.keep || []).length, added: holds.length - (review.keep || []).length },
        note: 'AI 已剔除胶带 / 海报等误检并标出起步点，仍可长按微调'
      };
    }
  } catch (e) {
    console.warn('[aiAnnotate] llm review failed:', e.message);
  }
  return { ok: true, holds: base, llm: false, note: 'AI 复核暂不可用，已返回算法候选点' };
}

async function modeBeta(event) {
  const holds = Array.isArray(event.holds) ? event.holds.filter((h) => h && isFinite(h.x) && isFinite(h.y)) : [];
  if (!event.fileID || holds.length < 2) return { ok: false, err: 'bad params' };
  if (!llm.enabled()) return { ok: false, err: 'llm not configured' };
  let n = 0, s = 0, f = 0;
  const marks = holds.map((h) => {
    if (h.t === 'f') { f++; return { id: 'F' + f, x: h.x, y: h.y }; }
    if (h.s) { s++; return { id: 'S' + s, x: h.x, y: h.y }; }
    n++;
    return { id: n, x: h.x, y: h.y };
  });
  try {
    const buf = await loadImage(event.fileID);
    const img = await drawMarks(buf, marks, { grid: false });
    const res = await llm.askJSON(img, betaPrompt(event.color, event.grade, holds), { maxTokens: 1500, timeoutMs: 28000 });
    const clean = (arr, max) => (Array.isArray(arr) ? arr : [])
      .map((t) => String(t).trim()).filter(Boolean).slice(0, max).map((t) => t.slice(0, 80));
    const tips = clean(res.tips, 6);
    const moves = clean(res.moves, 12);
    if (!tips.length && !moves.length) return { ok: false, err: 'empty answer' };
    return { ok: true, tips: tips, moves: moves, model: process.env.VISION_MODEL || 'qwen-vl-max' };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

exports.main = async (event) => {
  event = event || {};
  if (event.mode === 'beta') return modeBeta(event);
  return modeHolds(event);
};

// 供本地测试（tools/hold-detect/test-ai.js）
exports._internal = { mergeReview, holdsPrompt, betaPrompt, candidates };
