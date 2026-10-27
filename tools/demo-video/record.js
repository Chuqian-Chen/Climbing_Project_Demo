// 录制演示视频：编译小程序 → 本地起服务 → Chromium 按 scenario.js 自动操作 → CDP 逐帧采集 → ffmpeg 合成 MP4
//
//   node tools/demo-video/record.js                         # 输出 tools/demo-video/out/yanyou-beta-demo.mp4
//   node tools/demo-video/record.js --out docs/demo/demo.mp4 --dpr 1.2 --keep-frames
//   node tools/demo-video/record.js --dry                   # 只跑流程不录（排查脚本用）
//
// 依赖：playwright（含 chromium）、ffmpeg（PATH 中）
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { start } = require('./serve');
const scenario = require('./scenario');

const STAGE_W = 1600;
const STAGE_H = 900;

function parseArgs(argv) {
  const o = { out: path.join(__dirname, 'out', 'yanyou-beta-demo.mp4'), dpr: 1.2, fps: 30, crf: 20, keepFrames: false, dry: false, headed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = path.resolve(argv[++i]);
    else if (a === '--dpr') o.dpr = +argv[++i];
    else if (a === '--fps') o.fps = +argv[++i];
    else if (a === '--crf') o.crf = +argv[++i];
    else if (a === '--keep-frames') o.keepFrames = true;
    else if (a === '--dry') o.dry = true;
    else if (a === '--headed') o.headed = true;
  }
  return o;
}

/* ---------------- 录制 ---------------- */

async function startRecording(page, dir, opts) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const client = await page.context().newCDPSession(page);
  const frames = [];
  let stopped = false;
  client.on('Page.screencastFrame', (f) => {
    client.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    if (stopped) return;
    const file = path.join(dir, String(frames.length).padStart(6, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, ts: f.metadata.timestamp || Date.now() / 1000 });
  });
  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 95,
    maxWidth: Math.round(STAGE_W * opts.dpr),
    maxHeight: Math.round(STAGE_H * opts.dpr),
    everyNthFrame: 1
  });
  return {
    frames,
    async stop() {
      const end = Date.now() / 1000;
      await client.send('Page.stopScreencast').catch(() => {});
      stopped = true;
      return end;
    }
  };
}

function encode(frames, endTs, out, opts) {
  if (!frames.length) throw new Error('没有采集到任何帧');
  const list = path.join(path.dirname(frames[0].file), 'list.txt');
  let txt = '';
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].ts : endTs;
    const dur = Math.max(0.001, next - frames[i].ts);
    txt += "file '" + frames[i].file.replace(/'/g, "'\\''") + "'\nduration " + dur.toFixed(4) + '\n';
  }
  // concat demuxer 需要重复最后一帧才会采用最后的 duration
  txt += "file '" + frames[frames.length - 1].file.replace(/'/g, "'\\''") + "'\n";
  fs.writeFileSync(list, txt);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const W = Math.round(STAGE_W * opts.dpr / 2) * 2;
  const H = Math.round(STAGE_H * opts.dpr / 2) * 2;
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'scale=' + W + ':' + H + ':flags=lanczos,fps=' + opts.fps + ',format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(opts.crf),
    '-movflags', '+faststart',
    out
  ], { stdio: 'inherit' });
  // 顺手导出一张封面帧（第 1 章画面）
  const poster = out.replace(/\.mp4$/, '-cover.jpg');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '6', '-i', out, '-frames:v', '1', '-q:v', '3', poster]);
  return { out, poster };
}

/* ---------------- 操作原语 ---------------- */

function makeHelpers(page, log) {
  const sleep = (ms) => page.waitForTimeout(ms);
  const top = (sel) => page.locator('[data-top] ' + sel);

  async function locate(sel, opts) {
    opts = opts || {};
    let loc = opts.global ? page.locator(sel) : top(sel);
    if (opts.text) loc = loc.filter({ hasText: opts.text });
    loc = loc.nth(opts.nth || 0);
    await loc.waitFor({ state: 'attached', timeout: 8000 });
    return loc;
  }

  // 目标不在可视区时，先用手指把它滑进视野
  async function ensureVisible(loc, opts) {
    if (opts && opts.global) return;
    const info = await loc.evaluate((el) => {
      const body = el.closest('.mp-body');
      const sc = body && body.querySelector('.mp-scroll');
      if (!body || !sc || !sc.contains(el)) return null;
      const b = body.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const tb = body.querySelector('custom-tab-bar .tb');
      const bottomLimit = b.bottom - (tb ? tb.getBoundingClientRect().height : 0) - 16;
      if (r.top >= b.top + 8 && r.bottom <= bottomLimit) return null;
      const want = r.top - b.top - (b.height * 0.38);
      return { dy: want, x: b.left + b.width * 0.62, y: b.top + b.height * 0.62 };
    });
    if (info && Math.abs(info.dy) > 4) {
      await page.evaluate(({ x, y, dy }) => window.stage.swipe(x, y, dy, Math.min(1400, 500 + Math.abs(dy) * 1.2)), info);
      await sleep(250);
    }
  }

  const h = {
    page,
    sleep,
    wait: sleep,
    log,

    async chapter(i) {
      log('chapter', i + 1, scenario.chapters[i].title);
      await page.evaluate(({ i, c }) => window.stage.chapter(i, c), { i, c: scenario.chapters[i] });
    },
    bullet(i) {
      return page.evaluate((i) => window.stage.bullet(i), i);
    },
    cover(show, html) {
      return page.evaluate(({ show, html }) => window.stage.cover(show, html), { show, html });
    },

    async tap(sel, opts) {
      opts = opts || {};
      const loc = await locate(sel, opts);
      await ensureVisible(loc, opts);
      const box = await loc.boundingBox();
      if (!box) throw new Error('元素不可见：' + sel);
      const x = box.x + box.width * (opts.fx != null ? opts.fx : 0.5);
      const y = box.y + box.height * (opts.fy != null ? opts.fy : 0.5);
      await page.evaluate(({ x, y }) => window.stage.touchMove(x, y), { x, y });
      await sleep(opts.approach || 420);
      await page.evaluate(() => window.stage.touchPress(true));
      await page.mouse.move(x, y);
      await page.mouse.down();
      await sleep(opts.hold || 90);
      await page.mouse.up();
      await page.evaluate(() => window.stage.touchPress(false));
      await sleep(160);
      await page.evaluate(() => window.stage.touchHide());
      await sleep(opts.after != null ? opts.after : 450);
    },

    async type(sel, text, opts) {
      opts = opts || {};
      await h.tap(sel, Object.assign({ after: 250 }, opts));
      await page.keyboard.type(text, { delay: opts.delay || 110 });
      await sleep(350);
    },

    async scroll(dy, ms) {
      const body = await page.locator('[data-top] .mp-body').boundingBox();
      await page.evaluate(({ x, y, dy, ms }) => window.stage.swipe(x, y, dy, ms),
        { x: body.x + body.width * 0.62, y: body.y + body.height * (dy > 0 ? 0.72 : 0.3), dy, ms: ms || 1200 });
      await sleep(200);
    },

    async scrollTo(sel, opts) {
      const loc = await locate(sel, opts);
      await ensureVisible(loc, opts);
    },

    // 选择器弹层已打开时：依次把各列滚到目标行，再点「确定」
    async pick(values) {
      await page.locator('#mp-overlay .mp-picker-wrap').waitFor();
      await sleep(500);
      for (let ci = 0; ci < values.length; ci++) {
        await page.evaluate(({ ci, v }) => document.querySelector('#mp-overlay .mp-picker-wrap').__select(ci, v), { ci, v: values[ci] });
        await sleep(650);
      }
      await h.tap('#mp-overlay .mp-picker-ok', { global: true });
    },

    // 下一次 wx.chooseMedia 返回的图片
    nextMedia(list) {
      return page.evaluate((l) => { window.__SIM_NEXT_MEDIA__ = l; }, list);
    },

    back() { return h.tap('.mp-nav-back'); },
    tab(i) { return h.tap('custom-tab-bar .tb-item', { nth: i }); },

    async waitText(sel, text) {
      await top(sel).filter({ hasText: text }).first().waitFor({ timeout: 8000 });
    }
  };
  return h;
}

/* ---------------- 主流程 ---------------- */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const server = await start(0);
  const port = server.address().port;
  const browser = await chromium.launch({ headless: !opts.headed });
  const context = await browser.newContext({
    viewport: { width: STAGE_W, height: STAGE_H },
    deviceScaleFactor: opts.dpr,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') { errors.push(t); console.log('[console.error]', t); }
    else if (m.type() === 'warning' && t.indexOf('[sim]') === 0) console.log('[warn]', t);
  });

  const log = (...a) => console.log('[record]', ...a);
  await page.goto('http://127.0.0.1:' + port + '/?cover=1');
  await page.waitForFunction(() => window.__stageReady);
  await page.evaluate((list) => window.stage.setChapters(list), scenario.chapters.map((c) => ({ label: c.label })));
  // 预热：等图片解码
  await page.waitForTimeout(1200);

  const framesDir = path.join(__dirname, 'out', 'frames');
  const rec = opts.dry ? null : await startRecording(page, framesDir, opts);
  const t0 = Date.now();
  try {
    await scenario.run(makeHelpers(page, log));
  } finally {
    const end = rec ? await rec.stop() : 0;
    log('脚本耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    await browser.close();
    server.close();
    if (rec) {
      log('采集 ' + rec.frames.length + ' 帧，编码中…');
      const r = encode(rec.frames, end, opts.out, opts);
      if (!opts.keepFrames) fs.rmSync(framesDir, { recursive: true, force: true });
      log('完成 → ' + path.relative(process.cwd(), r.out));
      log('封面 → ' + path.relative(process.cwd(), r.poster));
    }
  }
  if (errors.length) {
    console.log('[record] 页面报错 ' + errors.length + ' 条（见上方日志）');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
