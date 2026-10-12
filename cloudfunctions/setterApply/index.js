// 云函数：setterApply — 定线员认证申请流
// { action:'apply', gymName, note, snap } → 提交/更新申请（每 openid 一份，doc id = openid）
// { action:'status' } → 查询自己的申请状态 { status: 'none'|'pending'|'approved'|'rejected' }
// 审批：管理员在云开发控制台 setterApplications 集合把对应文档 status 改为 'approved'
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COLL = 'setterApplications';

async function ensureColl() {
  try { await db.createCollection(COLL); } catch (e) { /* exists */ }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };
  await ensureColl();

  if (event.action === 'apply') {
    let existing = null;
    try {
      existing = (await db.collection(COLL).doc(OPENID).get()).data || null;
    } catch (e) {
      existing = null;
    }
    if (existing && existing.status === 'approved') {
      return { ok: true, status: 'approved', already: true };
    }
    const doc = {
      openid: OPENID,
      gymName: String(event.gymName || '').slice(0, 50),
      realName: String(event.realName || '').slice(0, 30),
      years: String(event.years || '').slice(0, 20),
      contact: String(event.contact || '').slice(0, 50),
      note: String(event.note || '').slice(0, 200),
      snap: event.snap || null,
      status: 'pending',
      appliedAt: (existing && existing.appliedAt) || new Date().toISOString()
    };
    try {
      await db.collection(COLL).doc(OPENID).set({ data: doc });
      return { ok: true, status: 'pending' };
    } catch (e) {
      return { ok: false, error: String(e.errMsg || e).slice(0, 200) };
    }
  }

  // 默认：查状态（附带申请信息，供定线员工作台展示）
  try {
    const r = await db.collection(COLL).doc(OPENID).get();
    const d = r.data || {};
    return {
      ok: true,
      status: d.status || 'none',
      gymName: d.gymName || '',
      appliedAt: d.appliedAt || ''
    };
  } catch (e) {
    return { ok: true, status: 'none' };
  }
};
