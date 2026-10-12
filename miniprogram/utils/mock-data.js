// 演示数据（接入云开发后由数据库集合替代，结构即集合 schema）
// 说明：人物、岩馆、线路均为虚构演示内容
// 日期相对「今天」滚动，保证新线 / 即将拆线 / 时间线永远可演示

function d(offset) {
  const t = new Date();
  t.setDate(t.getDate() + offset);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
}

const USERS = [
  { id: 'u1', nickname: '阿岩', emoji: '🦍', color: '#ffe3d2', height: 175, armSpan: 178, maxGrade: 'V6', homeGymId: 'g1', intro: '动态流，逢 dyno 必冲' },
  { id: 'u2', nickname: 'Momo', emoji: '🐱', color: '#ffe9f2', height: 160, armSpan: 160, maxGrade: 'V4', homeGymId: 'g1', intro: '小个子 Beta 收藏家，高脚才是正义' },
  { id: 'u3', nickname: '大鹏', emoji: '🦅', color: '#e3f0ff', height: 183, armSpan: 188, maxGrade: 'V7', homeGymId: 'g2', intro: '臂展怪，静态锁定爱好者' },
  { id: 'u4', nickname: '小柔', emoji: '🦎', color: '#e8f7ee', height: 165, armSpan: 163, maxGrade: 'V3', homeGymId: 'g1', intro: '入坑三个月，进步中' },
  { id: 'u5', nickname: 'Kiwi', emoji: '🥝', color: '#f0ffe3', height: 170, armSpan: 171, maxGrade: 'V5', homeGymId: 'g2', intro: '兼职定线，主攻协调线', isSetter: true },
  { id: 'u6', nickname: '石头', emoji: '🪨', color: '#ececf0', height: 178, armSpan: 182, maxGrade: 'V8', homeGymId: 'g1', intro: '磐石主力定线员，欢迎反馈线路感受', isSetter: true },
  { id: 'u7', nickname: 'Lynn', emoji: '🐰', color: '#fff3e0', height: 158, armSpan: 156, maxGrade: 'V4', homeGymId: 'g3', intro: '平衡线专精，慢就是快' },
  { id: 'u8', nickname: '老周', emoji: '🐻', color: '#efe8ff', height: 172, armSpan: 174, maxGrade: 'V5', homeGymId: 'g3', intro: '攀龄八年，佛系磕线' }
];

const GYMS = [
  {
    id: 'g1', name: '磐石攀岩 · 望京店', city: '北京', district: '朝阳', area: '朝阳区 望京SOHO T3',
    lat: 39.9966, lng: 116.4812,
    gradient: 'linear-gradient(135deg, #2b2f3a, #4a5164)',
    tags: ['新手友好', '训练区', '可租鞋'],
    openHours: '10:00 - 22:30',
    announcement: '近日屋檐区已换线：8 条新线上墙，欢迎来磕！',
    gradeSystem: [
      { color: 'green', grade: 'V0' }, { color: 'yellow', grade: 'V2' },
      { color: 'blue', grade: 'V3' }, { color: 'red', grade: 'V4' },
      { color: 'orange', grade: 'V5' }, { color: 'black', grade: 'V5' },
      { color: 'purple', grade: 'V6' }, { color: 'pink', grade: 'V7' }
    ],
    walls: [
      { id: 'w11', name: '缓坡区', angle: '5°' },
      { id: 'w12', name: '直壁区', angle: '90°' },
      { id: 'w13', name: '大仰角', angle: '35°' },
      { id: 'w14', name: '屋檐区', angle: 'Roof' }
    ]
  },
  {
    id: 'g2', name: '重力实验室 · 国贸店', city: '北京', district: '朝阳', area: '朝阳区 建外SOHO 西区',
    lat: 39.9087, lng: 116.4594,
    gradient: 'linear-gradient(135deg, #1f3a5f, #2f6ea5)',
    tags: ['竞赛墙', '体能区', '有淋浴'],
    openHours: '10:00 - 23:00',
    announcement: '本周六 19:00 馆内趣味赛「失重之夜」，报名找前台。',
    gradeSystem: [
      { color: 'green', grade: 'V1' }, { color: 'white', grade: 'V3' },
      { color: 'blue', grade: 'V4' }, { color: 'purple', grade: 'V4' },
      { color: 'orange', grade: 'V5' }, { color: 'red', grade: 'V6' }
    ],
    walls: [
      { id: 'w21', name: '竞赛墙', angle: '15°' },
      { id: 'w22', name: '训练板区', angle: '40°' },
      { id: 'w23', name: '波浪墙', angle: '多角度' }
    ]
  },
  {
    id: 'g3', name: '北斗攀岩 · 西二旗店', city: '北京', district: '海淀', area: '海淀区 中关村软件园二期',
    lat: 40.0523, lng: 116.3007,
    gradient: 'linear-gradient(135deg, #3a2b4a, #6a4a8e)',
    tags: ['程序员浓度高', '夜场到24点', '停车方便'],
    openHours: '11:00 - 24:00',
    announcement: '主墙即将换线，收藏的线抓紧完攀！',
    gradeSystem: [
      { color: 'green', grade: 'V0' }, { color: 'yellow', grade: 'V2' },
      { color: 'blue', grade: 'V3' }, { color: 'pink', grade: 'V4' },
      { color: 'red', grade: 'V5' }, { color: 'black', grade: 'V7' }
    ],
    walls: [
      { id: 'w31', name: '新手村', angle: '0°' },
      { id: 'w32', name: '主墙', angle: '20°' },
      { id: 'w33', name: '仰角洞穴', angle: '45°' }
    ]
  }
];

// status: active | archived
const ROUTES = [
  // 磐石·望京
  { id: 'r101', gymId: 'g1', wallId: 'w11', name: '', color: 'green',  grade: 'V0', setterId: 'u6', setDate: d(-8), removeDate: d(23), tags: ['大圆点', '平衡'], sends: 46, attempts: 88,  feel: { soft: 12, fair: 20, hard: 2 }, status: 'active' },
  { id: 'r102', gymId: 'g1', wallId: 'w11', name: '',   color: 'yellow', grade: 'V2', setterId: 'u6', setDate: d(-8), removeDate: d(23), tags: ['侧拉', '重心转换'], sends: 31, attempts: 95, feel: { soft: 5, fair: 16, hard: 6 }, status: 'active' },
  { id: 'r103', gymId: 'g1', wallId: 'w12', name: '',   color: 'blue',   grade: 'V3', setterId: 'u5', setDate: d(-16), removeDate: d(15), tags: ['小点发力', '锁定'], sends: 22, attempts: 110, feel: { soft: 3, fair: 14, hard: 8 }, status: 'active' },
  { id: 'r104', gymId: 'g1', wallId: 'w12', name: '',     color: 'black',  grade: 'V5', setterId: 'u6', setDate: d(-16), removeDate: d(15), tags: ['小点发力', '锁定', '高脚'], sends: 8, attempts: 96, feel: { soft: 1, fair: 9, hard: 11 }, status: 'active' },
  { id: 'r105', gymId: 'g1', wallId: 'w13', name: '',   color: 'red',    grade: 'V4', setterId: 'u8', setDate: d(-23), removeDate: d(8), tags: ['动态跳跃', '挂脚跟'], sends: 15, attempts: 132, feel: { soft: 4, fair: 12, hard: 9 }, status: 'active' },
  { id: 'r106', gymId: 'g1', wallId: 'w13', name: '', color: 'purple', grade: 'V6', setterId: 'u6', setDate: d(-23), removeDate: d(8), tags: ['大圆点', '顶胯', '挂脚跟'], sends: 4, attempts: 87, feel: { soft: 0, fair: 6, hard: 7 }, status: 'active' },
  { id: 'r107', gymId: 'g1', wallId: 'w14', name: '', color: 'orange', grade: 'V5', setterId: 'u5', setDate: d(-3), removeDate: d(28), tags: ['勾脚尖', '核心张力'], sends: 3, attempts: 41, feel: { soft: 2, fair: 4, hard: 3 }, status: 'active' },
  { id: 'r108', gymId: 'g1', wallId: 'w14', name: '',   color: 'pink',   grade: 'V7', setterId: 'u6', setDate: d(-3), removeDate: d(28), tags: ['动态跳跃', '勾脚尖', '双手起跳'], sends: 1, attempts: 38, feel: { soft: 0, fair: 3, hard: 5 }, status: 'active' },

  // 重力实验室·国贸
  { id: 'r201', gymId: 'g2', wallId: 'w21', name: '', color: 'green',  grade: 'V1', setterId: 'u5', setDate: d(-10), removeDate: d(21), tags: ['平衡', '手点顺序'], sends: 39, attempts: 70, feel: { soft: 10, fair: 15, hard: 1 }, status: 'active' },
  { id: 'r202', gymId: 'g2', wallId: 'w21', name: '', color: 'white',  grade: 'V3', setterId: 'u5', setDate: d(-10), removeDate: d(21), tags: ['平衡', '重心转换'], sends: 18, attempts: 92, feel: { soft: 2, fair: 11, hard: 9 }, status: 'active' },
  { id: 'r203', gymId: 'g2', wallId: 'w23', name: '', color: 'blue',   grade: 'V4', setterId: 'u5', setDate: d(-18), removeDate: d(13), tags: ['交叉手', '侧拉'], sends: 12, attempts: 84, feel: { soft: 3, fair: 10, hard: 5 }, status: 'active' },
  { id: 'r204', gymId: 'g2', wallId: 'w22', name: '', color: 'red',    grade: 'V6', setterId: 'u3', setDate: d(-18), removeDate: d(13), tags: ['动态跳跃', '双手起跳'], sends: 5, attempts: 105, feel: { soft: 1, fair: 7, hard: 10 }, status: 'active' },
  { id: 'r205', gymId: 'g2', wallId: 'w22', name: '', color: 'orange', grade: 'V5', setterId: 'u3', setDate: d(-6), removeDate: d(25), tags: ['小点发力', '折膝'], sends: 6, attempts: 58, feel: { soft: 1, fair: 8, hard: 4 }, status: 'active' },
  { id: 'r206', gymId: 'g2', wallId: 'w23', name: '', color: 'purple', grade: 'V4', setterId: 'u5', setDate: d(-6), removeDate: d(25), tags: ['大圆点', '重心转换'], sends: 9, attempts: 66, feel: { soft: 2, fair: 12, hard: 3 }, status: 'active' },

  // 北斗·西二旗
  { id: 'r301', gymId: 'g3', wallId: 'w31', name: '', color: 'green', grade: 'V0', setterId: 'u8', setDate: d(-13), removeDate: d(18), tags: ['大圆点'], sends: 52, attempts: 75, feel: { soft: 18, fair: 12, hard: 0 }, status: 'active' },
  { id: 'r302', gymId: 'g3', wallId: 'w31', name: '',  color: 'yellow', grade: 'V2', setterId: 'u8', setDate: d(-13), removeDate: d(18), tags: ['手点顺序', '平衡'], sends: 27, attempts: 88, feel: { soft: 4, fair: 15, hard: 5 }, status: 'active' },
  { id: 'r303', gymId: 'g3', wallId: 'w32', name: '', color: 'blue',   grade: 'V3', setterId: 'u8', setDate: d(-22), removeDate: d(6), tags: ['挂脚跟', '侧拉'], sends: 20, attempts: 96, feel: { soft: 6, fair: 13, hard: 4 }, status: 'active' },
  { id: 'r304', gymId: 'g3', wallId: 'w32', name: '',  color: 'red',    grade: 'V5', setterId: 'u3', setDate: d(-22), removeDate: d(6), tags: ['勾脚尖', '核心张力'], sends: 7, attempts: 89, feel: { soft: 0, fair: 8, hard: 8 }, status: 'active' },
  { id: 'r305', gymId: 'g3', wallId: 'w33', name: '',  color: 'black',  grade: 'V7', setterId: 'u3', setDate: d(-22), removeDate: d(6), tags: ['小点发力', '动态跳跃', '锁定'], sends: 2, attempts: 64, feel: { soft: 0, fair: 4, hard: 6 }, status: 'active' },
  { id: 'r306', gymId: 'g3', wallId: 'w33', name: '',  color: 'pink',   grade: 'V4', setterId: 'u8', setDate: d(-8), removeDate: d(23), tags: ['动态跳跃', '平衡'], sends: 11, attempts: 72, feel: { soft: 3, fair: 9, hard: 4 }, status: 'active' }
];

// type: video | text
// 演示视频：真实攀爬短片（Pexels 免费授权，已传云存储），全部视频 Beta 共用同一条
const DEMO_VIDEO = 'cloud://cloud1-d9gjpqqv42f005e11.636c-cloud1-d9gjpqqv42f005e11-1459753686/videos/demo-train.mp4';
const BETAS = [
  {
    id: 'b1', routeId: 'r105', userId: 'u1', type: 'video', videoFileID: DEMO_VIDEO, videoDur: '0:12', likes: 128, createdAt: d(-7),
    imageFileIDs: ['/assets/demo/climb3.jpg'],
    caution: '第三个点手顺反了必掉：先右手再左手',
    title: '起手双拍直上版',
    heightFit: [170, 185],
    moveTags: ['动态跳跃', '挂脚跟'],
    steps: [
      { phase: '起手', text: '左手大圆点、右手侧拉点同时起，双脚上高脚踩稳再出手。' },
      { phase: '中段', text: '核心收紧直接 dyno 到顶部横条，注意用胯部先顶出去，手是最后到的。' },
      { phase: '收尾', text: '接住横条后右脚挂脚跟锁住，换手到顶点即可。' }
    ]
  },
  {
    id: 'b2', routeId: 'r105', userId: 'u2', type: 'text', likes: 96, createdAt: d(-5),
    title: '160cm 小个子友好版',
    heightFit: [150, 168],
    moveTags: ['高脚', '挂脚跟'],
    steps: [
      { phase: '起手', text: '够不到侧拉点没关系：先左手起手点，右脚直接上到中间的黄色脚点。' },
      { phase: '中段', text: '不 dyno！右手先摸中间棕色小点做过渡，胯贴墙，左脚挂脚跟再出右手。' },
      { phase: '收尾', text: '两步静态到顶，比跳的稳多了，亲测省力。' }
    ]
  },
  {
    id: 'b3', routeId: 'r103', userId: 'u4', type: 'text', likes: 40, createdAt: d(-9),
    imageFileIDs: ['/assets/demo/climb2.jpg'],
    title: '新手视角拆解',
    heightFit: [160, 175],
    moveTags: ['锁定', '小点发力'],
    steps: [
      { phase: '起手', text: '坐地起手，先把右脚踩上去再发力，直接站起来会滑。' },
      { phase: '中段', text: '中间两个小点要"捏"不要"抓"，重心压低慢慢倒。' },
      { phase: '收尾', text: '最后一步左手锁定到90度再出右手，不要甩。' }
    ]
  },
  {
    id: 'b4', routeId: 'r104', userId: 'u3', type: 'video', videoFileID: DEMO_VIDEO, videoDur: '0:12', likes: 75, createdAt: d(-12),
    title: '高个子静态解法',
    heightFit: [178, 190],
    moveTags: ['锁定', '高脚'],
    steps: [
      { phase: '起手', text: '利用臂展优势直接越过第一个过渡点，右手到黑色棱角点。' },
      { phase: '中段', text: '左脚高脚到起手点位置，身体折叠后慢慢站起。' },
      { phase: '收尾', text: '顶点是个暗兜，摸到内侧再发力，直接拍会脱。' }
    ]
  },
  {
    id: 'b5', routeId: 'r106', userId: 'u6', type: 'video', videoFileID: DEMO_VIDEO, videoDur: '0:12', likes: 210, createdAt: d(-20),
    imageFileIDs: ['/assets/demo/climb1.jpg'],
    caution: '出口斜板很滑，最后一步重心别急着往上送',
    title: '定线员亲拆',
    heightFit: [165, 185],
    moveTags: ['顶胯', '挂脚跟', '大圆点'],
    steps: [
      { phase: '起手', text: '设计思路是"先坐后站"：起手先做一个假坐姿，把右脚跟挂上去。' },
      { phase: '中段', text: '关键在第三手：大圆点要用推的，顶胯把重心送过中线。' },
      { phase: '收尾', text: '最后翻身上墙时先换脚，很多人败在没换脚直接翻。' }
    ]
  },
  {
    id: 'b6', routeId: 'r107', userId: 'u5', type: 'text', likes: 33, createdAt: d(-2),
    title: '屋檐省力路书',
    heightFit: [162, 180],
    moveTags: ['勾脚尖', '核心张力'],
    steps: [
      { phase: '起手', text: '屋檐线先想脚再想手：起手同时右脚尖勾住第二脚点。' },
      { phase: '中段', text: '身体像吊床一样绷直，手换点时脚不动，脚换点时手不动。' },
      { phase: '收尾', text: '出屋檐唇口时先甩左脚上去挂跟，再翻身，不要硬拉。' }
    ]
  },
  {
    id: 'b7', routeId: 'r108', userId: 'u3', type: 'video', videoFileID: DEMO_VIDEO, videoDur: '0:12', likes: 66, createdAt: d(-1),
    title: '首完攀记录',
    heightFit: [175, 190],
    moveTags: ['动态跳跃', '双手起跳'],
    steps: [
      { phase: '起手', text: '双手起跳前先空摆两次找节奏，第三次再真跳。' },
      { phase: '中段', text: '接住后立刻勾右脚尖稳住摆动，等完全静止再出下一手。' },
      { phase: '收尾', text: '顶部两点都不正，用捏的姿势更牢。' }
    ]
  },
  {
    id: 'b8', routeId: 'r201', userId: 'u7', type: 'text', likes: 12, createdAt: d(-8),
    title: '零基础也能顺下来',
    heightFit: [150, 175],
    moveTags: ['平衡', '手点顺序'],
    steps: [
      { phase: '起手', text: '按点上的编号来就行，1-2-3 不要跳。' },
      { phase: '中段', text: '第4个点记得先换脚再伸手，不换脚会很别扭。' },
      { phase: '收尾', text: '顶点很大很友好，放心冲。' }
    ]
  },
  {
    id: 'b9', routeId: 'r203', userId: 'u5', type: 'video', videoFileID: DEMO_VIDEO, videoDur: '0:12', likes: 58, createdAt: d(-14),
    imageFileIDs: ['/assets/demo/climb6.jpg'],
    caution: '中段捏点最费指力，前面省着点用',
    title: '交叉手不打结指南',
    heightFit: [163, 180],
    moveTags: ['交叉手', '侧拉'],
    steps: [
      { phase: '起手', text: '起手就决定了后面顺不顺：左手在上右手在下，别反。' },
      { phase: '中段', text: '第二次交叉时先转肩再出手，让身体自然螺旋上去。' },
      { phase: '收尾', text: '解开缠绕的瞬间左脚外侧踩，一步到顶。' }
    ]
  },
  {
    id: 'b10', routeId: 'r204', userId: 'u1', type: 'video', videoFileID: DEMO_VIDEO, videoDur: '0:12', likes: 150, createdAt: d(-11),
    imageFileIDs: ['/assets/demo/climb5.jpg'],
    caution: '动态那一下必须脚先蹬出去，光靠手够不到',
    title: '全程动态爽版',
    heightFit: [172, 188],
    moveTags: ['动态跳跃', '双手起跳'],
    steps: [
      { phase: '起手', text: '第一跳落点比看起来近，七分力就够，全力会飞过。' },
      { phase: '中段', text: '连续两跳之间必须停稳呼吸一次，贪快必掉。' },
      { phase: '收尾', text: '最后一跳向左上 45°，用右手先拍稳再补左手。' }
    ]
  },
  {
    id: 'b11', routeId: 'r204', userId: 'u2', type: 'text', likes: 88, createdAt: d(-9),
    title: '矮个子静态破解',
    heightFit: [152, 168],
    moveTags: ['高脚', '折膝', '侧拉'],
    steps: [
      { phase: '起手', text: '别信"必须跳"的邪，右侧有个白色配角点可以借用（同色规则内）。' },
      { phase: '中段', text: '高脚+折膝把身体叠起来，慢慢站，第二段同理。' },
      { phase: '收尾', text: '最后确实要一小跳，但只剩 20cm，闭眼都能中。' }
    ]
  },
  {
    id: 'b12', routeId: 'r302', userId: 'u8', type: 'text', likes: 20, createdAt: d(-10),
    title: '为什么你总在第三个点掉',
    heightFit: [158, 182],
    moveTags: ['手点顺序', '平衡'],
    steps: [
      { phase: '起手', text: '前两点正常走，节奏放慢。' },
      { phase: '中段', text: '第三点是"假点"，只用来过渡，真正要抓的是它上方的斜面。' },
      { phase: '收尾', text: '最后两步重心全在脚上，手只是扶。' }
    ]
  },
  {
    id: 'b13', routeId: 'r304', userId: 'u3', type: 'video', videoFileID: DEMO_VIDEO, videoDur: '0:12', likes: 47, createdAt: d(-16),
    title: '洞穴脚法示范',
    heightFit: [170, 188],
    moveTags: ['勾脚尖', '核心张力'],
    steps: [
      { phase: '起手', text: '进洞先挂双脚再出手，顺序反了就只能靠臂力硬顶。' },
      { phase: '中段', text: '换手时脚尖发力下压，身体就不会荡。' },
      { phase: '收尾', text: '出洞口那步深呼吸，左手锁定，右脚跟上唇口。' }
    ]
  },
  {
    id: 'b14', routeId: 'r305', userId: 'u6', type: 'video', videoFileID: DEMO_VIDEO, videoDur: '0:12', likes: 180, createdAt: d(-18),
    imageFileIDs: ['/assets/demo/climb4.jpg'],
    title: '七个点的完整讲解',
    heightFit: [168, 185],
    moveTags: ['小点发力', '动态跳跃', '锁定'],
    steps: [
      { phase: '起手', text: '前三"星"是小点静态，指力省着用，开握为主。' },
      { phase: '中段', text: '第四到第五星是全线路难点：左手锁定到底，右手小 dyno。' },
      { phase: '收尾', text: '最后两星放松走完，顶前别庆祝，掉过的人不止一个。' }
    ]
  },
  {
    id: 'b15', routeId: 'r206', userId: 'u7', type: 'text', likes: 31, createdAt: d(-4),
    title: '用重心画S线',
    heightFit: [155, 172],
    moveTags: ['重心转换', '大圆点'],
    steps: [
      { phase: '起手', text: '波浪墙的逻辑：手固定，重心左右荡，荡到位再换手。' },
      { phase: '中段', text: '每个大圆点都推着走，抓死反而累。' },
      { phase: '收尾', text: '最后一荡幅度最大，先目测好右脚落点。' }
    ]
  }
];

const COMMENTS = {
  b1: [
    { id: 'c1', userId: 'u4', text: '照这个 beta 今天出坑了！dyno 那步顶胯真的关键', date: d(-4) },
    { id: 'c2', userId: 'u8', text: '中段那下漂亮，就是我这老腰跳不动了 😂', date: d(-3) }
  ],
  b2: [
    { id: 'c3', userId: 'u7', text: '感谢小个子救星！棕色过渡点我之前完全没看到', date: d(-3) },
    { id: 'c4', userId: 'u1', text: '看完发现静态版确实更稳，收回我"必须跳"的话 🙏', date: d(-2) }
  ],
  b5: [
    { id: 'c5', userId: 'u2', text: '定线员亲拆太宝贵了，求多来点这个系列！', date: d(-19) },
    { id: 'c6', userId: 'u5', text: '换脚那个细节说到点子上了', date: d(-17) }
  ],
  b11: [
    { id: 'c7', userId: 'u7', text: '试了三周的线看完当天出，泪目', date: d(-6) }
  ],
  b14: [
    { id: 'c8', userId: 'u1', text: '第五星那个小 dyno 距离拿捏得太准了', date: d(-15) }
  ]
};

// 其他岩友的打卡（用于线路页动态与岩馆周榜）
const CHECKINS = [
  { id: 'k1',  userId: 'u1', routeId: 'r105', result: 'flash', attempts: 1, date: d(-7) },
  { id: 'k2',  userId: 'u2', routeId: 'r105', result: 'top',   attempts: 6, date: d(-5) },
  { id: 'k3',  userId: 'u4', routeId: 'r105', result: 'top',   attempts: 9, date: d(-4) },
  { id: 'k4',  userId: 'u4', routeId: 'r103', result: 'top',   attempts: 4, date: d(-9) },
  { id: 'k5',  userId: 'u3', routeId: 'r104', result: 'top',   attempts: 3, date: d(-12) },
  { id: 'k6',  userId: 'u6', routeId: 'r106', result: 'flash', attempts: 1, date: d(-20) },
  { id: 'k7',  userId: 'u3', routeId: 'r108', result: 'top',   attempts: 11, date: d(-1) },
  { id: 'k8',  userId: 'u5', routeId: 'r107', result: 'top',   attempts: 2, date: d(-2) },
  { id: 'k9',  userId: 'u1', routeId: 'r204', result: 'top',   attempts: 5, date: d(-11) },
  { id: 'k10', userId: 'u2', routeId: 'r204', result: 'top',   attempts: 8, date: d(-9) },
  { id: 'k11', userId: 'u7', routeId: 'r201', result: 'flash', attempts: 1, date: d(-8) },
  { id: 'k12', userId: 'u5', routeId: 'r203', result: 'flash', attempts: 1, date: d(-14) },
  { id: 'k13', userId: 'u3', routeId: 'r304', result: 'top',   attempts: 4, date: d(-16) },
  { id: 'k14', userId: 'u6', routeId: 'r305', result: 'top',   attempts: 7, date: d(-18) },
  { id: 'k15', userId: 'u8', routeId: 'r302', result: 'flash', attempts: 1, date: d(-10) },
  { id: 'k16', userId: 'u7', routeId: 'r206', result: 'top',   attempts: 3, date: d(-4) },
  { id: 'k17', userId: 'u2', routeId: 'r103', result: 'attempt', attempts: 5, date: d(-2) },
  { id: 'k18', userId: 'u4', routeId: 'r102', result: 'flash', attempts: 1, date: d(-6) },
  { id: 'k19', userId: 'u1', routeId: 'r106', result: 'attempt', attempts: 7, date: d(-3) },
  { id: 'k20', userId: 'u8', routeId: 'r303', result: 'top',   attempts: 2, date: d(-7) }
];

module.exports = { USERS, GYMS, ROUTES, BETAS, COMMENTS, CHECKINS };
