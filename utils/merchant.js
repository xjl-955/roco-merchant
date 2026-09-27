/**
 * 远行商人核心逻辑（支持动态数据源 + 按日轮次视图）
 *
 * 数据来源三层：
 *   1. 远程拉取（GitHub Pages 托管的 schedule.json，由 server/fetch-schedule.mjs 定时生成）
 *   2. 本地缓存（上次成功拉取的数据，秒开）
 *   3. 内置兜底（打包时自带的最小档期表，保证离线/首次打开可用）
 *
 * 时间均为北京时间（UTC+8）。逻辑按设备本地时区计算。
 */

var builtin = require('../data/schedule.js');

/** 运行时数据状态 */
var state = {
  sessions: builtin.SESSIONS,
  meta: builtin.META,
  source: 'builtin' // 'builtin' | 'remote' | 'cache'
};

var TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

/** 商品图标（展示用 emoji，找不到用 🎁） */
var ICON_MAP = {
  '网兜球': '🥅', '美妙球': '✨', '暗星球': '🌑', '淘沙球': '🏖️',
  '光合球': '🌿', '变幻球': '🌀', '调温球': '🌡️', '绝缘球': '⚡',
  '可可果球': '🍫', '国王球': '👑', '失重球': '🎈', '魔力果': '🍇',
  '神奇的蛋': '🥚', '黑晶琉璃': '🔮', '紫莲荆玉': '💜', '翼东粉尘': '🦋'
};

/** 营业时间（24 小时制，按分钟计） */
var OPEN_MINUTE = 8 * 60;    // 08:00
var CLOSE_MINUTE = 24 * 60;  // 24:00

/** 每日四轮的时段（好游快爆渠道机制：08/12/16/20 点刷新，每轮 4 小时） */
var ROUND_WINDOWS = {
  1: '08:00-11:59',
  2: '12:00-15:59',
  3: '16:00-19:59',
  4: '20:00-23:59'
};

/** 实时轮次数据（由 live 层注入；仅"今天"的四轮商品明细） */
var liveToday = null;

/**
 * 应用远程/缓存数据。校验通过返回 true 并切换数据源，否则返回 false。
 */
function applyRemoteData(payload) {
  if (!payload || payload.formatVersion !== 1 || !Array.isArray(payload.sessions)) {
    return false;
  }
  var sessions = [];
  for (var i = 0; i < payload.sessions.length; i++) {
    var s = payload.sessions[i];
    if (!s || !TIME_RE.test(s.start) || !TIME_RE.test(s.end)) return false;
    if (new Date(s.start.replace(/-/g, '/')).getTime() >=
        new Date(s.end.replace(/-/g, '/')).getTime()) return false;
    var goods = Array.isArray(s.goods) ? s.goods : [];
    for (var j = 0; j < goods.length; j++) {
      var g = goods[j];
      if (!g || typeof g.name !== 'string') return false;
      if (!g.daily && !Array.isArray(g.extra)) return false;
      if (g.window) {
        var pw = parseWindow(g.window);
        // 时段必须在当日范围内：开始不晚于 23:59，结束不晚于 24:00
        if (!pw || pw.startMin >= 24 * 60 || pw.endMin > 24 * 60) return false;
      }
    }
    sessions.push({ start: s.start, end: s.end, goods: goods });
  }
  if (sessions.length < 3) return false; // 防御性：数据明显不完整时拒绝

  state.sessions = sessions;
  state.meta = payload.meta || builtin.META;
  return true;
}

/** 标记当前数据来源（api 层在成功后调用） */
function setSource(source) {
  state.source = source;
}

function getMeta() {
  return state.meta;
}

function getSource() {
  return state.source;
}

/** 内置数据的更新日期，用于远程数据新旧比较 */
function getBuiltinUpdatedAt() {
  return builtin.META && builtin.META.updatedAt;
}

/** 把 'YYYY-MM-DD HH:mm' 解析为本地时间 Date */
function parseTime(str) {
  return new Date(str.replace(/-/g, '/'));
}

/**
 * 注入实时轮次数据（rocokingdomworld.org 公开 JSON）。
 * 校验通过返回 true 并替换；校验失败返回 false 且保留既有数据。
 */
function applyLiveToday(payload) {
  if (!payload || !Array.isArray(payload.items) || !payload.rounds) return false;
  if (typeof payload.startedAtBeijing !== 'string') return false;
  if (!TIME_RE.test(payload.startedAtBeijing.slice(0, 16))) return false;

  var items = [];
  for (var i = 0; i < payload.items.length; i++) {
    var it = payload.items[i];
    if (!it || typeof it.name !== 'string' || !it.name) return false;
    var rounds = Array.isArray(it.rounds) ? it.rounds.slice(0, 8) : [];
    var okRounds = [];
    for (var j = 0; j < rounds.length; j++) {
      var r = +rounds[j];
      if (r >= 1 && r <= 4 && okRounds.indexOf(r) < 0) okRounds.push(r);
    }
    items.push({
      name: it.name,
      price: it.price === undefined || it.price === null ? '' : String(it.price),
      limit: it.limit === undefined || it.limit === null ? '' : String(it.limit),
      image: typeof it.image === 'string' ? it.image : '',
      category: typeof it.category === 'string' ? it.category : '',
      rounds: okRounds
    });
  }

  // 全部校验通过才替换，避免坏数据冲掉旧好数据
  liveToday = {
    date: payload.startedAtBeijing.slice(0, 10),
    status: typeof payload.status === 'string' ? payload.status : '',
    round: +payload.round || 0,
    fetchedAt: typeof payload.fetchedAt === 'string' ? payload.fetchedAt : '',
    items: items
  };
  return true;
}

function clearLiveToday() {
  liveToday = null;
}

function getLiveToday() {
  return liveToday;
}

/** 价格文案：'3000' → '3,000'；'16w' → '16万' */
function formatPrice(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  var wan = /^(\d+(?:\.\d+)?)w$/i.exec(s);
  if (wan) return wan[1] + '万';
  if (/^\d+$/.test(s)) {
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return s;
}

/** 把 'HH:mm-HH:mm' 解析为 { startMin, endMin }，非法返回 null */
function parseWindow(w) {
  var m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(w);
  if (!m) return null;
  var startMin = (+m[1]) * 60 + (+m[2]);
  var endMin = (+m[3]) * 60 + (+m[4]);
  if (endMin <= startMin) return null;
  return { startMin: startMin, endMin: endMin };
}

/** 补零 */
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 秒 → 'HH:MM:SS' */
function fmtHMS(totalSec) {
  var t = Math.max(0, Math.floor(totalSec));
  return pad(Math.floor(t / 3600)) + ':' + pad(Math.floor((t % 3600) / 60)) + ':' + pad(t % 60);
}

/** 毫秒 → { d, h, m, s }（向下取整） */
function splitDuration(ms) {
  var total = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60
  };
}

/** 把倒计时对象拼成展示文案，如「1天03时05分」或「02时05分09秒」 */
function formatCountdown(cd) {
  if (cd.d > 0) {
    return cd.d + '天' + pad(cd.h) + '时' + pad(cd.m) + '分';
  }
  return pad(cd.h) + '时' + pad(cd.m) + '分' + pad(cd.s) + '秒';
}

/** 商人当天是否营业（08:00–24:00） */
function isOpenNow(now) {
  var minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= OPEN_MINUTE && minutes < CLOSE_MINUTE;
}

/** 距最近的营业时刻还有多久（营业中返回 null） */
function nextOpenDelta(now) {
  var minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  if (minutes < OPEN_MINUTE) {
    return (OPEN_MINUTE - minutes) * 60000;
  }
  // 已打烊 → 明早 08:00
  return (24 * 60 - minutes + OPEN_MINUTE) * 60000;
}

/**
 * 汇总当前状态。
 */
function getStatus(now) {
  now = now || new Date();
  var ts = now.getTime();
  var SESSIONS = state.sessions;

  var current = null;
  var next = null;
  for (var i = 0; i < SESSIONS.length; i++) {
    var s = SESSIONS[i];
    var start = parseTime(s.start).getTime();
    var end = parseTime(s.end).getTime();
    if (ts >= start && ts <= end) {
      current = s;
      next = SESSIONS[i + 1] || null;
      break;
    }
    if (ts < start) {
      next = s;
      break;
    }
  }

  var open = isOpenNow(now);
  var result = {
    open: open,
    current: current,
    next: next,
    phase: 'idle',
    countdownText: '',
    countdownLabel: '',
    subText: '',
    progressText: '',
    nowText: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
      ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
  };

  if (current) {
    result.phase = open ? 'open' : 'resting';
    var endTs = parseTime(current.end).getTime();
    var startTs = parseTime(current.start).getTime();
    var remainMs = endTs - ts;

    result.countdownLabel = open ? '距本档收摊还有' : '商人休息中，档期结束还有';
    result.countdownText = formatCountdown(splitDuration(remainMs));

    if (!open) {
      var openIn = formatCountdown(splitDuration(nextOpenDelta(now)));
      var openAt = now.getHours() < 8 ? '今天' : '明早';
      result.subText = openAt + ' 08:00 开门（还有 ' + openIn + '）';
    } else if (remainMs < 2 * 3600 * 1000) {
      result.subText = '快收摊了，想买抓紧！';
    } else {
      result.subText = '今日已上新，每天 08:00 补货';
    }

    var totalDays = Math.max(1, Math.round((endTs - startTs) / 86400000));
    var dayIndex = Math.min(totalDays, Math.floor((ts - startTs) / 86400000) + 1);
    result.progressText = '档期第 ' + dayIndex + ' / ' + totalDays + ' 天';
    return result;
  }

  if (next) {
    result.phase = 'idle';
    var nextStart = parseTime(next.start).getTime();
    result.countdownLabel = '距下次上新还有';
    result.countdownText = formatCountdown(splitDuration(nextStart - ts));
    var d = new Date(nextStart);
    var startText = (d.getMonth() + 1) + '月' + d.getDate() + '日';
    if (!open) {
      var openIn2 = formatCountdown(splitDuration(nextOpenDelta(now)));
      var openAt2 = now.getHours() < 8 ? '今天' : '明早';
      result.subText = '当前无档期，商人不在。' + openAt2 + ' 08:00 开门（还有 ' + openIn2 + '）';
    } else {
      result.subText = '当前无档期，商人不在。下一档 ' + startText + ' 04:00 开始';
    }
    return result;
  }

  // 所有档期已结束
  result.phase = 'past';
  result.countdownLabel = '全部档期已结束';
  result.countdownText = '—';
  result.subText = '等待官方公布新档期，下拉刷新试试';
  return result;
}

/**
 * 当日视图：优先用实时轮次数据（四轮真实商品），否则回退档期表推算。
 */
function getDayView(now, status) {
  now = now || new Date();
  status = status || getStatus(now);
  var view = {
    dateText: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()),
    hasSession: !!status.current,
    items: [],
    rounds: [],
    currentCount: 0,
    currentRound: 0,
    totalRounds: 0,
    liveActive: false, // 是否使用了实时轮次数据
    priceVisible: false
  };
  if (!status.current) return view;

  var nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  var nowMin = Math.floor(nowSec / 60);

  // —— 优先：实时轮次数据（日期匹配当天且有商品）——
  if (liveToday && liveToday.date === view.dateText && liveToday.items.length > 0) {
    return buildLiveView(view, nowSec, nowMin);
  }

  // —— 回退：档期表按时段分组 ——
  var todayKey = pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  var todays = [];
  var goods = status.current.goods || [];
  for (var i = 0; i < goods.length; i++) {
    var g = goods[i];
    if (g.extra) {
      var hit = false;
      for (var j = 0; j < g.extra.length; j++) {
        if (g.extra[j].date === todayKey) { hit = true; break; }
      }
      if (!hit) continue;
    }
    var win = g.window || '08:00-23:59';
    var pw = parseWindow(win);
    if (!pw) continue;
    todays.push({
      name: g.name,
      icon: ICON_MAP[g.name] || '🎁',
      window: win,
      windowText: win.replace('-', ' – '),
      key: g.name + '|' + win,
      startMin: pw.startMin,
      endMin: pw.endMin
    });
  }

  // 按时段分组 → 轮次
  var windows = [];
  var byWin = {};
  for (var k = 0; k < todays.length; k++) {
    var w = todays[k].window;
    if (!byWin[w]) { byWin[w] = []; windows.push(w); }
    byWin[w].push(todays[k]);
  }
  windows.sort(function (a, b) {
    return parseWindow(a).startMin - parseWindow(b).startMin;
  });

  view.totalRounds = windows.length;
  for (var r = 0; r < windows.length; r++) {
    var win2 = windows[r];
    var pw2 = parseWindow(win2);
    var st;
    if (nowMin >= pw2.endMin) st = 'ended';
    else if (nowMin >= pw2.startMin) st = 'active';
    else st = 'upcoming';

    var items2 = byWin[win2];
    for (var n = 0; n < items2.length; n++) {
      var it = items2[n];
      if (st === 'active') {
        it.stateText = '在售中';
        it.chipClass = 'chip-active';
        it.countdownText = fmtHMS(pw2.endMin * 60 - nowSec);
        view.currentCount++;
      } else if (st === 'upcoming') {
        it.stateText = '未开始';
        it.chipClass = 'chip-soon';
        it.countdownText = fmtHMS(pw2.startMin * 60 - nowSec);
      } else {
        it.stateText = '已结束';
        it.chipClass = 'chip-done';
        it.countdownText = '';
      }
    }
    view.rounds.push({
      index: r + 1,
      window: win2,
      state: st,
      stateText: st === 'active' ? '进行中' : (st === 'upcoming' ? '未开始' : '已结束'),
      items: items2
    });
    if (st === 'active' && !view.currentRound) view.currentRound = r + 1;
  }
  if (!view.currentRound) {
    for (var u = 0; u < view.rounds.length; u++) {
      if (view.rounds[u].state === 'upcoming') { view.currentRound = u + 1; break; }
    }
  }
  view.items = todays;
  return view;
}

/** 用实时轮次数据构建当日视图（四轮固定时段：08/12/16/20 点） */
function buildLiveView(view, nowSec, nowMin) {
  view.liveActive = true;
  var byRound = {};
  for (var i = 0; i < liveToday.items.length; i++) {
    var it = liveToday.items[i];
    var icon = ICON_MAP[it.name] || '🎁';
    for (var j = 0; j < it.rounds.length; j++) {
      var r = it.rounds[j];
      if (!byRound[r]) byRound[r] = [];
      byRound[r].push({
        name: it.name,
        icon: icon,
        image: it.image,
        price: formatPrice(it.price),
        limit: it.limit,
        category: it.category,
        window: ROUND_WINDOWS[r],
        windowText: ROUND_WINDOWS[r].replace('-', ' – '),
        key: it.name + '|r' + r,
        rounds: it.rounds.slice()
      });
    }
  }

  view.totalRounds = 4;
  for (var rr = 1; rr <= 4; rr++) {
    var items = byRound[rr] || [];
    var pw = parseWindow(ROUND_WINDOWS[rr]);
    var st;
    if (nowMin >= pw.endMin) st = 'ended';
    else if (nowMin >= pw.startMin) st = 'active';
    else st = 'upcoming';

    for (var m = 0; m < items.length; m++) {
      var it2 = items[m];
      if (st === 'active') {
        it2.stateText = '在售中';
        it2.chipClass = 'chip-active';
        it2.countdownText = fmtHMS(pw.endMin * 60 - nowSec);
        view.currentCount++;
      } else if (st === 'upcoming') {
        it2.stateText = '未开始';
        it2.chipClass = 'chip-soon';
        it2.countdownText = fmtHMS(pw.startMin * 60 - nowSec);
      } else {
        it2.stateText = '已结束';
        it2.chipClass = 'chip-done';
        it2.countdownText = '';
      }
    }

    view.rounds.push({
      index: rr,
      window: ROUND_WINDOWS[rr],
      state: st,
      stateText: st === 'active' ? '进行中' : (st === 'upcoming' ? '未开始' : '已结束'),
      items: items
    });
    if (st === 'active' && !view.currentRound) view.currentRound = rr;
  }

  // 当日全部商品（去重），带价格/限购/图标
  view.items = [];
  var seen = {};
  var hasPrice = false;
  for (var a = 0; a < liveToday.items.length; a++) {
    var src = liveToday.items[a];
    if (seen[src.name]) continue;
    seen[src.name] = true;
    if (src.price) hasPrice = true;
    view.items.push({
      name: src.name,
      icon: ICON_MAP[src.name] || '🎁',
      image: src.image,
      price: formatPrice(src.price),
      limit: src.limit,
      category: src.category,
      windowText: (src.rounds && src.rounds.length)
        ? src.rounds.map(function (r2) { return '第' + r2 + '轮'; }).join('、')
        : '',
      key: src.name
    });
  }
  view.priceVisible = hasPrice;
  return view;
}

/** 生成展示用档期列表：状态、日期文案、商品文案 */
function getSessionList(now) {
  now = now || new Date();
  var ts = now.getTime();
  var SESSIONS = state.sessions;
  var list = [];

  // 只展示最近 4 期 + 未来所有档期
  var firstShown = -1;
  for (var i = SESSIONS.length - 1; i >= 0; i--) {
    var endTs = parseTime(SESSIONS[i].end).getTime();
    if (endTs >= ts) {
      firstShown = Math.max(0, i - 3);
      break;
    }
  }
  if (firstShown < 0) firstShown = Math.max(0, SESSIONS.length - 4);

  for (var j = firstShown; j < SESSIONS.length; j++) {
    var s = SESSIONS[j];
    var start = parseTime(s.start);
    var end = parseTime(s.end);
    var stateTag;
    if (ts > end.getTime()) {
      stateTag = 'past';
    } else if (ts >= start.getTime()) {
      stateTag = 'active';
    } else {
      stateTag = 'future';
    }

    var startDay = (start.getMonth() + 1) + '月' + start.getDate() + '日';
    var endDay;
    if (start.getMonth() === end.getMonth()) {
      endDay = end.getDate() + '日';
    } else {
      endDay = (end.getMonth() + 1) + '月' + end.getDate() + '日';
    }

    var goodsText = '商品待更新';
    var hasCocoa = false;

    if (s.goods && s.goods.length > 0) {
      var parts = [];
      for (var k = 0; k < s.goods.length; k++) {
        var g = s.goods[k];
        if (g.name === '可可果球') hasCocoa = true;
        if (g.daily) {
          parts.push(g.name + '×' + g.daily + '/日');
        } else if (g.extra) {
          var extraParts = [];
          for (var m = 0; m < g.extra.length; m++) {
            var e = g.extra[m];
            extraParts.push(e.date.replace(/^0/, '') + '（' + e.count + '个）');
          }
          parts.push(g.name + ' 仅 ' + extraParts.join('、'));
        }
      }
      goodsText = parts.join('；');
    }

    list.push({
      state: stateTag,
      stateText: stateTag === 'active' ? '进行中' : (stateTag === 'future' ? '未开始' : '已结束'),
      dateText: startDay + ' – ' + endDay,
      goodsText: goodsText,
      hasCocoa: hasCocoa
    });
  }
  return list;
}

module.exports = {
  applyRemoteData: applyRemoteData,
  setSource: setSource,
  getMeta: getMeta,
  getSource: getSource,
  getBuiltinUpdatedAt: getBuiltinUpdatedAt,
  getStatus: getStatus,
  getDayView: getDayView,
  getSessionList: getSessionList,
  applyLiveToday: applyLiveToday,
  clearLiveToday: clearLiveToday,
  getLiveToday: getLiveToday,
  formatPrice: formatPrice
};
