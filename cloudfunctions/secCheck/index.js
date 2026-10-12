// 内容安全检测：UGC 上行前统一走这里
// event: { texts: string[], imageFileIDs: string[](cloud fileID), scene?: number }
// 返回 { ok: true, unchecked?: true } 或 { ok: false, reason: 'text'|'image' }
// 原则：明确违规才拦截；检测服务本身出错（额度/网络/权限）放行并标记 unchecked，
// 不让安全检测故障阻断用户正常使用。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function isViolation(e) {
  // 87014 = 内容含违规信息（v1 错误码，v2 部分场景仍返回）
  return !!(e && (e.errCode === 87014 || /87014/.test(String(e.errMsg || e.message || ''))));
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const texts = (event.texts || [])
    .map((t) => String(t || '').trim()).filter(Boolean);
  const fileIDs = (event.imageFileIDs || []).filter(Boolean);
  let unchecked = false;
  const checks = []; // 观测：每段文字的 suggest/label（排查漏拦/误拦用）

  // 文字：msgSecCheck v2（scene 1资料/2评论/3论坛/4社交日志，默认2）
  for (const t of texts) {
    try {
      const r = await cloud.openapi.security.msgSecCheck({
        openid: OPENID,
        scene: event.scene || 2,
        version: 2,
        content: t.slice(0, 2500)
      });
      const suggest = r && r.result && r.result.suggest;
      checks.push({ suggest: suggest || '?', label: r && r.result && r.result.label });
      // risky 与 review 都拦：个人号没有人工审核后台，review（多为时政敏感）
      // 放出去就是封号风险；实测正常运动内容均为 pass，误伤概率低
      if (suggest === 'risky' || suggest === 'review') return { ok: false, reason: 'text' };
    } catch (e) {
      if (isViolation(e)) return { ok: false, reason: 'text' };
      checks.push({ error: String(e.errCode || e.errMsg || e).slice(0, 80) });
      unchecked = true;
    }
  }

  // 图片：imgSecCheck（限 1M；超限跳过并标记 unchecked）
  for (const fid of fileIDs) {
    try {
      const dl = await cloud.downloadFile({ fileID: fid });
      const buf = dl && dl.fileContent;
      if (!buf || buf.length > 1024 * 1024) { unchecked = true; continue; }
      await cloud.openapi.security.imgSecCheck({
        media: { contentType: 'image/png', value: buf }
      });
    } catch (e) {
      if (isViolation(e)) return { ok: false, reason: 'image' };
      unchecked = true;
    }
  }

  return unchecked ? { ok: true, unchecked: true, checks: checks } : { ok: true, checks: checks };
};
