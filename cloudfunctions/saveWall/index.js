// 云函数：saveWall — 墙面文档协作写入（同一面墙全局唯一文档，任何岩友可完善标注）
// 两种模式：
// 1) 操作级（推荐）：{ key, op } — 服务端字段级写入：
//    holds 按 holds.{routeId} 字段隔离，两个定线员并发标注不同线路不会互吞
//    （2026-07-31 修复：旧版读-改-写整 doc set，两个并发 setHolds 后写会覆盖先写）
//    op: { type:'setHolds', routeId, holds, marker }   设置某线路岩点+徽章
//        { type:'removeRoute', routeId }               清掉某线路的标注
//        { type:'setPhoto', photoFileID, photoPath }   更换墙照
//    已知残余竞态：markers 是整数组重算，两条线同时改徽章仍可能丢一个（下次编辑自愈）；
//    根治需数据库事务，backlog。
// 2) 整文档（兼容旧版）：{ key, doc } — 全量覆盖，仅初次创建/本地兜底用
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function applyOp(cur, op) {
  const doc = Object.assign({ markers: [], holds: {} }, cur);
  doc.holds = Object.assign({}, doc.holds);
  if (op.type === 'setHolds') {
    if (!op.routeId) return doc;
    doc.holds[op.routeId] = op.holds || [];
    doc.markers = (doc.markers || []).filter((m) => m.routeId !== op.routeId);
    if (op.marker) doc.markers = doc.markers.concat([Object.assign({ routeId: op.routeId }, op.marker)]);
  } else if (op.type === 'removeRoute') {
    delete doc.holds[op.routeId];
    doc.markers = (doc.markers || []).filter((m) => m.routeId !== op.routeId);
  } else if (op.type === 'setPhoto') {
    doc.photoFileID = op.photoFileID || '';
    doc.photoPath = op.photoPath || '';
  }
  return doc;
}

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID || '';
  if (!openid) return { ok: false, err: 'no openid' };
  const key = event && event.key;
  if (!key) return { ok: false, err: 'bad params' };
  const db = cloud.database();
  const _ = db.command;
  const coll = db.collection('walls');

  try {
    if (event.op && event.op.type) {
      const op = event.op;
      let cur = null;
      try {
        const r = await coll.doc(key).get();
        cur = r.data;
      } catch (e) { /* 文档不存在 */ }

      if (!cur) {
        // 从空墙创建：整 doc set（无并发对象）
        const next = applyOp({ key: key, gymId: event.gymId || '', wallId: event.wallId || '' }, op);
        delete next._id;
        next.updatedBy = openid;
        if (event.editorSnap) next.editorSnap = event.editorSnap;
        next.mtime = Date.now();
        await coll.doc(key).set({ data: next });
        return { ok: true, mode: 'create' };
      }

      // 已有文档：字段级 update，只动 op 涉及的字段
      const patch = { updatedBy: openid, mtime: Date.now() };
      if (event.editorSnap) patch.editorSnap = event.editorSnap;
      if (op.type === 'setHolds') {
        patch['holds.' + op.routeId] = op.holds || [];
        patch.markers = (cur.markers || []).filter((m) => m.routeId !== op.routeId)
          .concat(op.marker ? [Object.assign({ routeId: op.routeId }, op.marker)] : []);
      } else if (op.type === 'removeRoute') {
        patch['holds.' + op.routeId] = _.remove();
        patch.markers = (cur.markers || []).filter((m) => m.routeId !== op.routeId);
      } else if (op.type === 'setPhoto') {
        patch.photoFileID = op.photoFileID || '';
        patch.photoPath = op.photoPath || '';
      } else {
        // 未知 op（如 touch）：只刷 mtime
      }
      await coll.doc(key).update({ data: patch });
      return { ok: true, mode: 'op' };
    }

    // 兼容旧版：整文档覆盖
    const doc = event && event.doc;
    if (!doc) return { ok: false, err: 'bad params' };
    const data = Object.assign({}, doc);
    delete data._id;
    data.updatedBy = openid;
    data.mtime = Date.now();
    await coll.doc(key).set({ data: data });
    return { ok: true, mode: 'doc' };
  } catch (e) {
    return { ok: false, err: e.message };
  }
};
