// 云函数：updateBeta — 作者编辑自己的 Beta
// { id, patch: { title, caution, steps, moveTags, heightFit, visibility } }
// 仅作者本人可改；字段白名单；媒体（图/视频）不在编辑范围（v1 不支持换媒体）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };
  const id = String(event.id || '');
  const p = event.patch || {};
  if (!id) return { ok: false, error: 'missing id' };

  const patch = {};
  if (p.title != null) {
    const t = String(p.title).trim().slice(0, 30);
    if (!t) return { ok: false, error: 'empty title' };
    patch.title = t;
  }
  if (p.caution != null) patch.caution = String(p.caution).trim().slice(0, 40);
  if (Array.isArray(p.steps)) {
    patch.steps = p.steps.slice(0, 6).map((s) => ({
      phase: String((s && s.phase) || '').slice(0, 10),
      text: String((s && s.text) || '').slice(0, 200)
    })).filter((s) => s.text);
    if (!patch.steps.length) return { ok: false, error: 'empty steps' };
  }
  if (Array.isArray(p.moveTags)) patch.moveTags = p.moveTags.slice(0, 5).map((t) => String(t).slice(0, 10));
  if (Array.isArray(p.heightFit)) patch.heightFit = p.heightFit.slice(0, 2).map(Number);
  if (p.visibility === 'public' || p.visibility === 'private') patch.visibility = p.visibility;
  if (!Object.keys(patch).length) return { ok: false, error: 'nothing to update' };

  try {
    const r = await db.collection('betas').where({ id: id }).limit(1).get();
    const doc = r.data && r.data[0];
    if (!doc) return { ok: false, error: 'beta not found' };
    if (doc.userId !== OPENID) return { ok: false, error: '只能编辑自己发布的 Beta' };
    await db.collection('betas').doc(doc._id).update({
      data: Object.assign({}, patch, { mtime: Date.now(), editedAt: new Date().toISOString().slice(0, 10) })
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.errMsg || e).slice(0, 200) };
  }
};
