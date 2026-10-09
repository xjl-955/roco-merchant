// 云函数：pushReminder（腾讯云开发 · 定时触发器每分钟执行）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const now = new Date();
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  const hour = bj.getUTCHours();
  const minute = bj.getUTCMinutes();
  const dateKey = bj.toISOString().slice(0, 10);

  const roundStarts = { 8: '08:00', 12: '12:00', 16: '16:00', 20: '20:00' };
  if (minute > 2) return { pushed: 0, skip: 'not round start window' };

  const subs = await db.collection('subscriptions').limit(1000).get();
  let pushed = 0;

  for (const doc of subs.data) {
    const items = doc.items || [];
    for (const name of items) {
      const notifiedKey = dateKey + '|' + name;
      if (doc.notified && doc.notified[notifiedKey]) continue;
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: doc.openid,
          templateId: doc.tmplId,
          page: 'pages/index/index',
          data: {
            // 模板"产品上新通知"关键词：产品名称/分类/金额/温馨提示
            thing1: { value: String(name).slice(0, 20) },
            thing2: { value: String(mk.category || '道具').slice(0, 20) },
            amount3: { value: String(mk.price || '').slice(0, 20) },
            thing4: { value: '已上架，快去看看吧' }
          }
        });
        pushed++;
        await db.collection('subscriptions').doc(doc._id).update({
          data: { ['notified.' + notifiedKey]: true }
        });
      } catch (e) { /* 43101 未授权 */ }
    }
  }
  return { pushed: pushed };
};
