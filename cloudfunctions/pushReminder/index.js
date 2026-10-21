// 云函数三重修复版：数据新鲜度校验 + 同轮去重 + 订阅去重
const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const LIVE_URL = 'https://xjl-955.github.io/roco-data/live.json';
const ROUND_HOURS = { 8: '08:00', 12: '12:00', 16: '16:00', 20: '20:00' };
const RETRY_MAX = 30;      // 每轮最多重试 30 次（每分钟 1 次）
const LIVE_MAX_AGE = 30 * 60 * 1000; // live 数据新鲜度：30 分钟

/** https GET（Node 16 兼容） */
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

/** 拉取 live（重试 10 次/间隔 6s）——失败返回 null */
async function fetchLiveOnce() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const body = await httpsGet(LIVE_URL);
      console.log('live fetch HTTP: 200, 大小', body.length);
      const j = JSON.parse(body);
      if (!j.date || !Array.isArray(j.items)) {
        console.error('live 数据结构异常');
        return null;
      }
      const map = {};
      j.items.forEach(function (it) {
        map[it.name] = {
          category: it.category || '',
          price: it.price || '',
          rounds: Array.isArray(it.rounds) ? it.rounds : []
        };
      });
      return { date: j.date, fetchedAt: j.fetchedAt || '', items: map };
    } catch (e) {
      console.error('live 拉取失败(' + attempt + '/10):', String(e.message || e).slice(0, 80));
      if (attempt < 10) await new Promise((r2) => setTimeout(r2, 6000));
    }
  }
  return null;
}

/** 重试状态 */
const STATE_ID = 'global_retry';
async function getRetryState() {
  try {
    const r = await db.collection('retryState').doc(STATE_ID).get();
    return r.data || {};
  } catch (e) { return {}; }
}
async function setRetryState(state) {
  try { await db.collection('retryState').doc(STATE_ID).set({ data: state }); } catch (e) { }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // ── 订阅上报（items 按 name 去重）──
  if (event.action === 'sub') {
    const raw = event.items || [];
    const seen = {};
    const items = [];
    raw.forEach(function (it) {
      const name = it.name || it;
      if (!name || seen[name]) return;
      seen[name] = true;
      items.push({
        name: name,
        category: it.category || '',
        price: it.price || ''
      });
    });
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
  // 窗口：轮次开售后 0~35 分钟
  if (minute > 35) {
    return { pushed: 0, skip: 'window closed' };
  }
  const roundNo = hour === 8 ? 1 : hour === 12 ? 2 : hour === 16 ? 3 : 4;

  // ── 拉 live（重试 10 次/6s）──
  const live = await fetchLiveOnce();
  if (!live) {
    // 拉取失败 → 本轮跳过（不推不确定的物品）
    const state = await getRetryState();
    if (state.date !== dateKey || state.hour !== hour || state.stale) {
      await setRetryState({ date: dateKey, hour: hour, count: 1, updatedAt: Date.now() });
      return { pushed: 0, retry: 1, msg: 'live 失败，下分钟重试（1/30）' };
    }
    const count = (state.count || 0) + 1;
    if (count >= RETRY_MAX) {
      await setRetryState({ date: dateKey, hour: hour, count: count, exhausted: true, updatedAt: Date.now() });
      return { pushed: 0, retry: count, msg: '重试 30 次全失败，放弃本轮' };
    }
    await setRetryState({ date: dateKey, hour: hour, count: count, updatedAt: Date.now() });
    return { pushed: 0, retry: count, msg: 'live 失败，下分钟重试（' + count + '/30）' };
  }

  // 【校验0】每轮只推送一次——本轮已完成则直接跳过
  const state0 = await getRetryState();
  if (state0.date === dateKey && state0.hour === hour && state0.roundDone) {
    return { pushed: 0, skip: 'round already pushed', round: roundNo };
  }
  // 窗口内若上一分钟还在重试拉取（count>0 未完成），继续走重试逻辑而非跳过

  // 【校验1】live 日期必须是今天
  if (live.date !== dateKey) {
    console.error('live 数据过期: live.date=' + live.date, '期望', dateKey);
    await setRetryState({ date: dateKey, hour: hour, count: 0, stale: true, updatedAt: Date.now() });
    return { pushed: 0, skip: 'live data stale', liveDate: live.date };
  }

  // 【校验2】live 数据新鲜度：fetchedAt 距今 < 30 分钟
  // （跨天竞态：凌晨 date 已更新但 items 是旧的 → fetchedAt 停在昨晚 → 拦截）
  if (live.fetchedAt) {
    const ft = new Date(live.fetchedAt).getTime();
    const age = Date.now() - ft;
    if (age > LIVE_MAX_AGE) {
      console.error('live 数据不新鲜: fetchedAt=' + live.fetchedAt, '距今', Math.round(age / 60000), '分钟');
      await setRetryState({ date: dateKey, hour: hour, count: 0, stale: true, updatedAt: Date.now() });
      return { pushed: 0, skip: 'live data not fresh', liveAgeMin: Math.round(age / 60000) };
    }
  }

  // 校验通过 → 清除重试状态 → 推送
  await setRetryState({ date: dateKey, hour: hour, count: 0, ok: true, updatedAt: Date.now() });
  return await pushRound(live.items, dateKey, roundNo);

  // ── 推送本轮在售 ∩ 订阅（同轮内去重：notified 含轮次号）──
  async function pushRound(liveMap, dk, roundNo) {
    const subs = await db.collection('subscriptions').limit(1000).get();
    let pushed = 0;
    const errors = [];
    const tasks = [];
    for (const doc of subs.data) {
      const items = doc.items || [];
      for (const it of items) {
        const name = it.name || it;
        const notifiedKey = dk + '|r' + roundNo + '|' + name;
        // 【同轮去重】本轮已推过的不重复推（不同轮次 key 不同，互不影响）
        if (doc.notified && doc.notified[notifiedKey]) continue;
        const info = liveMap[name];
        if (!info) continue;
        // 【轮次过滤】rounds 含当前轮次号才推
        if (roundNo && (info.rounds || []).indexOf(roundNo) < 0) continue;
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
    // 【每轮只推一次】推送执行后标记本轮完成（后续触发直接 skip）
    await setRetryState({ date: dk, hour: roundNo === 1 ? 8 : roundNo === 2 ? 12 : roundNo === 3 ? 16 : 20, roundDone: true, updatedAt: Date.now() });
    return { pushed: pushed, total: tasks.length, round: roundNo, errors: errors };
  }
};
