// 调试用：逐页截图，检查模拟器渲染是否和真机一致
// node tools/demo-video/shot.js [outDir] [route?query ...]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { start } = require('./serve');

(async () => {
  const out = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'shots'));
  const routes = process.argv.slice(3);
  fs.mkdirSync(out, { recursive: true });
  const server = await start(0);
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page:' + m.type() + ']', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('http://127.0.0.1:' + port + '/');
  await page.waitForFunction(() => window.__stageReady);
  await page.waitForTimeout(800);
  const list = routes.length ? routes : ['pages/home/home'];
  for (const r of list) {
    if (r !== 'pages/home/home') {
      await page.evaluate((u) => {
        const tabs = ['pages/home/home', 'pages/gyms/gyms', 'pages/logbook/logbook', 'pages/profile/profile'];
        const route = u.split('?')[0];
        if (tabs.includes(route)) wx.switchTab({ url: '/' + route });
        else wx.navigateTo({ url: '/' + u });
      }, r);
      await page.waitForTimeout(900);
    }
    const file = path.join(out, r.replace(/[/?=&]/g, '_') + '.png');
    await page.locator('#mp-screen').screenshot({ path: file });
    console.log('saved', path.relative(process.cwd(), file));
  }
  await browser.close();
  server.close();
})();
