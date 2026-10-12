// 云函数：login — 获取用户 openid（接入云开发后的身份基石）
// 部署：开发者工具中开通云开发 → project.config.json 添加
//   "cloudfunctionRoot": "cloudfunctions/"
// → 右键本目录「上传并部署」
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID
  };
};
