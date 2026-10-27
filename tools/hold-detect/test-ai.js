// aiAnnotate 云函数本地联调：不连真实云环境与模型
//   - wx-server-sdk 换成桩：downloadFile 读本地墙照
//   - 视觉模型换成本地 HTTP 桩：记录收到的请求，按预设 JSON 回复
// 用法：npm run test:ai          （断言通过即退出 0；标记图写到 out/marks-*.jpg 供人工检查）
//       VISION_API_KEY=... VISION_API_URL=... VISION_MODEL=... npm run test:ai -- --real
//       （--real：用真实模型跑 TA山 样张，并和真值对比命中 / 误检）
const fs = require('fs');
const path = require('path');
const http = require('http');
const Module = require('module');
const assert = require('assert');

const FN_DIR = path.resolve(__dirname, '../../cloudfunctions/aiAnnotate');
const fixtures = require('./fixtures');
const REAL = process.argv.includes('--real');

// 云函数依赖装在它自己的目录（cloudfunctions/aiAnnotate/node_modules）；本地测试只需 jimp
const fnRequire = Module.createRequire(path.join(FN_DIR, 'index.js'));
try { fnRequire.resolve('jimp'); } catch (e) {
  console.error('缺少依赖：cd cloudfunctions/aiAnnotate && npm i --no-save jimp@0.16.13');
  process.exit(1);
}

const fx = fixtures[0];
const photo = fs.readFileSync(path.resolve(__dirname, fx.image));
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'wx-server-sdk') {
    return {
      init() {}, DYNAMIC_CURRENT_ENV: 'local',
      downloadFile: async () => ({ fileContent: photo })
    };
  }
  return origLoad.apply(this, arguments);
};

const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

let imgSeq = 0;
function stubServer(reply) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const json = JSON.parse(body);
      seen.push({ auth: req.headers.authorization, json: json });
      const img = json.messages[0].content.find((c) => c.type === 'image_url').image_url.url;
      fs.writeFileSync(path.join(outDir, 'marks-' + (++imgSeq) + '.jpg'), Buffer.from(img.split(',')[1], 'base64'));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: typeof reply === 'function' ? reply(json) : reply } }] }));
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, seen, url: 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions' })));
}

function score(gt, found) {
  const used = new Set();
  let hit = 0;
  gt.forEach((g) => {
    let best = -1, bd = 4.5;
    found.forEach((p, i) => { if (!used.has(i)) { const d = Math.hypot(p.x - g.x, p.y - g.y); if (d < bd) { bd = d; best = i; } } });
    if (best >= 0) { hit++; used.add(best); }
  });
  return { hit, fp: found.length - hit, miss: gt.length - hit };
}

async function main() {
  const fn = require(path.join(FN_DIR, 'index.js'));
  const yellow = fx.routes.find((r) => r.color === 'yellow');

  if (REAL) {
    if (!process.env.VISION_API_KEY) throw new Error('--real 需要 VISION_API_KEY');
    for (const r of fx.routes) {
      const res = await fn.main({ fileID: 'local', color: r.color });
      const s = score(r.holds, res.holds);
      console.log(r.color, 'llm=' + res.llm, '真值', r.holds.length, '输出', res.holds.length, '命中', s.hit, '误检', s.fp, '漏检', s.miss, res.stats || '');
    }
    return;
  }

  // 1. 未配置模型：直接返回算法候选
  delete process.env.VISION_API_KEY;
  const base = await fn.main({ fileID: 'local', color: 'yellow' });
  assert.strictEqual(base.ok, true);
  assert.strictEqual(base.llm, false);
  assert.ok(base.holds.length >= 10, '算法候选应覆盖黄线');
  console.log('✓ 未配置模型 → 算法候选', base.holds.length, '个');

  // 2. 模型复核：剔除左侧海报上的候选（x < 10），把最低的点标为起步，补一个点
  const cands = base.holds.map((h, i) => ({ id: i + 1, x: h.x, y: h.y }));
  const keep = cands.filter((c) => c.x > 10).map((c) => c.id);
  const lowest = cands.filter((c) => c.x > 10).sort((a, b) => b.y - a.y)[0].id;
  const stub = await stubServer(JSON.stringify({ keep: keep, start: [lowest], add: [{ x: 50, y: 50 }, { x: 'bad', y: 1 }, { x: 999, y: 20 }] }));
  process.env.VISION_API_KEY = 'test-key';
  process.env.VISION_API_URL = stub.url;
  process.env.VISION_MODEL = 'stub-model';
  const reviewed = await fn.main({ fileID: 'local', color: 'yellow' });
  assert.strictEqual(reviewed.llm, true);
  assert.strictEqual(stub.seen[0].auth, 'Bearer test-key');
  assert.strictEqual(stub.seen[0].json.model, 'stub-model');
  assert.ok(stub.seen[0].json.messages[0].content.some((c) => c.type === 'text' && c.text.indexOf('黄色') >= 0), '提示词应带目标颜色');
  assert.ok(reviewed.holds.every((h) => h.x > 10 || h.x === 50 || h.x === 100), '海报上的候选应被剔除');
  assert.strictEqual(reviewed.holds.filter((h) => h.s).length, 1, '应标出 1 个起步点');
  assert.ok(reviewed.holds.some((h) => h.x === 50 && h.y === 50), '应补上模型给的点');
  assert.ok(reviewed.holds.some((h) => h.x === 100 && h.y === 20), '越界坐标应被夹到 0~100');
  const s1 = score(yellow.holds, base.holds), s2 = score(yellow.holds, reviewed.holds);
  console.log('✓ 模型复核 → 输出', reviewed.holds.length, '个；黄线误检', s1.fp, '→', s2.fp, '；标记图 out/marks-1.jpg');
  stub.server.close();

  // 3. 模型回复不合法 → 退回算法候选，不抛错
  const bad = await stubServer('抱歉，我看不清这张图');
  process.env.VISION_API_URL = bad.url;
  const fallback = await fn.main({ fileID: 'local', color: 'yellow' });
  assert.strictEqual(fallback.ok, true);
  assert.strictEqual(fallback.llm, false);
  assert.strictEqual(fallback.holds.length, base.holds.length);
  console.log('✓ 模型回复不可解析 → 退回算法候选');
  bad.server.close();

  // 4. beta 模式：按手序编号画图，返回 tips / moves
  const betaStub = await stubServer((req) => {
    const text = req.messages[0].content.find((c) => c.type === 'text').text;
    assert.ok(text.indexOf('V3') >= 0 && text.indexOf('起步点') >= 0);
    return '```json\n{"tips":["起步坐姿，先收紧核心","3→4 跨度最大，小个子先找左侧脚点"],"moves":["S1→1：右手侧拉","1→2：左手上推"]}\n```';
  });
  process.env.VISION_API_URL = betaStub.url;
  const pink = fx.routes.find((r) => r.color === 'pink');
  const route = require('../../cloudfunctions/initDb/real-content').WALLS[0].holds.r_ms5qhrfxbrso0;
  const beta = await fn.main({ mode: 'beta', fileID: 'local', color: 'pink', grade: 'V3', holds: route });
  assert.strictEqual(beta.ok, true);
  assert.strictEqual(beta.tips.length, 2);
  assert.strictEqual(beta.moves.length, 2);
  console.log('✓ beta 模式 → tips', beta.tips.length, '条 / moves', beta.moves.length, '段；标记图 out/marks-3.jpg（手序编号）');
  betaStub.server.close();
  void pink;

  // 5. beta 模式未配置模型 → ok:false，客户端用规则预判兜底
  delete process.env.VISION_API_KEY;
  const off = await fn.main({ mode: 'beta', fileID: 'local', holds: route });
  assert.strictEqual(off.ok, false);
  console.log('✓ beta 模式未配置模型 → ok:false');

  console.log('\n全部通过');
}

main().catch((e) => { console.error(e); process.exit(1); });
