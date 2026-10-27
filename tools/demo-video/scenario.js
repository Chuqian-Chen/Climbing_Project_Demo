// 分镜脚本：每章 = 右侧字幕 + 左侧手机里的真实操作
// 改分镜只需改这里；选择器都在当前页（[data-top]）内查找，global:true 时全局查找
const chapters = [
  {
    label: '首页',
    title: '首页 · 大家的 Beta',
    desc: '双列瀑布流，打开就能看到别人怎么爬这条线。',
    bullets: [
      '人在馆内 2km：本馆 Beta 置顶，打<em>「本馆」</em>标',
      '按身高臂展匹配，打<em>「适合你」</em>标签',
      '难度档一键筛选：V0-V2 / V3-V4 / V5-V6 …'
    ]
  },
  {
    label: 'Beta 详情',
    title: 'Beta 详情',
    desc: '视频 / 图文分步拆解，把一条线讲清楚。',
    bullets: [
      '起手 / 中段 / 收尾 三段式拆解',
      '<em>易掉点</em>提醒 + 适合身高区间',
      '从 Beta 直达线路，跟练后直接打卡'
    ]
  },
  {
    label: '打卡',
    title: '线路详情 · 打卡',
    desc: '线路身份 = 馆 · 墙 · 岩点颜色 · 难度。',
    bullets: [
      '定级共识条：偏软 / 准确 / 偏辣 三档投票',
      '闪送 / 完攀 / 磕线中，<em>≤3 次点击</em>记下一次完攀',
      '即时解锁成就，Canvas 生成打卡海报'
    ]
  },
  {
    label: '足迹',
    title: '我的足迹',
    desc: '把每次上墙沉淀成个人数据。',
    bullets: [
      '完攀数 · 最高难度 · 连续打卡周',
      '近 10 周上墙热力图 + 完攀金字塔',
      '8 枚成就徽章，刚才那次闪送已点亮'
    ]
  },
  {
    label: '岩馆',
    title: '岩馆名录',
    desc: '北京 / 上海 130+ 家岩馆，按定位距离排序。',
    bullets: [
      '城市切换 + 关键词即时筛选',
      '门票价格、最近地铁站一眼可见',
      '馆详情：本馆分级标准、墙面照、线路列表'
    ]
  },
  {
    label: '墙面圈点',
    title: '按图找线 · AI 预判',
    desc: 'TA山主墙真实墙照，线路与岩点由岩友在真机上圈注。',
    bullets: [
      '点难度徽章：高亮整条线的岩点并按手序连线',
      '线路详情直接圈出本线全部岩点',
      '<em>AI 路线预判</em>：按岩点几何拆解手序（实验性）'
    ]
  },
  {
    label: '发布',
    title: '发布 Beta',
    desc: '从线路一键发 Beta，分步模板降低写作门槛。',
    bullets: [
      '已选好馆和线，素材可选',
      '标题 + 三段式拆解 + 动作标签',
      '发布后立刻挂到这条线下面'
    ]
  }
];

const OUTRO = [
  '<div class="cover-logo">岩</div>',
  '<div class="cover-title">岩友Beta</div>',
  '<div class="cover-tag">找 Beta · 记完攀 · 按图找线</div>',
  '<div class="cover-points"><span>首页 Beta 流</span><span>≤3 步打卡</span><span>足迹与成就</span><span>墙面圈点 + AI</span></div>',
  '<div class="cover-meta">github.com/Chuqian-Chen/Climbing_Project_Demo · 本视频由 tools/demo-video 从源码自动录制</div>'
].join('');

// 换章：字幕与页面跳转同时开始（chapter 不 await，手指移动的同时字幕切换）
async function run(s) {
  /* ---------- 片头 ---------- */
  await s.wait(2600);
  await s.chapter(0);
  await s.cover(false);
  await s.wait(1300);

  /* ---------- 01 首页 ---------- */
  await s.bullet(0);
  await s.wait(1500);
  await s.bullet(1);
  await s.wait(1300);
  await s.tap('.band-chip', { text: 'V3-V4' });
  await s.bullet(2);
  await s.wait(900);
  await s.scroll(330, 1500);
  await s.wait(700);
  await s.scroll(-330, 1100);
  await s.wait(300);

  /* ---------- 02 Beta 详情 ---------- */
  s.chapter(1);
  await s.tap('beta-tile .bt', { text: '起手双拍直上版', fy: 0.3, after: 900 });
  await s.bullet(0);
  await s.wait(700);
  await s.scroll(330, 1500);
  await s.bullet(1);
  await s.wait(1400);
  await s.scroll(330, 1400);
  await s.wait(900);
  await s.bullet(2);
  await s.wait(500);

  /* ---------- 03 线路详情 · 打卡 ---------- */
  s.chapter(2);
  await s.tap('.route-link', { after: 900 });
  await s.bullet(0);
  await s.scroll(330, 1500);
  await s.wait(1300);
  await s.tap('.act-main', { after: 900 });
  await s.bullet(1);
  await s.tap('.res', { text: '闪送', after: 600 });
  await s.tap('.feel-chip', { text: '准确', after: 500 });
  await s.type('.note', '终于一把过！双拍时机对了');
  await s.wait(400);
  await s.tap('.btn-primary', { text: '打卡', after: 1100 });
  await s.bullet(2);
  await s.wait(800);
  await s.tap('.done-btn', { after: 1600 });
  await s.scroll(260, 1200);
  await s.wait(1400);

  /* ---------- 04 足迹 ---------- */
  s.chapter(3);
  await s.tap('.done-link', { text: '查看足迹', after: 700 });
  await s.bullet(0);
  await s.wait(1200);
  await s.bullet(1);
  await s.scroll(250, 1400);
  await s.wait(1000);
  await s.bullet(2);
  await s.scroll(330, 1400);
  await s.wait(1600);

  /* ---------- 05 岩馆 ---------- */
  s.chapter(4);
  await s.tab(1);
  await s.wait(500);
  await s.bullet(0);
  await s.tap('.city-chip', { text: '上海', after: 700 });
  await s.type('.kw-input', 'TA山', { delay: 160 });
  await s.bullet(1);
  await s.wait(700);
  await s.tap('.gym-card', { text: 'TA山', after: 1000 });
  await s.bullet(2);
  await s.wait(900);
  await s.scroll(200, 1100);
  await s.wait(900);

  /* ---------- 06 墙面圈点 · AI ---------- */
  s.chapter(5);
  await s.tap('.wp-item', { after: 1100 });
  await s.bullet(0);
  await s.tap('.marker', { text: 'V3', after: 1500 });
  await s.tap('.marker', { text: 'V2', after: 1500 });
  await s.tap('.marker', { text: 'V3', after: 1300 });
  await s.tap('.beta-jump', { after: 1000 });
  await s.bullet(1);
  await s.wait(1500);
  await s.bullet(2);
  await s.scrollTo('.ai');
  await s.wait(2600);

  /* ---------- 07 发布 Beta ---------- */
  s.chapter(6);
  await s.tap('.section-more', { text: '发我的Beta', after: 900 });
  await s.bullet(0);
  await s.wait(700);
  await s.nextMedia(['/assets/demo/climb6.jpg']);
  await s.tap('.media-add', { after: 900 });
  await s.bullet(1);
  await s.type('.title-input', '小个子版：先高脚再侧拉');
  await s.type('.step-input', '起步双手捏贴标点，右脚高踩到胯边', { nth: 0, delay: 80 });
  await s.tap('.tag', { text: '高脚', after: 400 });
  await s.scrollTo('.submit');
  await s.wait(500);
  await s.tap('.submit', { after: 1500 });
  await s.bullet(2);
  await s.scrollTo('beta-card');
  await s.wait(2400);

  /* ---------- 片尾 ---------- */
  await s.cover(true, OUTRO);
  await s.wait(4200);
}

module.exports = { chapters, run };
