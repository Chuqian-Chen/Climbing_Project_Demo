// 云函数：saveGymMeta — 众包写入岩馆分级标准（管理员权限，客户端无需集合写权限）
// event: { gymId, meta: {gradeBy, gradeSystem, gradeNote}, editorSnap }
// 只允许更新白名单字段，防止覆盖馆的其他信息
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };
  const gymId = event.gymId;
  const meta = event.meta || {};
  if (!gymId) return { ok: false, error: 'missing gymId' };

  const patch = {
    gradeBy: ['hold', 'tape', 'sign'].indexOf(meta.gradeBy) >= 0 ? meta.gradeBy : 'hold',
    gradeSystem: Array.isArray(meta.gradeSystem)
      ? meta.gradeSystem.slice(0, 20).map((x) => ({
          color: String(x.color || '').slice(0, 20),
          grade: String(x.grade || '').slice(0, 10)
        }))
      : [],
    gradeNote: String(meta.gradeNote || '').slice(0, 100),
    metaEditor: OPENID,
    metaEditorSnap: event.editorSnap || null,
    metaUpdatedAt: new Date().toISOString().slice(0, 10),
    mtime: Date.now()
  };

  try {
    const r = await db.collection('gyms').doc(gymId).update({ data: patch });
    const updated = (r.stats && r.stats.updated) || 0;
    if (!updated) return { ok: false, error: 'gym not found' };
    return { ok: true, updated: updated };
  } catch (e) {
    return { ok: false, error: String(e.errMsg || e).slice(0, 200) };
  }
};
