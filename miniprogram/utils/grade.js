// 难度等级与岩点颜色体系
const GRADE_LIST = ['V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10+'];

// 岩点/胶带颜色（国内抱石馆常见配色）
const HOLD_COLORS = {
  red:    { key: 'red',    name: '红', hex: '#e5484d', light: false },
  orange: { key: 'orange', name: '橙', hex: '#f76b15', light: false },
  yellow: { key: 'yellow', name: '黄', hex: '#ffc53d', light: false },
  green:  { key: 'green',  name: '绿', hex: '#30a46c', light: false },
  blue:   { key: 'blue',   name: '蓝', hex: '#0090ff', light: false },
  purple: { key: 'purple', name: '紫', hex: '#8e4ec6', light: false },
  pink:   { key: 'pink',   name: '粉', hex: '#e93d82', light: false },
  black:  { key: 'black',  name: '黑', hex: '#26292f', light: false },
  white:  { key: 'white',  name: '白', hex: '#f2f3f5', light: true }
};

// V 等级 -> 展示色（绿→蓝→黄→橙→红→紫，由易到难）
function gradeColor(grade) {
  const n = gradeIndex(grade);
  if (n <= 1) return '#30a46c';
  if (n <= 3) return '#0090ff';
  if (n <= 5) return '#f5a623';
  if (n <= 7) return '#f76b15';
  if (n <= 8) return '#e5484d';
  return '#8e4ec6';
}

function gradeIndex(grade) {
  const n = parseInt(String(grade || '').replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// 常用动作标签（发布 Beta 时可多选）
const MOVE_TAGS = [
  '动态跳跃', '双手起跳', '挂脚跟', '勾脚尖', '高脚', '折膝',
  '侧拉', '锁定', '顶胯', '重心转换', '核心张力', '压手上墙',
  '小点发力', '大圆点', '交叉手', '手点顺序', '平衡'
];

module.exports = { GRADE_LIST, HOLD_COLORS, MOVE_TAGS, gradeColor, gradeIndex };
