// 云函数：retireWall — 整墙换线（批量下架本墙 active 线路）
// 服务端校验：调用者必须是已批准的认证定线员（setterApplications 中 status='approved'）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { gymId, wallId } = event;
  if (!gymId || !wallId) return { ok: false, error: 'missing gymId/wallId' };

  // 身份校验：认证定线员才可整墙下架
  let approved = false;
  try {
    const r = await db.collection('setterApplications').doc(OPENID).get();
    approved = r.data && r.data.status === 'approved';
  } catch (e) { /* 无申请记录 */ }
  if (!approved) return { ok: false, error: '需要认证定线员身份（在「我的」页申请）' };

  const today = new Date().toISOString().slice(0, 10);
  try {
    const r = await db.collection('routes')
      .where({ gymId: gymId, wallId: wallId, status: 'active' })
      .update({ data: { status: 'removed', removeDate: today, retiredBy: OPENID, mtime: Date.now() } });
    return { ok: true, retired: (r.stats && r.stats.updated) || 0 };
  } catch (e) {
    return { ok: false, error: String(e.errMsg || e).slice(0, 200) };
  }
};
