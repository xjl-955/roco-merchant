// 云函数：处理 action=sub（订阅上报写入数据库）+ 定时推送
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // ── 订阅上报：前端确认订阅后调用 ──
  if (event.action === 'sub') {
    const items = event.items || [];
    const tmplId = event.tmplId || '';
    if (!items.length || !tmplId) return { ok: false, reason: 'empty' };
    // 查已有记录（同一用户一条文档，重复订阅则更新）
    const exist = await db.collection('subscriptions').where({ openid: openid }).get();
    if (exist.data.length) {
      await db.collection('subscriptions').doc(exist.data[0]._id).update({
        data: {
          items: items,
          tmplId: tmplId,
          updatedAt: Date.now(),
          notified: {}  // 重置通知标记（新一轮订阅）
        }
      });
      return { ok: true, action: 'updated' };
    }
    await db.collection('subscriptions').add({
      data: {
        openid: openid,
        items: items,
        tmplId: tmplId,
        notified: {},
        createdAt: Date.now()
      }
    });
    return { ok: true, action: 'created' };
  }

  // ── 定时推送（触发器每分钟）──
  const now = new Date();
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  const hour = bj.getUTCHours();
  const minute = bj.getUTCMinutes();
  const dateKey = bj.toISOString().slice(0, 10);

  // 只在轮次开售时间点的 0~2 分钟内推送
  const ROUND_HOURS = { 8: '08:00', 12: '12:00', 16: '16:00', 20: '20:00' };
  if (ROUND_HOURS[hour] === undefined || minute > 2) {
    return { pushed: 0, skip: 'not in push window' };
  }

  const subs = await db.collection('subscriptions').limit(1000).get();
  let pushed = 0;

  for (const doc of subs.data) {
    const items = doc.items || [];
    for (const it of items) {
      const name = it.name || it;
      const notifiedKey = dateKey + '|' + name;
      if (doc.notified && doc.notified[notifiedKey]) continue;
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: doc.openid,
          templateId: doc.tmplId,
          page: 'pages/index/index',
          data: {
            // 模板"产品上新通知"：产品名称/分类/金额/温馨提示
            thing1: { value: String(name).slice(0, 20) },
            thing2: { value: String(it.category || '道具').slice(0, 20) },
            amount3: { value: String(it.price || '').slice(0, 20) },
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
