#!/usr/bin/env node
/**
 * 实时轮次数据自建抓取（路A）
 *
 * 数据源：好游快爆工具箱的远行商人页面（onebiji 镜像，与官方数据同源）
 *   https://www.onebiji.com/hykb_tools/comm/lkwgmerchant/preview.php?id=1&immgj=0
 * 页面结构：
 *   <li class="... show_N ..." data-time="..." onclick="showShopinfo('图','名','类','描述')">
 *     <em>限购100</em>  <em class="shop_price">价格：3000</em>
 *   show_N = 商品出现在第 N 轮（每日四轮：08/12/16/20 点）
 *
 * 产出 public/live.json（与 schedule.json 等同目录），供小程序 utils/live.js 拉取。
 * 适合 GitHub Actions 定时执行（每天 08:10/12:10/16:10/20:10 四次，赶在每轮开售同时更新）。
 *
 * 用法：node server/fetch-live.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = 'https://www.onebiji.com/hykb_tools/comm/lkwgmerchant/preview.php?id=1&immgj=0';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function unescapeAttr(s) {
  return s.replace(/\\'/g, "'").replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
}

function normalizeImg(s) {
  var v = unescapeAttr(s);
  if (v.indexOf('//') === 0) return 'https:' + v;
  return v;
}

function extractRounds(classAttr) {
  var rounds = [];
  for (var n = 1; n <= 4; n++) {
    if (classAttr.indexOf('show_' + n) >= 0) rounds.push(n);
  }
  return rounds;
}

function parsePage(html) {
  var items = {};
  var liRe = /<li class="([^"]*show_\d[^"]*)"[^>]*data-time="(\d+)"[^>]*onclick="showShopinfo\('([^']*)','([^']*)','([^']*)','([^']*)'\)"/g;
  var m;
  while ((m = liRe.exec(html)) !== null) {
    var rounds = extractRounds(m[1]);
    var name = unescapeAttr(m[4]);
    if (!name || rounds.length === 0) continue;
    if (items[name]) {
      // 同名商品多段 li：合并轮次
      for (var r of rounds) {
        if (items[name].rounds.indexOf(r) < 0) items[name].rounds.push(r);
      }
      continue;
    }
    items[name] = {
      name: name,
      image: normalizeImg(m[3]),
      category: unescapeAttr(m[5]),
      description: unescapeAttr(m[6]),
      rounds: rounds,
      limit: '',
      price: ''
    };
  }
  if (Object.keys(items).length === 0) throw new Error('未解析到任何商品，页面结构可能已变化');

  // 二次扫描：补价格与限购
  // 注意：限购 <em> 在 shop_name 之前（图块里），价格在其后。
  // 所以限购要往前找：从上一个商品块结束到本商品 shop_name 之间的区间。
  var nameIdx = [];
  var nmRe = /<em class="shop_name">([^<]+)<\/em>/g;
  var nm;
  while ((nm = nmRe.exec(html)) !== null) {
    nameIdx.push({ name: nm[1].trim(), start: nm.index });
  }
  for (var i = 0; i < nameIdx.length; i++) {
    var cur = nameIdx[i];
    var end = i + 1 < nameIdx.length ? nameIdx[i + 1].start : html.length;
    var blockAfter = html.slice(cur.start, end);
    var blockBefore = i > 0 ? html.slice(nameIdx[i - 1].start, cur.start) : html.slice(0, cur.start);
    if (!items[cur.name]) continue;
    if (!items[cur.name].price) {
      var pm = /<em class="shop_price">价格：\s*([\d,.]+w?)/.exec(blockAfter);
      if (pm) items[cur.name].price = pm[1].replace(/,/g, '');
    }
    if (!items[cur.name].limit) {
      // 限购优先从"本商品的 li 起点到 shop_name"这段往前找（即本 li 图块内）
      // li 起点 = blockBefore 中最后一个 '<li class="all_show'
      var liStart = blockBefore.lastIndexOf('<li class="all_show');
      var ownBlock = liStart >= 0 ? blockBefore.slice(liStart) + blockAfter : blockAfter;
      var lm = /限购\s*(\d+)/.exec(ownBlock);
      if (lm) items[cur.name].limit = lm[1];
    }
  }

  return Object.keys(items).map(function (k) { return items[k]; });
}

/** 计算当前北京时间轮次窗口（服务在 UTC，需要换算） */
function beijingNow() {
  var now = new Date();
  return new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
}

function beijingString(d) {
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

async function main() {
  console.log('[1/3] 抓取快爆源页面 ...');
  var res = await fetch(SRC, { headers: UA });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  var html = await res.text();

  console.log('[2/3] 解析商品与轮次 ...');
  var items = parsePage(html);
  var withPrice = items.filter(function (i) { return i.price; }).length;
  console.log(`      ${items.length} 种商品（${withPrice} 条含价格）`);

  var bj = beijingNow();
  var bjStr = beijingString(bj);
  var hour = bj.getHours();
  var round = hour >= 8 && hour < 12 ? 1 : hour >= 12 && hour < 16 ? 2 : hour >= 16 && hour < 20 ? 3 : hour >= 20 ? 4 : 0;

  // 下次刷新时间
  var nextHours = [8, 12, 16, 20];
  var nextH = nextHours.find(function (h) { return h > hour; });
  var next = nextH !== undefined
    ? bjStr.slice(0, 10) + ' ' + (nextH < 10 ? '0' + nextH : nextH) + ':00:00'
    : bjStr.slice(0, 10) + ' 24:00:00';

  var payload = {
    formatVersion: 1,
    source: '好游快爆工具箱 · 远行商人查询器',
    fetchedAt: new Date().toISOString(),
    timezone: 'Asia/Shanghai',
    date: bjStr.slice(0, 10),
    status: round > 0 ? 'open' : 'closed',
    round: round,
    startedAtBeijing: bjStr.slice(0, 10) + ' ' +
      (round === 1 ? '08' : round === 2 ? '12' : round === 3 ? '16' : round === 4 ? '20' : '00') + ':00:00',
    nextRefreshBeijing: next,
    durationHours: 4,
    items: items,
    rounds: {}
  };

  // 保留日期校验字段（小程序端会核对日期）
  if (!TIME_RE.test(payload.startedAtBeijing)) throw new Error('时间格式异常: ' + payload.startedAtBeijing);

  console.log('[3/3] 写入 public/live.json ...');
  var outPath = join(ROOT, 'public', 'live.json');
  var existing = null;
  try { existing = JSON.parse(await readFile(outPath, 'utf8')); } catch { /* 首次 */ }

  // 增量防回退：新抓取结果为空但旧数据是今天的 → 保留旧数据
  if (items.length === 0 && existing && existing.date === payload.date) {
    console.log('      ⚠ 本次抓取为空，保留今天的既有数据');
    payload = existing;
  }

  await writeFile(outPath, JSON.stringify(payload), 'utf8');
  console.log('      ✓ public/live.json | round=' + payload.round, '| items=' + payload.items.length);
}

main().catch(function (e) {
  console.error('抓取失败:', e.message);
  process.exit(1);
});
