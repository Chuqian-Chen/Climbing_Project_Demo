// 云函数：deleteContent — 删除自己发布的内容（软删，保证增量同步能看到消失）
// { type:'beta', id }  作者本人可删；连带软删该 Beta 的评论
// { type:'comment', id } 评论作者本人可删
// { type:'checkin', id } 打卡本人可删
// { type:'route', id } 线主或认证定线员可删；
//   线上有他人的 Beta/打卡 → 不删，转 status='removed'（下架），返回 mode:'retired'
//   只有自己的内容 → 软删线路 + 自己挂在线上的 Beta（及其评论）+ 自己的打卡
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

async function isApprovedSetter(openid) {
  try {
    const r = await db.collection('setterApplications').doc(openid).get();
    return r.data && r.data.status === 'approved';
  } catch (e) { return false; }
}

async function findByBizId(coll, id) {
  const r = await db.collection(coll).where({ id: id }).limit(1).get();
  return (r.data && r.data[0]) || null;
}

async function softDelete(coll, _id) {
  await db.collection(coll).doc(_id).update({
    data: { deleted: true, mtime: Date.now() }
  });
}

async function softDeleteBeta(beta) {
  await softDelete('betas', beta._id);
  try {
    const comments = await db.collection('comments').where({ betaId: beta.id }).get();
    for (const c of (comments.data || [])) {
      await softDelete('comments', c._id);
    }
  } catch (e) { /* 评论清理失败不阻断 */ }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };
  const id = String(event.id || '');
  if (!id) return { ok: false, error: 'missing id' };

  try {
    if (event.type === 'comment') {
      const c = await findByBizId('comments', id);
      if (!c) return { ok: false, error: 'comment not found' };
      if (c.userId !== OPENID) return { ok: false, error: '只能删除自己的评论' };
      await softDelete('comments', c._id);
      return { ok: true, mode: 'deleted' };
    }

    if (event.type === 'checkin') {
      const k = await findByBizId('checkins', id);
      if (!k) return { ok: false, error: 'checkin not found' };
      if (k.userId !== OPENID) return { ok: false, error: '只能删除自己的打卡' };
      await softDelete('checkins', k._id);
      return { ok: true, mode: 'deleted' };
    }

    if (event.type === 'beta') {
      const beta = await findByBizId('betas', id);
      if (!beta) return { ok: false, error: 'beta not found' };
      if (beta.userId !== OPENID) return { ok: false, error: '只能删除自己发布的 Beta' };
      await softDeleteBeta(beta);
      return { ok: true, mode: 'deleted' };
    }

    if (event.type === 'route') {
      const route = await findByBizId('routes', id);
      if (!route) return { ok: false, error: 'route not found' };
      const allowed = route.setterId === OPENID || await isApprovedSetter(OPENID);
      if (!allowed) return { ok: false, error: '只有线主或认证定线员可以删除' };

      const othersBeta = await db.collection('betas')
        .where({ routeId: id, userId: _.neq(OPENID) }).count();
      const othersCheckin = await db.collection('checkins')
        .where({ routeId: id, userId: _.neq(OPENID) }).count();
      if (othersBeta.total > 0 || othersCheckin.total > 0) {
        await db.collection('routes').doc(route._id).update({
          data: { status: 'removed', removeDate: new Date().toISOString().slice(0, 10), retiredBy: OPENID, mtime: Date.now() }
        });
        return { ok: true, mode: 'retired', othersBeta: othersBeta.total, othersCheckin: othersCheckin.total };
      }

      await softDelete('routes', route._id);
      const myBetas = await db.collection('betas')
        .where({ routeId: id, userId: OPENID }).get();
      for (const b of (myBetas.data || [])) {
        if (!b.deleted) await softDeleteBeta(b);
      }
      try {
        const myCheckins = await db.collection('checkins')
          .where({ routeId: id, userId: OPENID }).get();
        for (const k of (myCheckins.data || [])) {
          if (!k.deleted) await softDelete('checkins', k._id);
        }
      } catch (e) { /* ignore */ }
      return { ok: true, mode: 'deleted', betasRemoved: (myBetas.data || []).length };
    }

    return { ok: false, error: 'bad type' };
  } catch (e) {
    return { ok: false, error: String(e.errMsg || e).slice(0, 200) };
  }
};
