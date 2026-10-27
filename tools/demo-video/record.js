// 录制演示视频：编译小程序 → 本地起服务 → Chromium 按 scenario.js 自动操作 → CDP 逐帧采集 → ffmpeg 合成 MP4
//
//   node tools/demo-video/record.js                                  # 横屏 1080p
//   node tools/demo-video/record.js --layout vertical --captions     # 竖屏 9:16 + 讲解字幕（视频号）
//   node tools/demo-video/record.js --rate 1.5                       # 成片整体加速（默认 1.25）
//   node tools/demo-video/record.js --out docs/demo/demo.mp4 --keep-frames
//   node tools/demo-video/record.js --dry                            # 只跑流程不录（排查脚本用）
//
// 依赖：playwright（含 chromium）、ffmpeg（PATH 中）
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { start } = require('./serve');
const scenario = require('./scenario');

// 画布尺寸（CSS 像素）× dpr = 输出分辨率
const LAYOUTS = {
  horizontal: { w: 1600, h: 900, dpr: 1.2, name: 'yanyou-beta-demo' },          // 1920×1080
  vertical: { w: 630, h: 1120, dpr: 1080 / 630, name: 'yanyou-beta-vertical' }  // 1080×1920
};

function parseArgs(argv) {
  const o = { layout: 'horizontal', fps: 30, crf: 20, rate: 1.25, keepFrames: false, dry: false, headed: false, captions: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = path.resolve(argv[++i]);
    else if (a === '--layout') o.layout = argv[++i];
    else if (a === '--dpr') o.dpr = +argv[++i];
    else if (a === '--fps') o.fps = +argv[++i];
    else if (a === '--crf') o.crf = +argv[++i];
    else if (a === '--rate') o.rate = +argv[++i];
    else if (a === '--captions') o.captions = true;
    else if (a === '--keep-frames') o.keepFrames = true;
    else if (a === '--dry') o.dry = true;
    else if (a === '--headed') o.headed = true;
  }
  const L = LAYOUTS[o.layout];
  if (!L) throw new Error('--layout 只支持 horizontal / vertical');
  if (!(o.rate > 0)) throw new Error('--rate 需为正数');
  o.stageW = L.w;
  o.stageH = L.h;
  o.dpr = o.dpr || L.dpr;
  o.outW = Math.round(L.w * o.dpr / 2) * 2;
  o.outH = Math.round(L.h * o.dpr / 2) * 2;
  o.out = o.out || path.join(__dirname, 'out', L.name + '.mp4');
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
    maxWidth: opts.outW,
    maxHeight: opts.outH,
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

// 每帧时长 = 到下一帧的真实间隔 ÷ rate，即整体加速
function encode(frames, endTs, out, opts) {
  if (!frames.length) throw new Error('没有采集到任何帧');
  const list = path.join(path.dirname(frames[0].file), 'list.txt');
  let txt = '';
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].ts : endTs;
    const dur = Math.max(0.001, (next - frames[i].ts) / opts.rate);
    txt += "file '" + frames[i].file.replace(/'/g, "'\\''") + "'\nduration " + dur.toFixed(4) + '\n';
  }
  // concat demuxer 需要重复最后一帧才会采用最后的 duration
  txt += "file '" + frames[frames.length - 1].file.replace(/'/g, "'\\''") + "'\n";
  fs.writeFileSync(list, txt);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'scale=' + opts.outW + ':' + opts.outH + ':flags=lanczos,fps=' + opts.fps + ',format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(opts.crf),
    '-movflags', '+faststart',
    out
  ], { stdio: 'inherit' });
  return out;
}

function exportCover(video, at) {
  const poster = video.replace(/\.mp4$/, '-cover.jpg');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-q:v', '3', poster]);
  return poster;
}

/* ---------------- 操作原语 ---------------- */

function makeHelpers(page, log, opts) {
  const sleep = (ms) => page.waitForTimeout(ms);
  const top = (sel) => page.locator('[data-top] ' + sel);
  let captionUntil = 0;
  let capToken = 0;

  async function locate(sel, o) {
    o = o || {};
    let loc = o.global ? page.locator(sel) : top(sel);
    if (o.text) loc = loc.filter({ hasText: o.text });
    loc = loc.nth(o.nth || 0);
    await loc.waitFor({ state: 'attached', timeout: 8000 });
    return loc;
  }

  // 目标不在可视区时，先用手指把它滑进视野
  async function ensureVisible(loc, o) {
    if (o && o.global) return;
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
      await page.evaluate(({ x, y, dy }) => window.stage.swipe(x, y, dy, Math.min(1100, 400 + Math.abs(dy))), info);
      await sleep(200);
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

    // 一句讲解字幕：等上一句播完再出，显示后不阻塞后续操作。
    // 停留时长按阅读速度算，并乘以 rate —— 成片加速后字幕仍有足够的阅读时间。
    // 横屏不显示字幕（右侧有要点），但同样按这个时长控制节奏
    async caption(id) {
      const text = scenario.captions[id];
      if (!text) throw new Error('scenario.captions 里没有：' + id);
      const wait = captionUntil - Date.now();
      if (wait > 0) await sleep(wait + 100);
      const ms = opts.rate * Math.max(1600, 300 + text.length * 170);
      if (opts.captions) {
        const token = ++capToken;
        await page.evaluate((t) => window.stage.subtitle(t), text);
        setTimeout(() => {
          if (token === capToken) page.evaluate(() => window.stage.subtitle('')).catch(() => {});
        }, ms);
      }
      captionUntil = Date.now() + ms;
    },
    // 等当前字幕播完（可再多停 extra 毫秒），用在换页前
    async waitCaption(extra) {
      const wait = captionUntil - Date.now();
      if (wait > 0) await sleep(wait);
      if (extra) await sleep(extra);
    },

    async tap(sel, o) {
      o = o || {};
      const loc = await locate(sel, o);
      await ensureVisible(loc, o);
      const box = await loc.boundingBox();
      if (!box) throw new Error('元素不可见：' + sel);
      const x = box.x + box.width * (o.fx != null ? o.fx : 0.5);
      const y = box.y + box.height * (o.fy != null ? o.fy : 0.5);
      await page.evaluate(({ x, y }) => window.stage.touchMove(x, y), { x, y });
      await sleep(o.approach || 320);
      await page.evaluate(() => window.stage.touchPress(true));
      await page.mouse.move(x, y);
      await page.mouse.down();
      await sleep(o.hold || 80);
      await page.mouse.up();
      await page.evaluate(() => window.stage.touchPress(false));
      await sleep(120);
      await page.evaluate(() => window.stage.touchHide());
      await sleep(o.after != null ? o.after : 350);
    },

    async type(sel, text, o) {
      o = o || {};
      await h.tap(sel, Object.assign({ after: 200 }, o));
      await page.keyboard.type(text, { delay: o.delay || 70 });
      await sleep(250);
    },

    async scroll(dy, ms) {
      const body = await page.locator('[data-top] .mp-body').boundingBox();
      await page.evaluate(({ x, y, dy, ms }) => window.stage.swipe(x, y, dy, ms),
        { x: body.x + body.width * 0.62, y: body.y + body.height * (dy > 0 ? 0.72 : 0.3), dy, ms: ms || 1000 });
      await sleep(150);
    },

    async scrollTo(sel, o) {
      const loc = await locate(sel, o);
      await ensureVisible(loc, o);
    },

    // 选择器弹层已打开时：依次把各列滚到目标行，再点「确定」
    async pick(values) {
      await page.locator('#mp-overlay .mp-picker-wrap').waitFor();
      await sleep(400);
      for (let ci = 0; ci < values.length; ci++) {
        await page.evaluate(({ ci, v }) => document.querySelector('#mp-overlay .mp-picker-wrap').__select(ci, v), { ci, v: values[ci] });
        await sleep(550);
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
  const log = (...a) => console.log('[record]', ...a);
  log('布局 ' + opts.layout + ' → ' + opts.outW + '×' + opts.outH + ' · ' + opts.rate + '× 速' + (opts.captions ? ' · 字幕' : ''));

  const server = await start(0);
  const port = server.address().port;
  const browser = await chromium.launch({ headless: !opts.headed });
  const context = await browser.newContext({
    viewport: { width: opts.stageW, height: opts.stageH },
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

  await page.goto('http://127.0.0.1:' + port + '/?cover=1&layout=' + opts.layout);
  await page.waitForFunction(() => window.__stageReady);
  await page.evaluate((list) => window.stage.setChapters(list), scenario.chapters.map((c) => ({ label: c.label })));
  // 预热：等图片解码
  await page.waitForTimeout(1200);

  const framesDir = path.join(__dirname, 'out', 'frames-' + opts.layout);
  const rec = opts.dry ? null : await startRecording(page, framesDir, opts);
  const t0 = Date.now();
  let ok = false;
  try {
    await scenario.run(makeHelpers(page, log, opts));
    ok = true;
  } finally {
    const end = rec ? await rec.stop() : 0;
    log('脚本耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    await browser.close();
    server.close();
    // 分镜中途出错就不编码，免得把半截视频当成品
    if (rec && !ok) fs.rmSync(framesDir, { recursive: true, force: true });
    if (rec && ok) {
      log('采集 ' + rec.frames.length + ' 帧，编码中…');
      encode(rec.frames, end, opts.out, opts);
      // 竖屏取片头卡（可直接做视频号封面），横屏取首页画面；时间按真实录制时刻换算
      const poster = exportCover(opts.out, (opts.layout === 'vertical' ? 0.5 : 6) / opts.rate);
      if (!opts.keepFrames) fs.rmSync(framesDir, { recursive: true, force: true });
      log('完成 → ' + path.relative(process.cwd(), opts.out) + '（' + ((end - rec.frames[0].ts) / opts.rate).toFixed(1) + 's）');
      log('封面 → ' + path.relative(process.cwd(), poster));
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
