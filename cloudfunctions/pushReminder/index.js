// 云函数最终版：快爆源页面实时解析（推送时获取实时 show_N 数据）
// + 数据新鲜度校验 + 同轮去重 + 订阅去重
const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 快爆源实时页面（与 server/fetch-live.mjs 同源，国内可访问）
const KB_SRC = 'https://www.onebiji.com/hykb_tools/comm/lkwgmerchant/preview.php?id=1&immgj=0';
const LIVE_URL = 'https://xjl-955.github.io/roco-data/live.json'; // 备用
const ROUND_HOURS = { 8: '08:00', 12: '12:00', 16: '16:00', 20: '20:00' };
// 各轮在售时间区间（小时）：1→08-12、2→12-16、3→16-20、4→20-24
const ROUND_RANGE = { 1: [8, 12], 2: [12, 16], 3: [16, 20], 4: [20, 24] };
const RETRY_MAX = 30;

function httpsGet(url, timeout) {
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { timeout: timeout || 8000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, function (res) {
      let body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
        resolve(body);
      });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

function unescapeAttr(s) {
  return String(s).replace(/\\'/g, "'").replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
}

function normalizeImg(s) {
  var v = unescapeAttr(s);
  if (v.indexOf('//') === 0) return 'https:' + v;
  return v;
}

/** 解析快爆源页面 → 实时物品列表（含当前 show_N 轮次） */
function parseKbPage(html) {
  const map = {};
  const liRe = /<li[^>]*class="[^"]*show_([1-4])[^"]*"[^>]*onclick="showShopinfo\('([^']*)','([^']*)','([^']*)','([^']*)'\)"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = liRe.exec(html)) !== null) {
    const round = +m[1];
    const img = unescapeAttr(m[2]);
    const name = unescapeAttr(m[3]);
    const category = unescapeAttr(m[4]);
    const desc = unescapeAttr(m[5]);
    const inner = m[6];
    const priceM = inner.match(/shop_price">([^<]*)<\/em>/);
    const price = priceM ? priceM[1].replace(/[^0-9]/g, '') : '';
    const limitM = inner.match(/限购\s*(\d+)/);
    const limit = limitM ? limitM[1] : '';
    if (!name) continue;
    if (!map[name]) {
      map[name] = { category: category, price: price, limit: limit, image: normalizeImg(img), desc: desc, rounds: [] };
    }
    if (map[name].rounds.indexOf(round) < 0) map[name].rounds.push(round);
  }
  return map;
}

/** 解析页面分享文案里的「❤️ X-Y点在售商品」清单（页面自带的当前轮次权威清单） */
function parseShareCurrent(html) {
  const m = html.match(/❤️\s*(\d{1,2})\s*-\s*(\d{1,2})\s*点在售商品([\s\S]*?)🌟/);
  if (!m) return null;
  const startH = +m[1];
  const endH = +m[2];
  const block = m[3];
  const items = [];
  const re = /·\s*([^\s·]+)\s*([0-9][0-9.,]*\s*万?)\s*洛克贝/g;
  let x;
  while ((x = re.exec(block)) !== null) {
    const name = x[1].trim();
    if (!name) continue;
    items.push({ name: name, price: x[2].replace(/[,\s]/g, '') });
  }
  if (!items.length) return null;
  return { startH: startH, endH: endH, items: items };
}

/** 快爆源实时抓取（重试 3 次） */
async function fetchKbLive() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const html = await httpsGet(KB_SRC, 8000);
      if (html.length < 2000) throw new Error('页面异常（过短）');
      const map = parseKbPage(html);
      const names = Object.keys(map);
      if (names.length < 2) throw new Error('解析到 0 商品');
      const current = parseShareCurrent(html);
      console.log('快爆源实时解析:', names.length, '件物品', current ? ('| 当前在售清单 ' + current.startH + '-' + current.endH + '点 ' + current.items.length + ' 件') : '| 无分享清单');
      const bj = new Date(Date.now() + 8 * 3600 * 1000);
      return { date: bj.toISOString().slice(0, 10), items: map, current: current, source: 'kb' };
    } catch (e) {
      console.error('快爆源抓取失败(' + attempt + '/3):', String(e.message || e).slice(0, 80));
      if (attempt < 3) await new Promise((r2) => setTimeout(r2, 3000));
    }
  }
  return null;
}

/** 备用：live.json（GitHub Pages）——仅接受“营业中”的快照（round 1~4） */
async function fetchLiveFallback() {
  try {
    const body = await httpsGet(LIVE_URL);
    const j = JSON.parse(body);
    if (!j.date || !Array.isArray(j.items)) return null;
    // 【防污染】凌晨抓取的快照 round=0/closed，商品其实是昨天的 → 一律不用
    if (!(Number(j.round) >= 1 && Number(j.round) <= 4) || j.status === 'closed') {
      console.error('live.json 备用数据非营业快照（round=' + j.round + ', status=' + j.status + '），弃用');
      return null;
    }
    const map = {};
    j.items.forEach(function (it) {
      map[it.name] = { category: it.category || '', price: it.price || '', rounds: Array.isArray(it.rounds) ? it.rounds : [] };
    });
    console.log('live.json 备用数据:', Object.keys(map).length, '件');
    return { date: j.date, items: map, source: 'live.json' };
  } catch (e) {
    return null;
  }
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

  // ── 订阅上报 ──
  if (event.action === 'sub') {
    const seen = {};
    const items = [];
    (event.items || []).forEach(function (it) {
      const name = it.name || it;
      if (!name || seen[name]) return;
      seen[name] = true;
      items.push({ name: name, category: it.category || '', price: it.price || '' });
    });
    const tmplId = event.tmplId || '';
    if (!items.length || !tmplId) return { ok: false, reason: 'empty' };
    const exist = await db.collection('subscriptions').where({ openid: openid }).get();
    if (exist.data.length) {
      // 【保留 notified】重复订阅不清空已推送标记，避免同一轮内重复推送
      await db.collection('subscriptions').doc(exist.data[0]._id).update({
        data: { items: items, tmplId: tmplId, updatedAt: Date.now() }
      });
      return { ok: true, action: 'updated' };
    }
    await db.collection('subscriptions').add({
      data: { openid: openid, items: items, tmplId: tmplId, notified: {}, createdAt: Date.now() }
    });
    return { ok: true, action: 'created' };
  }

  // ── 手动测试：立即按页面「在售商品」清单推送一次（忽略通知标记，用于验证）──
  if (event.action === 'test') {
    const liveTest = await fetchKbLive();
    if (!liveTest || !liveTest.current) {
      return { ok: false, reason: '当前没有可用的在售清单（快爆源页面无分享清单）' };
    }
    const list = liveTest.current;
    const subs = await db.collection('subscriptions').limit(1000).get();
    const tasks = [];
    for (const doc of subs.data) {
      const names = {};
      (doc.items || []).forEach(function (it) { const n = it.name || it; if (n) names[n] = true; });
      list.items.forEach(function (it) {
        if (!names[it.name]) return;
        const base = liveTest.items[it.name] || {};
        tasks.push({ doc: doc, name: it.name, category: base.category || '', price: it.price || base.price || '' });
      });
    }
    let pushed = 0;
    const errors = [];
    for (const t of tasks) {
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: t.doc.openid,
          templateId: t.doc.tmplId,
          page: 'pages/index/index',
          data: {
            thing1: { value: String(t.name).slice(0, 20) },
            thing2: { value: String(t.category || '道具').slice(0, 20) },
            amount3: { value: parseInt(String(t.price || '0').replace(/[^0-9]/g, ''), 10) || 0 },
            thing4: { value: '已上架，快去看看吧' }
          }
        });
        pushed++;
      } catch (e) {
        errors.push({ name: t.name, errCode: e.errCode || -1, msg: String(e.errMsg || e.message).slice(0, 100) });
      }
    }
    return {
      ok: true,
      range: list.startH + '-' + list.endH + '点',
      onSale: list.items.map(function (i) { return i.name; }),
      pushed: pushed,
      total: tasks.length,
      errors: errors
    };
  }

  // ── 定时推送 ──
  const now = new Date();
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  const hour = bj.getUTCHours();
  const minute = bj.getUTCMinutes();
  const dateKey = bj.toISOString().slice(0, 10);

  if (ROUND_HOURS[hour] === undefined) {
    return { pushed: 0, skip: 'not a round hour' };
  }
  if (minute > 35) {
    return { pushed: 0, skip: 'window closed' };
  }
  const roundNo = hour === 8 ? 1 : hour === 12 ? 2 : hour === 16 ? 3 : 4;

  // 说明：不做「本轮已推过就整轮跳过」的全局锁——
  // 否则本轮开始后才订阅的用户永远收不到当轮推送。
  // 由每个物品的 notifiedKey（日期+轮次+物品）保证同一物品同一轮只推一次。

  // ── 拉实况：优先快爆源页面实时解析（show_N 实时准确），失败回退 live.json ──
  let live = await fetchKbLive();
  let source = 'kb实时页面';
  if (!live) {
    live = await fetchLiveFallback();
    source = 'live.json备用';
  }
  if (!live) {
    const state = await getRetryState();
    if (state.date !== dateKey || state.hour !== hour || state.stale) {
      await setRetryState({ date: dateKey, hour: hour, count: 1, updatedAt: Date.now() });
      return { pushed: 0, retry: 1, msg: '数据源全失败，下分钟重试（1/30）' };
    }
    const count = (state.count || 0) + 1;
    if (count >= RETRY_MAX) {
      await setRetryState({ date: dateKey, hour: hour, count: count, exhausted: true, updatedAt: Date.now() });
      return { pushed: 0, retry: count, msg: '重试 30 次全失败，放弃本轮' };
    }
    await setRetryState({ date: dateKey, hour: hour, count: count, updatedAt: Date.now() });
    return { pushed: 0, retry: count, msg: '数据源失败，下分钟重试（' + count + '/30）' };
  }

  // ── 校验：数据日期必须是今天 ──
  if (live.date !== dateKey) {
    console.error('数据日期不匹配: ' + live.date, '期望', dateKey, '来源:' + source);
    await setRetryState({ date: dateKey, hour: hour, count: 0, stale: true, updatedAt: Date.now() });
    return { pushed: 0, skip: 'data stale', liveDate: live.date };
  }

  // ── 校验：页面「X-Y点在售商品」必须是本轮（8:00 整页面可能还没切换，不能推）──
  if (live.current) {
    const expect = ROUND_RANGE[roundNo];
    if (live.current.startH !== expect[0] || live.current.endH !== expect[1]) {
      const st = await getRetryState();
      let cnt = (st.date === dateKey && st.hour === hour && !st.stale) ? (st.count || 0) : 0;
      cnt = cnt + 1;
      await setRetryState({ date: dateKey, hour: hour, count: cnt, updatedAt: Date.now() });
      console.error('页面仍显示 ' + live.current.startH + '-' + live.current.endH + '点，未切换到本轮(' + expect[0] + '-' + expect[1] + '点)，等待重试（' + cnt + '/30）');
      return { pushed: 0, retry: cnt, msg: '页面未切换到本轮，下分钟重试（' + cnt + '/30）' };
    }
    // 用页面自带的本轮在售清单（权威）替换物品表，避免 show_N 预告误推
    const curMap = {};
    const names = [];
    live.current.items.forEach(function (it) {
      const base = live.items[it.name] || {};
      curMap[it.name] = {
        category: base.category || '',
        price: it.price || base.price || '',
        rounds: [roundNo]
      };
      names.push(it.name);
    });
    live.items = curMap;
    console.log('本轮在售清单（页面分享文案）:', names.join('、'));

    // 【稳定性校验】清单需与上一分钟一致才推送：
    // 页面切换瞬间可能先换轮次标签、后换商品（或反之），避免推到过渡快照
    const sig = live.current.startH + '-' + live.current.endH + '|' + names.join(',');
    const st2 = await getRetryState();
    const sameRound = st2.date === dateKey && st2.hour === hour && !st2.stale;
    if (!(sameRound && st2.shareSig === sig)) {
      await setRetryState({ date: dateKey, hour: hour, count: 0, shareSig: sig, updatedAt: Date.now() });
      console.log('在售清单首次确认，等待下一分钟复核:', sig);
      return { pushed: 0, retry: 0, msg: '在售清单待复核，下分钟确认后推送' };
    }
  } else {
    // 页面暂无「X-Y点在售商品」清单（常见于轮次切换瞬间）：
    // 不用 show_N 标签猜（会推错），先等待；连续 10 分钟仍无 → 兜底
    const st = await getRetryState();
    let cnt = (st.date === dateKey && st.hour === hour && !st.stale) ? (st.count || 0) : 0;
    cnt = cnt + 1;
    if (cnt <= 10) {
      await setRetryState({ date: dateKey, hour: hour, count: cnt, updatedAt: Date.now() });
      console.error('页面暂无「在售商品」清单，等待重试（' + cnt + '/10）');
      return { pushed: 0, retry: cnt, msg: '页面暂无在售清单，下分钟重试（' + cnt + '/10）' };
    }
    console.error('页面持续无分享清单，改用 show_N 兜底（第 ' + cnt + ' 次）');
  }
  }

  await setRetryState({ date: dateKey, hour: hour, count: 0, ok: true, updatedAt: Date.now() });
  return await pushRound(live.items, dateKey, roundNo);

  // ── 推送本轮在售 ∩ 订阅 ──
  async function pushRound(liveMap, dk, roundNo) {
    const subs = await db.collection('subscriptions').limit(1000).get();
    let pushed = 0;
    const errors = [];
    const tasks = [];
    for (const doc of subs.data) {
      const items = doc.items || [];
      const seenNames = {}; // 【推送去重】同一用户同一物品只推一条
      for (const it of items) {
        const name = it.name || it;
        if (!name || seenNames[name]) continue;
        seenNames[name] = true;
        const notifiedKey = dk + '|r' + roundNo + '|' + name;
        // 【同轮去重】本轮已推过的物品不再重复（不同轮次 key 不同，互不影响）
        if (doc.notified && doc.notified[notifiedKey]) continue;
        const info = liveMap[name];
        if (!info) continue;
        // 【轮次过滤】当前轮次号在物品的实时 rounds 里（快爆源 show_N 实时）
        if ((info.rounds || []).indexOf(roundNo) < 0) continue;
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
    // 诊断信息：订阅人数/订阅物品数/本轮在售物品，便于排查 total=0 的原因
    let subItemCount = 0;
    subs.data.forEach(function (d) { subItemCount += (d.items || []).length; });
    const roundItems = Object.keys(liveMap);
    console.log('诊断: 订阅用户', subs.data.length, '人 | 订阅物品', subItemCount, '条 | 本轮在售', roundItems.join('、') || '(空)');
    return {
      pushed: pushed, total: tasks.length, round: roundNo, source: source,
      subs: subs.data.length, subItems: subItemCount, roundItems: roundItems,
      errors: errors
    };
  }
};
