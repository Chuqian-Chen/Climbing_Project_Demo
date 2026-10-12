// 云函数：updateRoute — 修改线路的难度/名称
// 权限：线主（doc.setterId == OPENID）或已批准的认证定线员
// 只允许改 grade / name 两个白名单字段；grade 必须是 V0-V12 形式
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };
  const routeId = String(event.routeId || '');
  if (!routeId) return { ok: false, error: 'missing routeId' };

  const patch = {};
  if (event.grade != null) {
    const g = String(event.grade).toUpperCase();
    if (!/^V(1[0-2]|[0-9])$/.test(g)) return { ok: false, error: 'bad grade' };
    patch.grade = g;
  }
  if (event.name != null) {
    // 允许显式传空串 = 清除备注名（真实口径：线路不命名，显示名由颜色+难度自动生成）
    patch.name = String(event.name).trim().slice(0, 15);
  }
  if (event.color != null) {
    // 与 miniprogram/utils/grade.js HOLD_COLORS 键保持一致
    const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'black', 'white'];
    const c = String(event.color);
    if (COLORS.indexOf(c) < 0) return { ok: false, error: 'bad color' };
    patch.color = c;
  }
  if (!Object.keys(patch).length) return { ok: false, error: 'nothing to update' };

  // 找到线路文档（业务 id 字段，非 _id）
  let doc;
  try {
    const r = await db.collection('routes').where({ id: routeId }).limit(1).get();
    doc = r.data && r.data[0];
  } catch (e) { /* fallthrough */ }
  if (!doc) return { ok: false, error: 'route not found' };

  // 身份：线主直接放行；否则须为认证定线员
  let allowed = doc.setterId === OPENID;
  if (!allowed) {
    try {
      const r = await db.collection('setterApplications').doc(OPENID).get();
      allowed = r.data && r.data.status === 'approved';
    } catch (e) { /* 无申请记录 */ }
  }
  if (!allowed) return { ok: false, error: '只有线主或认证定线员可以修改' };

  try {
    await db.collection('routes').doc(doc._id).update({
      data: Object.assign({}, patch, { mtime: Date.now(), updatedBy: OPENID })
    });
    return { ok: true, patch: patch };
  } catch (e) {
    return { ok: false, error: String(e.errMsg || e).slice(0, 200) };
  }
};
