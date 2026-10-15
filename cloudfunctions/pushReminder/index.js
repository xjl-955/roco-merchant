// 云函数最终版：跨触发器重试（每轮 30 次 × 每分钟 1 次）+ 只推确认在售物品
const cloud = require('wx-server-sdk');
const https = require('https'); // Node 16 无内置 fetch，用 https 模块
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const LIVE_URL = 'https://xjl-955.github.io/roco-data/live.json';
const ROUND_HOURS = { 8: '08:00', 12: '12:00', 16: '16:00', 20: '20:00' };
const RETRY_MAX = 30; // 每轮最多重试 30 次（每分钟 1 次 = 覆盖 30 分钟）

/** https GET（Node 16 兼容，替代 fetch） */
function httpsGet(url) {
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { timeout: 8000 }, function (res) {
      let body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        resolve(body);
      });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

/** 拉取 live（单次，无内部重试）——失败返回 null */
async function fetchLiveOnce() {
  try {
    const body = await httpsGet(LIVE_URL);
    console.log('live fetch HTTP: 200, 大小', body.length);
    const j = JSON.parse(body);
    if (!j.date || !Array.isArray(j.items)) {
      console.error('live 数据结构异常: date=' + j.date, 'items=' + Array.isArray(j.items));
      return null;
    }
    const map = {};
    j.items.forEach(function (it) {
      map[it.name] = { category: it.category || '', price: it.price || '' };
    });
    return { date: j.date, items: map };
  } catch (e) {
    console.error('live fetch 异常:', String(e.message || e).slice(0, 120));
    return null;
  }
}

/** 读取/写入重试状态（retryState 集合，单文档 fixed id） */
const STATE_ID = 'global_retry';
async function getRetryState() {
  try {
    const r = await db.collection('retryState').doc(STATE_ID).get();
    return r.data || {};
  } catch (e) {
    return {}; // 不存在
  }
}
async function setRetryState(state) {
  try {
    await db.collection('retryState').doc(STATE_ID).set({ data: state });
  } catch (e) { /* 忽略 */ }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // ── 订阅上报 ──
  if (event.action === 'sub') {
    const items = event.items || [];
    const tmplId = event.tmplId || '';
    if (!items.length || !tmplId) return { ok: false, reason: 'empty' };
    const exist = await db.collection('subscriptions').where({ openid: openid }).get();
    if (exist.data.length) {
      await db.collection('subscriptions').doc(exist.data[0]._id).update({
        data: { items: items, tmplId: tmplId, updatedAt: Date.now(), notified: {} }
      });
      return { ok: true, action: 'updated' };
    }
    await db.collection('subscriptions').add({
      data: { openid: openid, items: items, tmplId: tmplId, notified: {}, createdAt: Date.now() }
    });
    return { ok: true, action: 'created' };
  }

  // ── 定时推送（触发器每分钟，营业时段）──
  const now = new Date();
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  const hour = bj.getUTCHours();
  const minute = bj.getUTCMinutes();
  const dateKey = bj.toISOString().slice(0, 10);

  if (ROUND_HOURS[hour] === undefined) {
    return { pushed: 0, skip: 'not a round hour' };
  }
  // 窗口：轮次开售后 0~35 分钟（30 次重试空间 + 缓冲）
  if (minute > 35) {
    return { pushed: 0, skip: 'window closed' };
  }

  // ── 拉 live（每次触发拉 1 次）──
  const live = await fetchLiveOnce();
  if (live) {
    // 【日期校验】必须是今天
    if (live.date !== dateKey) {
      console.error('live 数据过期: live.date=' + live.date, '期望', dateKey);
      await setRetryState({ date: dateKey, hour: hour, count: 0, stale: true, updatedAt: Date.now() });
      return { pushed: 0, skip: 'live data stale', liveDate: live.date };
    }
    // 成功 → 清除重试状态 → 推送在售交集
    await setRetryState({ date: dateKey, hour: hour, count: 0, ok: true, updatedAt: Date.now() });
    return await pushRound(live.items, dateKey);
  }

  // live 拉取失败 → 重试状态管理（每轮独立计数：date + hour）
  // exhausted 后只累加计数（无害），不再尝试推送
  const state = await getRetryState();
  if (state.date !== dateKey || state.hour !== hour || state.stale) {
    // 新的一天 / 新一轮 → 初始化（count=1 表示本次是第 1 次尝试）
    await setRetryState({ date: dateKey, hour: hour, count: 1, updatedAt: Date.now() });
    return { pushed: 0, retry: 1, msg: 'live 失败，下分钟重试（1/30）' };
  }
  if (state.exhausted) {
    // 已放弃本轮——继续累加计数便于观察，但不推送
    await setRetryState({ date: dateKey, hour: hour, count: (state.count || 0) + 1, exhausted: true, updatedAt: Date.now() });
    return { pushed: 0, retry: (state.count || 0) + 1, msg: '本轮已放弃（exhausted）' };
  }
  const count = (state.count || 0) + 1;
  if (count >= RETRY_MAX) {
    await setRetryState({ date: dateKey, hour: hour, count: count, exhausted: true, updatedAt: Date.now() });
    console.error('live 拉取重试 ' + RETRY_MAX + ' 次全失败 — 本轮放弃（' + ROUND_HOURS[hour] + '）');
    return { pushed: 0, retry: count, msg: '重试 ' + RETRY_MAX + ' 次全失败，放弃本轮' };
  }
  await setRetryState({ date: dateKey, hour: hour, count: count, updatedAt: Date.now() });
  return { pushed: 0, retry: count, msg: 'live 失败，下分钟重试（' + count + '/30）' };

  // ── 推送本轮在售 ∩ 订阅 ──
  async function pushRound(liveMap, dk) {
    const subs = await db.collection('subscriptions').limit(1000).get();
    let pushed = 0;
    const errors = [];
    const tasks = [];
    for (const doc of subs.data) {
      const items = doc.items || [];
      for (const it of items) {
        const name = it.name || it;
        const notifiedKey = dk + '|' + name;
        if (doc.notified && doc.notified[notifiedKey]) continue;
        if (!liveMap[name]) continue; // 只推本轮在售
        const info = liveMap[name];
        tasks.push({
          doc: doc, name: name,
          category: info.category || it.category || '',
          price: info.price || it.price || '',
          notifiedKey: notifiedKey
        });
      }
    }
    const BATCH = 10;
    for (let i = 0; i < tasks.length; i += BATCH) {
      const batch = tasks.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async function (task) {
        try {
          await cloud.openapi.subscribeMessage.send({
            touser: task.doc.openid,
            templateId: task.doc.tmplId,
            page: 'pages/index/index',
            data: {
              thing1: { value: String(task.name).slice(0, 20) },
              thing2: { value: String(task.category || '道具').slice(0, 20) },
              amount3: { value: parseInt(String(task.price || '0').replace(/[^0-9]/g, ''), 10) || 0 },
              thing4: { value: '已上架，快去看看吧' }
            }
          });
          await db.collection('subscriptions').doc(task.doc._id).update({
            data: { ['notified.' + task.notifiedKey]: true }
          });
          return { ok: true };
        } catch (e) {
          console.error('推送失败:', task.name, 'errCode:', e.errCode || e.message);
          errors.push({ name: task.name, errCode: e.errCode || -1, msg: String(e.errMsg || e.message).slice(0, 100) });
          return { ok: false };
        }
      }));
      pushed += results.filter(function (r) { return r.ok; }).length;
    }
    return { pushed: pushed, total: tasks.length, errors: errors };
  }
};
