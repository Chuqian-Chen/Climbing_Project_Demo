// 分镜脚本：每章 = 右侧要点 + 讲解字幕 + 左侧手机里的真实操作
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
      '<em>易掉点</em>提醒 + 适合身高区间',
      '起手 / 中段 / 收尾 三段式拆解',
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

// 讲解字幕（竖屏显示在手机下方；横屏不显示，只用来控制节奏）。一句话一个点，越短越好读
const captions = {
  intro: '去岩馆不知道怎么爬？试试岩友 Beta',
  home1: '首页：大家分享的 Beta 流',
  home2: '人在馆里，本馆 Beta 置顶；按身高标「适合你」',
  home3: '按难度档一键筛选',
  beta1: '易掉点单独提醒，标明适合身高',
  beta2: '起手 / 中段 / 收尾，三步拆解',
  route1: '难度共识：偏软、准确还是偏辣',
  check1: '闪送 / 完攀 / 磕线中，三下记好',
  check2: '解锁成就，一键生成打卡海报',
  log1: '足迹：热力图、完攀金字塔、成就徽章',
  gym1: '北京上海 130+ 家岩馆，按距离排序',
  gym2: '馆详情：分级标准、墙面照、线路列表',
  wall1: 'TA山主墙真实照片，岩点由岩友圈注',
  wall2: '点徽章，整条线按手序连起来',
  wall3: 'AI 按岩点位置拆解手序',
  pub1: '看懂了，就发一条自己的 Beta',
  pub2: '发布后直接挂到这条线下面',
  outro: '岩友 Beta：找 Beta、记完攀、按图找线'
};

const OUTRO = [
  '<div class="cover-logo">岩</div>',
  '<div class="cover-title">岩友Beta</div>',
  '<div class="cover-tag">找 Beta · 记完攀 · 按图找线</div>',
  '<div class="cover-points"><span>首页 Beta 流</span><span>≤3 步打卡</span><span>足迹与成就</span><span>墙面圈点 + AI</span></div>',
  '<div class="cover-meta">github.com/Chuqian-Chen/Climbing_Project_Demo<br>本视频由 tools/demo-video 从源码自动录制</div>'
].join('');

// 节奏：caption() 出字幕后不阻塞，操作同时进行；下一句会等上一句播完；
// waitCaption() 用在换页前，保证这一页的字幕看完。chapter() 不 await = 章节标题与页面跳转同时切换
async function run(s) {
  /* ---------- 片头 ---------- */
  await s.wait(500);
  await s.caption('intro');
  await s.waitCaption(200);
  await s.chapter(0);
  await s.cover(false);
  await s.wait(500);

  /* ---------- 01 首页 ---------- */
  await s.bullet(0);
  await s.caption('home1');
  await s.waitCaption();
  await s.bullet(1);
  await s.caption('home2');
  await s.waitCaption();
  await s.caption('home3');
  await s.tap('.band-chip', { text: 'V3-V4' });
  await s.bullet(2);
  await s.scroll(330, 1000);
  await s.wait(250);
  await s.scroll(-330, 800);
  await s.waitCaption();

  /* ---------- 02 Beta 详情 ---------- */
  s.chapter(1);
  await s.tap('beta-tile .bt', { text: '起手双拍直上版', fy: 0.3, after: 500 });
  await s.bullet(0);
  await s.caption('beta1');
  await s.waitCaption();
  await s.bullet(1);
  await s.caption('beta2');
  await s.scroll(360, 1000);
  await s.waitCaption(150);
  await s.bullet(2);

  /* ---------- 03 线路详情 · 打卡 ---------- */
  s.chapter(2);
  await s.tap('.route-link', { after: 500 });
  await s.bullet(0);
  await s.caption('route1');
  await s.scroll(330, 1000);
  await s.waitCaption();
  await s.caption('check1');
  await s.tap('.act-main', { after: 450 });
  await s.bullet(1);
  await s.tap('.res', { text: '闪送', after: 250 });
  await s.tap('.feel-chip', { text: '准确', after: 200 });
  await s.type('.note', '终于一把过！', { delay: 70 });
  await s.waitCaption();
  await s.tap('.btn-primary', { text: '打卡', after: 450 });
  await s.bullet(2);
  await s.caption('check2');
  await s.tap('.done-btn', { after: 900 });
  await s.scroll(260, 900);
  await s.waitCaption(300);

  /* ---------- 04 足迹 ---------- */
  s.chapter(3);
  await s.tap('.done-link', { text: '查看足迹', after: 400 });
  await s.bullet(0);
  await s.caption('log1');
  await s.wait(900);
  await s.bullet(1);
  await s.scroll(250, 1000);
  await s.bullet(2);
  await s.scroll(330, 1000);
  await s.waitCaption(400);

  /* ---------- 05 岩馆 ---------- */
  s.chapter(4);
  await s.tab(1);
  await s.bullet(0);
  await s.caption('gym1');
  await s.tap('.city-chip', { text: '上海', after: 300 });
  await s.type('.kw-input', 'TA山', { delay: 110 });
  await s.bullet(1);
  await s.waitCaption();
  await s.tap('.gym-card', { text: 'TA山', after: 500 });
  await s.bullet(2);
  await s.caption('gym2');
  await s.wait(600);
  await s.scroll(200, 900);
  await s.waitCaption(200);

  /* ---------- 06 墙面圈点 · AI ---------- */
  s.chapter(5);
  await s.tap('.wp-item', { after: 600 });
  await s.bullet(0);
  await s.caption('wall1');
  await s.waitCaption();
  await s.caption('wall2');
  await s.tap('.marker', { text: 'V3', after: 1000 });
  await s.tap('.marker', { text: 'V2', after: 900 });
  await s.tap('.marker', { text: 'V3', after: 500 });
  await s.waitCaption();
  await s.tap('.beta-jump', { after: 600 });
  await s.bullet(1);
  await s.bullet(2);
  await s.caption('wall3');
  await s.wait(600);
  await s.scrollTo('.ai');
  await s.waitCaption(700);

  /* ---------- 07 发布 Beta ---------- */
  s.chapter(6);
  await s.tap('.section-more', { text: '发我的Beta', after: 500 });
  await s.bullet(0);
  await s.caption('pub1');
  await s.nextMedia(['/assets/demo/climb6.jpg']);
  await s.tap('.media-add', { after: 450 });
  await s.bullet(1);
  await s.type('.title-input', '小个子版：先高脚再侧拉', { delay: 55 });
  await s.type('.step-input', '起步双手捏贴标点，右脚高踩到胯边', { nth: 0, delay: 40 });
  await s.tap('.tag', { text: '高脚', after: 250 });
  await s.waitCaption();
  await s.scrollTo('.submit');
  await s.tap('.submit', { after: 800 });
  await s.bullet(2);
  await s.caption('pub2');
  await s.scrollTo('beta-card');
  await s.waitCaption(700);

  /* ---------- 片尾 ---------- */
  await s.cover(true, OUTRO);
  await s.wait(400);
  await s.caption('outro');
  await s.waitCaption(1200);
}

module.exports = { chapters, captions, run };
