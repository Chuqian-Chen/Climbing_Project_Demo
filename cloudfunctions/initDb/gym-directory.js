// 岩馆名录：来自用户提供的索引图/名单
// 上海：初版为小红书 Melania「上海攀岩馆索引图」Version 2（77家）；
//       2026-07-29 按「女子岩上」名单（统计 2026-7-9，56 营业 + 6 即将开业）逐条更新，
//       新名单未收录的旧条目保留并标 unlisted（多为远郊馆，待核实）
// 北京：小红书攀岩馆分布图（综合馆=难度+抱石 / 抱石馆 / 难度馆）
// 注意：名称/地标为图片转录，个别可能有识别误差；坐标为地铁站/商圈近似值（±1km），
// 仅用于距离排序，不作导航用途；district 为大致行政区归属。欢迎在本文件直接修正。
// gradeBy 定级方式：'hold'=岩点颜色即难度（默认）| 'tape'=看岩点下方胶带标签颜色 | 'sign'=旁边难度牌直接写V几

const CITIES = [
  { key: 'bj', name: '北京', lat: 39.9042, lng: 116.4074 },
  { key: 'sh', name: '上海', lat: 31.2304, lng: 121.4737 }
];

// 区域展示顺序（发布页三级选择用）
const DISTRICT_ORDER = {
  bj: ['朝阳', '海淀', '东城', '西城', '丰台', '石景山', '昌平', '顺义', '大兴', '通州', '房山'],
  sh: ['静安', '黄浦', '徐汇', '长宁', '普陀', '虹口', '杨浦', '宝山', '浦东', '闵行', '嘉定', '青浦', '松江', '奉贤', '金山', '崇明']
};

// type: 综合 | 抱石 | 难度 | ''（未标注）
const DIRECTORY = [
  /* ================= 上海（77 + 6 即将开业） =================
   * 2026-07-29 依据用户提供的「女子岩上」上海岩馆名单（统计时间 2026-7-9）更新：
   * 56 家营业馆逐一匹配原条目（id 不变），更新馆名/区域/地铁距离，补 type 与 price（门票单次价格）；
   * unlisted: true = 该名单未收录（多为远郊馆，不确定是否停业，待 POI 核实）；
   * comingSoon: true = 名单标注即将开业。near 为最近地铁站距离（源自名单）。 */
  { id: 'sh01', city: 'sh', district: '静安', name: '香蕉攀岩（嘉里合集店）', near: '上海火车站 360m', type: '抱石', price: '99-120', lat: 31.2495, lng: 121.456 },
  { id: 'sh02', city: 'sh', district: '静安', name: 'Beta', near: '江宁路 480m', type: '抱石', price: '109-119', lat: 31.241, lng: 121.447 },
  { id: 'sh03', city: 'sh', district: '普陀', name: '尽峰（189弄购物中心）', near: '长寿路 270m', type: '综合', price: '110', lat: 31.2415, lng: 121.437 },
  { id: 'sh04', city: 'sh', district: '普陀', name: 'Rock Climbing', near: '中潭路 350m', type: '抱石', price: '91-111', lat: 31.253, lng: 121.442 },
  { id: 'sh05', city: 'sh', district: '静安', name: '攀竞（静安馆）', near: '自然博物馆 1.1km', type: '综合', price: '139-159', lat: 31.235, lng: 121.462 },
  { id: 'sh06', city: 'sh', district: '黄浦', name: '天宇（新世界城）', near: '人民广场 0.2km', type: '', lat: 31.234, lng: 121.472, unlisted: true },
  { id: 'sh07', city: 'sh', district: '黄浦', name: '魔岩（黄浦市民健身中心）', near: '南京东路 0.1km', type: '', lat: 31.239, lng: 121.48, unlisted: true },
  { id: 'sh08', city: 'sh', district: '虹口', name: 'Benchmark（滨港店）', near: '四川北路 359m', type: '抱石', price: '80-150', lat: 31.253, lng: 121.482 },
  { id: 'sh09', city: 'sh', district: '虹口', name: 'AOB', near: '国际客运中心 100m', type: '抱石', price: '120-140', lat: 31.248, lng: 121.493 },
  { id: 'sh10', city: 'sh', district: '虹口', name: 'Vmore（北外滩店）', near: '提篮桥 180m', type: '综合', price: '146', lat: 31.259, lng: 121.508 },
  { id: 'sh11', city: 'sh', district: '虹口', name: '此山攀岩（北外滩来福士店）', near: '提篮桥 34m', type: '综合', price: '148', lat: 31.26, lng: 121.506 },
  { id: 'sh12', city: 'sh', district: '虹口', name: '我攀上海（月亮湾店）', near: '临平路 730m', type: '抱石', price: '120-150', lat: 31.264, lng: 121.503 },
  { id: 'sh13', city: 'sh', district: '虹口', name: '小树攀岩', near: '虹口足球场 30m', type: '综合', price: '129', lat: 31.272, lng: 121.476 },
  { id: 'sh14', city: 'sh', district: '虹口', name: 'No Moss Climbing', near: '虹口足球场 139m', type: '抱石', price: '120-150', lat: 31.274, lng: 121.479 },
  // 原转录"嘻岩"，2026-7-9 名单为"啸岩"（同址虹口足球场）
  { id: 'sh15', city: 'sh', district: '虹口', name: '啸岩', near: '虹口足球场 700m', type: '抱石', price: '119', lat: 31.276, lng: 121.472 },
  { id: 'sh16', city: 'sh', district: '静安', name: 'High Five（静安）', near: '汶水路 0.5km', type: '', lat: 31.291, lng: 121.446, unlisted: true },
  { id: 'sh17', city: 'sh', district: '宝山', name: '向上攀岩', near: '殷高西路站 1.3km', type: '综合', price: '120-150', lat: 31.317, lng: 121.462 },
  { id: 'sh18', city: 'sh', district: '宝山', name: '攀岩工厂', near: '长江南路 2.5km', type: '综合', price: '60-149', lat: 31.322, lng: 121.465 },
  // TA山定级机制（用户提供）：贴标的岩点 = 起步手点/脚点；标签颜色 = 难度（非岩点颜色）
  // 橙标V0 / 粉标V1 / 绿标V2 / 黄标V3，更高难度标签色待补充
  // near 曾误录为"三角地"，用户纠正为五角场，坐标已同步修正
  { id: 'sh19', city: 'sh', district: '杨浦', name: 'TA山', near: '江湾体育场 190m（五角场）', type: '抱石', price: '120-150', lat: 31.3030, lng: 121.5130, gradeBy: 'tape', gradeNote: '贴标岩点 = 起步点 · 标签颜色 = 难度', gradeSystem: [{ color: 'orange', grade: 'V0' }, { color: 'pink', grade: 'V1' }, { color: 'green', grade: 'V2' }, { color: 'yellow', grade: 'V3' }] },
  { id: 'sh20', city: 'sh', district: '杨浦', name: '叶岩', near: '黄兴公园站 1.1km', type: '综合', price: '60-130', lat: 31.291, lng: 121.535 },
  // 原"Vmore（北洋泾路）"，名单为崮山路店（北洋泾路 940m，同址）
  { id: 'sh21', city: 'sh', district: '浦东', name: 'Vmore（崮山路店）', near: '北洋泾路 940m', type: '综合', price: '169', lat: 31.244, lng: 121.533 },
  { id: 'sh22', city: 'sh', district: '浦东', name: '极壁风暴', near: '蓝村路 800m', type: '抱石', price: '118-138', lat: 31.207, lng: 121.522 },
  { id: 'sh23', city: 'sh', district: '浦东', name: 'DYNO Park（盈丰天地）', near: '花木路 0.6km', type: '', lat: 31.21, lng: 121.556, unlisted: true },
  { id: 'sh24', city: 'sh', district: '黄浦', name: 'Hey Bouldering嘿抱（绿地外滩中心店）', near: '小南门 890m', type: '抱石', price: '130-180', lat: 31.213, lng: 121.498 },
  { id: 'sh25', city: 'sh', district: '黄浦', name: '1778（黄浦）', near: '南浦大桥 30m', type: '抱石', price: '68-146', lat: 31.2, lng: 121.493 },
  { id: 'sh26', city: 'sh', district: '黄浦', name: 'Camp4 岩肆（8号桥店）', near: '世博会博物馆 612m', type: '抱石', price: '85-130', lat: 31.193, lng: 121.485 },
  { id: 'sh27', city: 'sh', district: '黄浦', name: '岩时攀岩（新天地东台里店）', near: '老西门站 550m', type: '抱石', price: '125-150', lat: 31.22, lng: 121.474 },
  { id: 'sh28', city: 'sh', district: '徐汇', name: 'Star星岩', near: '龙华中路 624m', type: '抱石', price: '102-122', lat: 31.181, lng: 121.452 },
  // 原转录"长桥"，名单为龙华站 170m，坐标已按龙华站修正
  { id: 'sh29', city: 'sh', district: '徐汇', name: 'Stonehaven Climbing', near: '龙华站 170m', type: '抱石', price: '88-138', lat: 31.171, lng: 121.452 },
  { id: 'sh30', city: 'sh', district: '徐汇', name: '尽峰（乐动力西岸）', near: '龙耀路 430m', type: '抱石', price: '128', lat: 31.169, lng: 121.462 },
  { id: 'sh31', city: 'sh', district: '徐汇', name: '岩时攀岩（Gate M西岸梦中心）', near: '龙耀路 640m', type: '难度', price: '125-150', lat: 31.176, lng: 121.457 },
  { id: 'sh32', city: 'sh', district: '浦东', name: '攀竞（东体馆）', near: '东方体育中心 360m', type: '综合', price: '131', lat: 31.156, lng: 121.47 },
  { id: 'sh33', city: 'sh', district: '浦东', name: 'Le Mont（浦东）', near: '灵岩南路 0.9km', type: '', lat: 31.174, lng: 121.554, unlisted: true },
  { id: 'sh34', city: 'sh', district: '浦东', name: '岩羊攀吧', near: '杨思站 280m', type: '抱石', price: '点饮品即可', lat: 31.157, lng: 121.5 },
  { id: 'sh35', city: 'sh', district: '浦东', name: '1778（三林）', near: '芦恒路 630m', type: '综合', price: '120-146', lat: 31.146, lng: 121.503 },
  { id: 'sh36', city: 'sh', district: '闵行', name: '红琴（浦江）', near: '江月路 0.5km', type: '', lat: 31.109, lng: 121.505, unlisted: true },
  { id: 'sh37', city: 'sh', district: '闵行', name: '登拓攀岩', near: '景西路 2.7km', type: '综合', price: '75-98', lat: 31.105, lng: 121.395 },
  { id: 'sh38', city: 'sh', district: '闵行', name: '尽峰（闵行）', near: '莲花路 2.1km', type: '综合', price: '128', lat: 31.12, lng: 121.39 },
  { id: 'sh39', city: 'sh', district: '闵行', name: '克莱攀岩公园', near: '莲花路 800m', type: '综合', price: '73-146', lat: 31.128, lng: 121.398 },
  { id: 'sh40', city: 'sh', district: '徐汇', name: 'Dome（徐汇万科店）', near: '上海南站 160m', type: '综合', price: '120-133', lat: 31.155, lng: 121.425 },
  { id: 'sh41', city: 'sh', district: '徐汇', name: '无界攀岩（漕河泾）原爬客攀岩', near: '漕宝路 260m', type: '难度', price: '150', lat: 31.17, lng: 121.43 },
  { id: 'sh42', city: 'sh', district: '徐汇', name: 'Roc811攀岩馆', near: '桂林公园 675m', type: '抱石', price: '118', lat: 31.173, lng: 121.418 },
  { id: 'sh43', city: 'sh', district: '长宁', name: '晨道（黄金城道）', near: '娄山关路/伊犁路 0.6km', type: '', lat: 31.21, lng: 121.405, unlisted: true },
  // 原转录"香蕉（古北）· 美兰路待确认"，名单为金虹桥店（娄山关路站 430m），坐标已修正
  { id: 'sh44', city: 'sh', district: '长宁', name: '香蕉攀岩（金虹桥店）', near: '娄山关路站 430m', type: '抱石', price: '99-120', lat: 31.211, lng: 121.402 },
  { id: 'sh45', city: 'sh', district: '长宁', name: 'LAPUTA（长宁来福士）', near: '中山公园 0.2km', type: '', lat: 31.22, lng: 121.413, unlisted: true },
  { id: 'sh46', city: 'sh', district: '长宁', name: '香蕉攀岩（延安西路店）', near: '延安西路 280m', type: '抱石', price: '99-120', lat: 31.213, lng: 121.425 },
  { id: 'sh47', city: 'sh', district: '长宁', name: 'Dome（定西路店）', near: '延安西路 934m', type: '抱石', price: '92-100', lat: 31.216, lng: 121.42 },
  // 名单区域为长宁（交大站属徐汇/长宁交界，从名单）
  { id: 'sh48', city: 'sh', district: '长宁', name: 'BLOC', near: '交通大学站 910m', type: '抱石', price: '130', lat: 31.203, lng: 121.433 },
  { id: 'sh49', city: 'sh', district: '徐汇', name: 'Goat（徐家汇TPY中心）', near: '徐家汇 20m', type: '综合', price: '180', lat: 31.195, lng: 121.437 },
  { id: 'sh50', city: 'sh', district: '长宁', name: '无界攀岩（曹家渡）原爬客攀岩', near: '隆德路 790m', type: '综合', price: '69-155', lat: 31.226, lng: 121.423 },
  // 原转录"粉狮"，名单为 Pink Bouldering粉抱（金沙江路 180m，同址）
  { id: 'sh51', city: 'sh', district: '普陀', name: 'Pink Bouldering粉抱', near: '金沙江路 180m', type: '抱石', price: '119-146', lat: 31.232, lng: 121.402 },
  { id: 'sh52', city: 'sh', district: '普陀', name: 'Benchmark（环球港店）', near: '金沙江路 250m', type: '抱石', price: '122', lat: 31.234, lng: 121.399 },
  { id: 'sh53', city: 'sh', district: '普陀', name: '大岩悦动攀岩场', near: '长风公园 240m', type: '综合', price: '65-127', lat: 31.224, lng: 121.395 },
  // 原转录"Benchmark（普陀）· 光新路待确认"，名单为荟聚店（长宁 淞虹路站 80m），区域与坐标已修正
  { id: 'sh54', city: 'sh', district: '长宁', name: 'Benchmark（荟聚店）', near: '淞虹路站 80m', type: '综合', price: '130-150', lat: 31.221, lng: 121.351 },
  { id: 'sh55', city: 'sh', district: '闵行', name: '此山攀岩（龙湖虹桥天街店）', near: '虹桥火车站 571m', type: '综合', price: '179', lat: 31.196, lng: 121.316 },
  // 名单区域为闵行（国展周边），从名单
  { id: 'sh56', city: 'sh', district: '闵行', name: '岩界攀岩运动中心', near: '国家会展中心 1.7km', type: '综合', price: '69.9-130', lat: 31.198, lng: 121.305 },
  { id: 'sh57', city: 'sh', district: '青浦', name: '岩顶（丰尚）', near: '国家会展中心附近', type: '', lat: 31.193, lng: 121.302, unlisted: true },
  { id: 'sh58', city: 'sh', district: '闵行', name: 'Dome（前湾印象城店）', near: '国家会展中心 3km', type: '综合', price: '128-158', lat: 31.183, lng: 121.28 },
  { id: 'sh59', city: 'sh', district: '嘉定', name: '攀王（南翔）', near: '陈翔公路 1.7km', type: '', lat: 31.309, lng: 121.326, unlisted: true },
  { id: 'sh60', city: 'sh', district: '嘉定', name: '5+（南翔）', near: '南翔 0.7km', type: '', lat: 31.294, lng: 121.32, unlisted: true },
  { id: 'sh61', city: 'sh', district: '普陀', name: 'Goat（普陀桃浦湾店）', near: '祁连山路 170m', type: '综合', price: '180', lat: 31.253, lng: 121.352 },
  { id: 'sh62', city: 'sh', district: '闵行', name: 'Hey Bouldering嘿抱（万象城店）', near: '紫藤路 330m', type: '抱石', price: '88-158', lat: 31.185, lng: 121.382 },
  // 原转录"康桥待确认"，名单为康恒路 130m
  { id: 'sh63', city: 'sh', district: '浦东', name: 'Sizer抱石攀岩馆', near: '康恒路 130m', type: '抱石', price: '99', lat: 31.145, lng: 121.555 },
  // 原转录"普陀 悦天地 华林路待确认"，名单为浦东 陆悦天地店（学林路站 260m）；坐标为估算，待 POI 核实
  { id: 'sh64', city: 'sh', district: '浦东', name: '岩时攀岩（陆悦天地店）', near: '学林路站 260m', type: '抱石', price: '125-150', lat: 31.14, lng: 121.56 },
  { id: 'sh65', city: 'sh', district: '浦东', name: '优加（唐镇）', near: '唐镇 0.6km', type: '', lat: 31.216, lng: 121.652, unlisted: true },
  { id: 'sh66', city: 'sh', district: '浦东', name: '优石', near: '浦东足球场 630m', type: '综合', price: '118-144', lat: 31.221, lng: 121.544 },
  { id: 'sh67', city: 'sh', district: '浦东', name: '优加（航头）', near: '航头 0.1km', type: '', lat: 31.06, lng: 121.61, unlisted: true },
  { id: 'sh68', city: 'sh', district: '奉贤', name: '攀岩小将（步步高）', near: '环城东路 0.1km', type: '', lat: 30.925, lng: 121.48, unlisted: true },
  { id: 'sh69', city: 'sh', district: '奉贤', name: '奉贤体育中心攀岩馆（攀竞）', near: '奉贤新城站 3.1km', type: '综合', price: '88', lat: 30.918, lng: 121.474 },
  { id: 'sh70', city: 'sh', district: '奉贤', name: '琪琪户外', near: '奉浦大道 26.1km', type: '', lat: 30.89, lng: 121.45, unlisted: true },
  { id: 'sh71', city: 'sh', district: '金山', name: '金山中外体育中心', near: '环城东路 26.7km', type: '', lat: 30.742, lng: 121.341, unlisted: true },
  { id: 'sh72', city: 'sh', district: '松江', name: '5+（松江云间）', near: '醉白池 2.0km', type: '', lat: 31.004, lng: 121.221, unlisted: true },
  { id: 'sh73', city: 'sh', district: '松江', name: '山艺（松江新城）', near: '松江新城 0.1km', type: '', lat: 31.03, lng: 121.226, unlisted: true },
  { id: 'sh74', city: 'sh', district: '青浦', name: 'J.Climbing（青浦万达茂）', near: '淀山湖大道 0.2km', type: '', lat: 31.148, lng: 121.109, unlisted: true },
  { id: 'sh75', city: 'sh', district: '嘉定', name: '嘻岩（嘉亭荟）', near: '安亭 0.3km', type: '', lat: 31.297, lng: 121.166, unlisted: true },
  // 原"汇源路待确认/疑似未开业"，名单确认已营业（白银路 1.8km），坐标已按白银路修正
  { id: 'sh76', city: 'sh', district: '嘉定', name: '尽峰（嘉定）', near: '白银路 1.8km', type: '综合', price: '121', lat: 31.366, lng: 121.255 },
  { id: 'sh77', city: 'sh', district: '崇明', name: '岩心 Ganshin（崇明）', near: '崇明 39.0km', type: '', lat: 31.53, lng: 121.63, unlisted: true },

  /* ---- 即将开业（2026-7-9 名单 Coming Soon）---- */
  { id: 'sh78', city: 'sh', district: '', name: 'Pongo（换新址）', near: '新址待公布', type: '', comingSoon: true },
  { id: 'sh79', city: 'sh', district: '徐汇', name: '此山攀岩（FFC滨江悦里）', near: '大木桥路', type: '', comingSoon: true, lat: 31.198, lng: 121.462 },
  { id: 'sh80', city: 'sh', district: '黄浦', name: '香蕉攀岩（龙凤PRSCO店）', near: '淮海中路', type: '', comingSoon: true, lat: 31.221, lng: 121.47 },
  { id: 'sh81', city: 'sh', district: '浦东', name: '香蕉攀岩（正大广场店）', near: '陆家嘴西路', type: '难度', comingSoon: true, lat: 31.239, lng: 121.494 },
  { id: 'sh82', city: 'sh', district: '浦东', name: '岩时攀岩（PRISMA新嘉中心店）', near: '浦东巨峰路', type: '', comingSoon: true, lat: 31.265, lng: 121.607 },
  { id: 'sh83', city: 'sh', district: '闵行', name: '岩时攀岩（维璟印象城）', near: '七莘路', type: '', comingSoon: true, lat: 31.156, lng: 121.35 },

  /* ================= 北京（53） ================= */
  { id: 'bj01', city: 'bj', district: '顺义', name: '浩石（顺义）', near: '顺义', type: '综合', lat: 40.13, lng: 116.65 },
  { id: 'bj02', city: 'bj', district: '昌平', name: '趣野（腾讯众创空间）', near: '昌平', type: '综合', lat: 40.07, lng: 116.32 },
  { id: 'bj03', city: 'bj', district: '昌平', name: '岩时（回龙观）', near: '回龙观', type: '综合', lat: 40.073, lng: 116.34 },
  { id: 'bj04', city: 'bj', district: '海淀', name: '岩时（西三旗）', near: '西三旗', type: '综合', lat: 40.05, lng: 116.36 },
  { id: 'bj05', city: 'bj', district: '海淀', name: '香蕉（上地）', near: '上地', type: '抱石', lat: 40.036, lng: 116.31 },
  { id: 'bj06', city: 'bj', district: '海淀', name: '奥攀（上地）', near: '上地', type: '综合', lat: 40.033, lng: 116.315 },
  { id: 'bj07', city: 'bj', district: '海淀', name: '青山攀石', near: '西二旗附近', type: '综合', lat: 40.045, lng: 116.305 },
  { id: 'bj08', city: 'bj', district: '海淀', name: '香蕉（768）', near: '768创意产业园', type: '综合', lat: 40.04, lng: 116.355 },
  { id: 'bj09', city: 'bj', district: '朝阳', name: '北顶奥森', near: '奥林匹克森林公园', type: '综合', lat: 40.017, lng: 116.396 },
  { id: 'bj10', city: 'bj', district: '朝阳', name: '几何', near: '奥体附近', type: '综合', lat: 40.005, lng: 116.39 },
  { id: 'bj11', city: 'bj', district: '海淀', name: '华攀攀岩（地质大学）', near: '地质大学', type: '综合', lat: 39.99, lng: 116.35 },
  { id: 'bj12', city: 'bj', district: '海淀', name: 'COB', near: '学院路附近', type: '综合', lat: 39.983, lng: 116.36 },
  { id: 'bj13', city: 'bj', district: '海淀', name: '青山攀石 2.0', near: '海淀', type: '抱石', lat: 39.96, lng: 116.3 },
  { id: 'bj14', city: 'bj', district: '海淀', name: '奥攀（四季青）', near: '四季青', type: '综合', lat: 39.94, lng: 116.26 },
  { id: 'bj15', city: 'bj', district: '海淀', name: '问山', near: '海淀', type: '综合', lat: 39.93, lng: 116.29 },
  { id: 'bj16', city: 'bj', district: '海淀', name: '奥攀（五棵松）', near: '五棵松', type: '综合', lat: 39.907, lng: 116.274 },
  { id: 'bj17', city: 'bj', district: '石景山', name: 'COG（首钢）', near: '首钢园', type: '综合', lat: 39.91, lng: 116.15 },
  { id: 'bj18', city: 'bj', district: '朝阳', name: '悦石（华贸天地西区）', near: '华贸', type: '综合', lat: 39.91, lng: 116.48 },
  { id: 'bj19', city: 'bj', district: '朝阳', name: '趣野（龙湖）', near: '朝阳北部', type: '综合', lat: 39.999, lng: 116.48 },
  { id: 'bj20', city: 'bj', district: '朝阳', name: 'COL（来广营）', near: '来广营', type: '综合', lat: 40.03, lng: 116.47 },
  { id: 'bj21', city: 'bj', district: '朝阳', name: '青藤攀岩', near: '望京附近', type: '综合', lat: 39.99, lng: 116.47 },
  { id: 'bj22', city: 'bj', district: '朝阳', name: 'Camp4（将台）', near: '将台', type: '抱石', lat: 39.97, lng: 116.49 },
  { id: 'bj23', city: 'bj', district: '朝阳', name: 'Mellow', near: '将台/酒仙桥', type: '抱石', lat: 39.968, lng: 116.495 },
  { id: 'bj24', city: 'bj', district: '朝阳', name: 'Bloc1 一块攀岩', near: '酒仙桥附近', type: '抱石', lat: 39.962, lng: 116.485 },
  { id: 'bj25', city: 'bj', district: '朝阳', name: 'Edge 一直攀岩', near: '朝阳公园北', type: '抱石', lat: 39.955, lng: 116.48 },
  { id: 'bj26', city: 'bj', district: '朝阳', name: '浩石（久隆）', near: '朝阳', type: '综合', lat: 39.95, lng: 116.5 },
  { id: 'bj27', city: 'bj', district: '朝阳', name: '先锋', near: '朝阳', type: '综合', lat: 39.945, lng: 116.51 },
  { id: 'bj28', city: 'bj', district: '东城', name: '星岩攀石', near: '东二环附近', type: '抱石', lat: 39.94, lng: 116.44 },
  { id: 'bj29', city: 'bj', district: '朝阳', name: 'Camp4（三里屯）', near: '三里屯', type: '综合', lat: 39.937, lng: 116.455 },
  { id: 'bj30', city: 'bj', district: '东城', name: '飞猫（朝阳门）', near: '朝阳门', type: '综合', lat: 39.924, lng: 116.435 },
  { id: 'bj31', city: 'bj', district: '朝阳', name: '日坛攀岩', near: '日坛', type: '抱石', lat: 39.916, lng: 116.446 },
  { id: 'bj32', city: 'bj', district: '朝阳', name: '金点石（日坛）', near: '日坛', type: '综合', lat: 39.915, lng: 116.448 },
  { id: 'bj33', city: 'bj', district: '东城', name: '一起攀岩', near: '东城', type: '综合', lat: 39.91, lng: 116.43 },
  { id: 'bj34', city: 'bj', district: '朝阳', name: '中攀', near: '朝阳', type: '综合', lat: 39.93, lng: 116.52 },
  { id: 'bj35', city: 'bj', district: '朝阳', name: '岩时（大望路）', near: '大望路', type: '综合', lat: 39.909, lng: 116.475 },
  { id: 'bj36', city: 'bj', district: '朝阳', name: '我攀', near: '朝阳东部', type: '综合', lat: 39.915, lng: 116.52 },
  { id: 'bj37', city: 'bj', district: '朝阳', name: '岩时（管庄）', near: '管庄', type: '抱石', lat: 39.91, lng: 116.6 },
  { id: 'bj38', city: 'bj', district: '朝阳', name: '大手', near: '朝阳东部', type: '综合', lat: 39.92, lng: 116.61 },
  { id: 'bj39', city: 'bj', district: '朝阳', name: '鼎石', near: '朝阳南部', type: '综合', lat: 39.87, lng: 116.46 },
  { id: 'bj40', city: 'bj', district: '丰台', name: '人人攀岩（丽泽）', near: '丽泽商务区', type: '难度', lat: 39.87, lng: 116.32 },
  { id: 'bj41', city: 'bj', district: '丰台', name: '飞猫（纪家庙）', near: '纪家庙', type: '综合', lat: 39.85, lng: 116.36 },
  { id: 'bj42', city: 'bj', district: '丰台', name: '奥攀（玉泉营）', near: '玉泉营', type: '综合', lat: 39.845, lng: 116.35 },
  { id: 'bj43', city: 'bj', district: '丰台', name: '奥攀（角门）', near: '角门', type: '综合', lat: 39.845, lng: 116.37 },
  { id: 'bj44', city: 'bj', district: '丰台', name: '魔王', near: '丰台', type: '综合', lat: 39.84, lng: 116.3 },
  { id: 'bj45', city: 'bj', district: '丰台', name: '黑爆', near: '丰台', type: '综合', lat: 39.838, lng: 116.315 },
  { id: 'bj46', city: 'bj', district: '丰台', name: '顽岩', near: '丰台', type: '难度', lat: 39.83, lng: 116.31 },
  { id: 'bj47', city: 'bj', district: '丰台', name: '奥攀（世界公园）', near: '世界公园', type: '综合', lat: 39.81, lng: 116.28 },
  { id: 'bj48', city: 'bj', district: '东城', name: '奥攀（王府井）', near: '王府井', type: '综合', lat: 39.914, lng: 116.411 },
  { id: 'bj49', city: 'bj', district: '大兴', name: '奥攀（鸿坤广场）', near: '西红门', type: '综合', lat: 39.79, lng: 116.33 },
  { id: 'bj50', city: 'bj', district: '通州', name: '趣攀岩', near: '通州', type: '综合', lat: 39.9, lng: 116.66 },
  { id: 'bj51', city: 'bj', district: '通州', name: '此山（通州·未开业）', near: '通州', type: '抱石', lat: 39.91, lng: 116.68 },
  { id: 'bj52', city: 'bj', district: '房山', name: '极石', near: '房山', type: '综合', lat: 39.75, lng: 116.14 },
  { id: 'bj53', city: 'bj', district: '房山', name: '趣野（房山）', near: '房山', type: '综合', lat: 39.755, lng: 116.16 }
];

module.exports = { CITIES, DISTRICT_ORDER, DIRECTORY };
