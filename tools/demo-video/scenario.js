// 分镜脚本：每章 = 字幕要点 + 讲解词 + 左侧手机里的真实操作
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

// 讲解词：text = 字幕；speak = 实际朗读（TTS 读英文缩写不稳，改用中文说法：Beta→贝塔、TA山→他山、AI→人工智能）
const narration = {
  intro: { text: '去攀岩馆，不知道这条线怎么爬？试试岩友 Beta。', speak: '去攀岩馆，不知道这条线怎么爬？试试岩友贝塔。' },
  home1: { text: '首页是大家分享的 Beta，两列瀑布流，打开就能看。', speak: '首页是大家分享的贝塔，两列瀑布流，打开就能看。' },
  home2: { text: '人在馆里两公里内，本馆的 Beta 排在最前面；填了身高，还会标出「适合你」。', speak: '人在馆里两公里以内，本馆的贝塔会排在最前面。填了身高，还会标出适合你。' },
  home3: { text: '想练什么难度，点一下就能筛选。' },
  beta1: { text: '点开一条 Beta，最容易掉的地方单独标出来，还写明适合多高的人。', speak: '点开一条贝塔，最容易掉的地方单独标出来，还写明适合多高的人。' },
  beta2: { text: '起手、中段、收尾，分三步讲清楚。' },
  route1: { text: '跳到线路详情，能看到大家对难度的感受：偏软、准确，还是偏辣。' },
  check1: { text: '爬过之后点打卡，闪送、完攀还是磕线中，点三下就记好。', speak: '爬过之后点打卡，闪送、完攀，还是磕线中，点三下就记好。' },
  check2: { text: '打卡立刻解锁成就，还能一键生成海报，发给岩友。' },
  log1: { text: '足迹页把每次上墙变成数据：热力图、完攀金字塔，还有成就徽章。' },
  gym1: { text: '岩馆页收录北京、上海一百三十多家岩馆，按距离排序，输入名字就能找到。' },
  gym2: { text: '馆详情里有本馆的分级标准、墙面照片和线路列表。' },
  wall1: { text: '这是 TA山主墙的真实照片，每条线的岩点都由岩友在手机上圈好了。', speak: '这是他山主墙的真实照片，每条线的岩点，都由岩友在手机上圈好了。' },
  wall2: { text: '点一下难度徽章，整条线的岩点按手序连起来。' },
  wall3: { text: '线路详情里，AI 会按岩点位置拆解手序，给出建议。', speak: '线路详情里，人工智能会按岩点位置拆解手序，给出建议。' },
  pub1: { text: '看懂了怎么爬，就发一条自己的 Beta：这条线已经带好，加张图，写下拆解。', speak: '看懂了怎么爬，就发一条自己的贝塔。这条线已经带好，加张图，写下拆解。' },
  pub2: { text: '发布之后，它会直接挂在这条线下面，帮到下一个人。' },
  outro: { text: '岩友 Beta：找 Beta、记完攀、按图找线。', speak: '岩友贝塔。找贝塔，记完攀，按图找线。' }
};

const OUTRO = [
  '<div class="cover-logo">岩</div>',
  '<div class="cover-title">岩友Beta</div>',
  '<div class="cover-tag">找 Beta · 记完攀 · 按图找线</div>',
  '<div class="cover-points"><span>首页 Beta 流</span><span>≤3 步打卡</span><span>足迹与成就</span><span>墙面圈点 + AI</span></div>',
  '<div class="cover-meta">github.com/Chuqian-Chen/Climbing_Project_Demo<br>本视频由 tools/demo-video 从源码自动录制</div>'
].join('');

// 节奏：say() 开口后不阻塞，操作与讲解同时进行；下一句 say() 会等上一句说完；
// hush() 用在换页前，保证这一页的话说完。chapter() 不 await = 字幕与页面跳转同时开始
async function run(s) {
  /* ---------- 片头 ---------- */
  await s.wait(800);
  await s.say('intro');
  await s.hush(300);
  await s.chapter(0);
  await s.cover(false);
  await s.wait(700);

  /* ---------- 01 首页 ---------- */
  await s.bullet(0);
  await s.say('home1');
  await s.hush(200);
  await s.bullet(1);
  await s.say('home2');
  await s.hush(200);
  await s.say('home3');
  await s.tap('.band-chip', { text: 'V3-V4' });
  await s.bullet(2);
  await s.scroll(330, 1400);
  await s.wait(400);
  await s.scroll(-330, 1000);
  await s.hush(200);

  /* ---------- 02 Beta 详情 ---------- */
  s.chapter(1);
  await s.tap('beta-tile .bt', { text: '起手双拍直上版', fy: 0.3, after: 700 });
  await s.bullet(0);
  await s.say('beta1');
  await s.hush(200);
  await s.bullet(1);
  await s.say('beta2');
  await s.scroll(360, 1500);
  await s.hush(300);
  await s.bullet(2);

  /* ---------- 03 线路详情 · 打卡 ---------- */
  s.chapter(2);
  await s.tap('.route-link', { after: 700 });
  await s.bullet(0);
  await s.say('route1');
  await s.scroll(330, 1500);
  await s.hush(200);
  await s.say('check1');
  await s.tap('.act-main', { after: 600 });
  await s.bullet(1);
  await s.tap('.res', { text: '闪送', after: 350 });
  await s.tap('.feel-chip', { text: '准确', after: 300 });
  await s.type('.note', '终于一把过！', { delay: 100 });
  await s.hush();
  await s.tap('.btn-primary', { text: '打卡', after: 600 });
  await s.bullet(2);
  await s.say('check2');
  await s.tap('.done-btn', { after: 1200 });
  await s.scroll(260, 1100);
  await s.hush(500);

  /* ---------- 04 足迹 ---------- */
  s.chapter(3);
  await s.tap('.done-link', { text: '查看足迹', after: 500 });
  await s.bullet(0);
  await s.say('log1');
  await s.wait(1300);
  await s.bullet(1);
  await s.scroll(250, 1300);
  await s.bullet(2);
  await s.scroll(330, 1300);
  await s.hush(700);

  /* ---------- 05 岩馆 ---------- */
  s.chapter(4);
  await s.tab(1);
  await s.bullet(0);
  await s.say('gym1');
  await s.tap('.city-chip', { text: '上海', after: 400 });
  await s.type('.kw-input', 'TA山', { delay: 150 });
  await s.bullet(1);
  await s.hush(200);
  await s.tap('.gym-card', { text: 'TA山', after: 700 });
  await s.bullet(2);
  await s.say('gym2');
  await s.wait(900);
  await s.scroll(200, 1100);
  await s.hush(300);

  /* ---------- 06 墙面圈点 · AI ---------- */
  s.chapter(5);
  await s.tap('.wp-item', { after: 800 });
  await s.bullet(0);
  await s.say('wall1');
  await s.hush(200);
  await s.say('wall2');
  await s.tap('.marker', { text: 'V3', after: 1300 });
  await s.tap('.marker', { text: 'V2', after: 1100 });
  await s.tap('.marker', { text: 'V3', after: 700 });
  await s.hush(200);
  await s.tap('.beta-jump', { after: 800 });
  await s.bullet(1);
  await s.bullet(2);
  await s.say('wall3');
  await s.wait(900);
  await s.scrollTo('.ai');
  await s.hush(1000);

  /* ---------- 07 发布 Beta ---------- */
  s.chapter(6);
  await s.tap('.section-more', { text: '发我的Beta', after: 700 });
  await s.bullet(0);
  await s.say('pub1');
  await s.nextMedia(['/assets/demo/climb6.jpg']);
  await s.tap('.media-add', { after: 600 });
  await s.bullet(1);
  await s.type('.title-input', '小个子版：先高脚再侧拉', { delay: 80 });
  await s.type('.step-input', '起步双手捏贴标点，右脚高踩到胯边', { nth: 0, delay: 55 });
  await s.tap('.tag', { text: '高脚', after: 300 });
  await s.hush();
  await s.scrollTo('.submit');
  await s.tap('.submit', { after: 1000 });
  await s.bullet(2);
  await s.say('pub2');
  await s.scrollTo('beta-card');
  await s.hush(900);

  /* ---------- 片尾 ---------- */
  await s.cover(true, OUTRO);
  await s.wait(600);
  await s.say('outro');
  await s.hush(1800);
}

module.exports = { chapters, narration, run };
