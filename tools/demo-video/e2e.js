// 核心流程端到端测试：在模拟器里跑真实页面代码，按用户操作断言结果
//   npm test                 # 全部用例
//   npm test -- 打卡          # 只跑标题含「打卡」的用例
// 每个用例独立加载页面（seed 数据重置），互不影响
const assert = require('assert');
const { chromium } = require('playwright');
const { start } = require('./serve');

const cases = [];
const test = (name, fn, opts) => cases.push({ name, fn, opts });

/* ---------------- 工具 ---------------- */

async function openApp(browser, base, opts) {
  opts = opts || {};
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (opts.location) {
    await page.addInitScript((loc) => { window.__SIM_CONFIG__ = { location: loc }; }, opts.location);
  }
  await page.goto(base + '/');
  await page.waitForFunction(() => window.__stageReady);
  await page.waitForTimeout(300);
  const h = {
    page,
    errors,
    data: (expr) => page.evaluate((e) => {
      const d = window.__mpsim.top().data;
      return new Function('d', 'return (' + e + ')')(d);
    }, expr),
    route: () => page.evaluate(() => window.__mpsim.top().route),
    nav: async (url) => { await page.evaluate((u) => wx.navigateTo({ url: u }), url); await page.waitForTimeout(500); },
    tab: async (url) => { await page.evaluate((u) => wx.switchTab({ url: u }), url); await page.waitForTimeout(400); },
    tap: async (sel, text) => {
      let loc = page.locator('[data-top] ' + sel);
      if (text) loc = loc.filter({ hasText: text });
      await loc.first().scrollIntoViewIfNeeded();
      await loc.first().click();
      await page.waitForTimeout(250);
    },
    type: async (sel, text) => { await page.locator('[data-top] ' + sel).first().click(); await page.keyboard.type(text); },
    toast: () => page.evaluate(() => { const t = document.querySelector('.mp-toast-title'); return t ? t.textContent : ''; }),
    count: (sel) => page.locator('[data-top] ' + sel).count()
  };
  return h;
}

const NEAR_G1 = { latitude: 39.9938, longitude: 116.4787 };   // 磐石·望京 377m
const FAR = { latitude: 40.25, longitude: 116.65 };            // 顺义，2km 内没有馆

/* ---------------- 用例 ---------------- */

test('全部页面可渲染、无报错', async (h) => {
  const pages = [
    'pages/gym-detail/gym-detail?id=g1', 'pages/gym-detail/gym-detail?id=sh19',
    'pages/route-detail/route-detail?id=r105', 'pages/beta-detail/beta-detail?id=b1',
    'pages/checkin/checkin?routeId=r105', 'pages/wall-photo/wall-photo?gymId=sh19&wallId=w-main',
    'pages/publish/publish', 'pages/search/search', 'pages/user/user?id=u2',
    'pages/setter-center/setter-center', 'pages/data-admin/data-admin', 'pages/partner/partner'
  ];
  for (const p of pages) {
    await h.nav('/' + p);
    assert.strictEqual(await h.route(), p.split('?')[0], '应打开 ' + p);
    assert.ok(await h.count('.mp-page > *') > 0, p + ' 没有内容');
  }
  for (const t of ['/pages/gyms/gyms', '/pages/logbook/logbook', '/pages/profile/profile', '/pages/home/home']) {
    await h.tab(t);
    assert.strictEqual(await h.route(), t.slice(1));
  }
});

test('首页：在馆内显示到馆卡', async (h) => {
  assert.ok(await h.data('!!d.atGym'), '应识别为在馆内');
  assert.strictEqual(await h.data('d.atGym.id'), 'g1');
  assert.ok(await h.data('d.atGym.projects.length') >= 1, '应列出我在磕的线（seed 有未完攀的 r104）');
  assert.ok(await h.data('d.atGym.projects.some((r) => r.id === "r104")'));
  assert.ok(await h.count('.ag') === 1);
  await h.tap('.ag-proj');
  assert.strictEqual(await h.route(), 'pages/route-detail/route-detail');
}, { location: NEAR_G1 });

test('首页：不在馆时显示本周新线', async (h) => {
  assert.strictEqual(await h.data('d.atGym'), null);
  assert.ok(await h.count('.nr-card') >= 1, '应有本周新线');
  assert.strictEqual(await h.count('.ag'), 0);
}, { location: FAR });

test('首页：难度档筛选', async (h) => {
  await h.tap('.band-chip', 'V3-V4');
  const grades = await h.data('d.betaColL.concat(d.betaColR).map((b) => b.routeGrade)');
  assert.ok(grades.length > 0);
  assert.ok(grades.every((g) => g === 'V3' || g === 'V4'), '筛选后只剩 V3-V4：' + grades.join(','));
});

test('打卡：闪送 → 解锁成就 → 推荐下一条 → 足迹更新', async (h) => {
  await h.tab('/pages/logbook/logbook');
  const before = await h.data('d.stats.totalSends');
  await h.nav('/pages/route-detail/route-detail?id=r105');
  await h.tap('.act-main');
  assert.strictEqual(await h.route(), 'pages/checkin/checkin');
  await h.tap('.res', '闪送');
  await h.tap('.btn-primary', '打卡');
  await h.page.waitForTimeout(300);
  assert.ok(await h.data('d.done'), '应显示打卡成功');
  assert.ok(await h.data('d.doneInfo.newBadges.length') >= 1, '第 10 条完攀应解锁成就');
  const next = await h.data('d.nextRoutes');
  assert.ok(next.length >= 1 && next.length <= 3, '应推荐 1~3 条');
  assert.ok(next.every((r) => r.id !== 'r105'), '不应推荐刚打卡的线');
  await h.tap('.done-link', '足迹');
  assert.strictEqual(await h.route(), 'pages/logbook/logbook');
  assert.strictEqual(await h.data('d.stats.totalSends'), before + 1);
});

test('打卡：海报生成', async (h) => {
  await h.nav('/pages/checkin/checkin?routeId=r101');
  await h.tap('.res', '完攀');
  await h.tap('.btn-primary', '打卡');
  await h.tap('.done-btn');
  await h.page.waitForTimeout(600);
  const poster = await h.data('d.posterPath');
  assert.ok(/^data:image\/png/.test(poster), '应生成 PNG 海报');
});

test('发布：三步向导拦截未填项并发布成功', async (h) => {
  await h.nav('/pages/publish/publish');
  await h.tap('.wz-next');
  assert.strictEqual(await h.data('d.step'), 1, '未选线不能下一步');
  assert.ok((await h.toast()).indexOf('选好') >= 0);
  await h.page.evaluate(() => wx.navigateBack());
  await h.page.waitForTimeout(500);
  await h.nav('/pages/route-detail/route-detail?id=r105');
  const betasBefore = await h.data('d.betas.length');
  await h.nav('/pages/publish/publish?routeId=r105');
  assert.ok(await h.data('d.step1Ok'), '从线路进入应已选好线');
  await h.tap('.wz-next');
  await h.tap('.wz-next');
  assert.strictEqual(await h.data('d.step'), 2, '没写标题不能到第 3 步');
  await h.type('.title-input', '测试 Beta');
  await h.type('.step-input', '起手先上脚');
  await h.tap('.wz-next');
  assert.strictEqual(await h.data('d.step'), 3);
  await h.tap('.submit');
  await h.page.waitForTimeout(1500);
  assert.strictEqual(await h.route(), 'pages/route-detail/route-detail');
  assert.strictEqual(await h.data('d.betas.length'), betasBefore + 1);
});

test('馆详情：有墙照的馆顶部显示按图找线大图', async (h) => {
  await h.nav('/pages/gym-detail/gym-detail?id=sh19');
  assert.strictEqual(await h.data('d.featuredWall.markers.length'), 4);
  assert.strictEqual(await h.count('.fw-mk'), 4);
  await h.tap('.fw');
  assert.strictEqual(await h.route(), 'pages/wall-photo/wall-photo');
  await h.nav('/pages/gym-detail/gym-detail?id=g1');
  assert.strictEqual(await h.data('d.featuredWall'), null);
  assert.strictEqual(await h.count('.fw-empty'), 1, '无墙照应提示拍第一张');
});

test('墙面：点徽章高亮整条线并连线', async (h) => {
  await h.nav('/pages/wall-photo/wall-photo?gymId=sh19&wallId=w-main');
  await h.tap('.marker', 'V3');
  await h.page.waitForTimeout(200);
  assert.ok(await h.data('!!d.selectedId'));
  assert.ok(await h.data('d.segs.length') >= 5, '粉线 12 个点应连出多段');
  await h.tap('.sel-btn', '详情');
  assert.strictEqual(await h.route(), 'pages/route-detail/route-detail');
  assert.ok(await h.data('d.analysis.length') >= 2, '应有规则预判');
  assert.strictEqual(await h.data('d.aiBetaAvailable'), false, '本地照片不出「AI 看图分析」按钮');
});

test('墙面：一键识别全墙找全线路颜色并填入', async (h) => {
  await h.nav('/pages/wall-photo/wall-photo?gymId=sh19&wallId=w-main');
  await h.tap('.edit-toggle');
  await h.tap('.scan-btn');
  await h.page.waitForFunction(() => (window.__mpsim.top().data.scanItems || []).length > 0, null, { timeout: 10000 });
  const colors = await h.data('d.scanItems.map((i) => i.color)');
  for (const c of ['yellow', 'pink', 'green']) assert.ok(colors.indexOf(c) >= 0, '应识别出 ' + c + '：' + colors.join(','));
  const yi = colors.indexOf('yellow');
  await h.page.evaluate((i) => window.__mpsim.top().applyScan({ currentTarget: { dataset: { i } } }), yi);
  await h.page.waitForTimeout(500);
  assert.ok(await h.data('d.scanItems[' + yi + '].done'));
});

test('搜索：能搜到名录岩馆和演示线路', async (h) => {
  await h.nav('/pages/search/search');
  await h.type('input', 'TA山');
  await h.page.keyboard.press('Enter');
  await h.page.waitForTimeout(400);
  assert.ok(await h.data('(d.result && d.result.gyms || d.gyms || []).some((g) => g.name === "TA山")'), '应搜到 TA山');
});

/* ---------------- 运行 ---------------- */

(async () => {
  const filter = process.argv[2] || '';
  const server = await start(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  for (const c of cases.filter((x) => x.name.indexOf(filter) >= 0)) {
    const t0 = Date.now();
    const h = await openApp(browser, base, c.opts);
    try {
      await c.fn(h);
      assert.deepStrictEqual(h.errors, [], '页面报错');
      pass++;
      console.log('✓ ' + c.name + '  (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      fail++;
      console.log('✗ ' + c.name + '\n    ' + (e && e.message));
    } finally {
      await h.page.close();
    }
  }
  await browser.close();
  server.close();
  console.log('\n' + pass + ' 通过，' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
