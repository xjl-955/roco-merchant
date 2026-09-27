#!/usr/bin/env node
/**
 * 远行商人档期抓取脚本
 * 从洛克王国世界WIKI（MediaWiki API）抓取「远行商人上新!」全部档案，
 * 解析出档期时间与商品，生成 public/schedule.json 供小程序远程拉取。
 *
 * 数据来源：https://wiki.biligame.com/nrc/（CC BY-NC-SA 4.0）
 * 用法：node server/fetch-schedule.mjs
 * 适合放在 GitHub Actions 等定时任务中每天执行。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://wiki.biligame.com/nrc/api.php';
const UA = { 'User-Agent': 'roco-schedule-fetcher/1.0 (schedule sync for fan mini-program)' };
const PREFIX = '远行商人上新!';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 带重试的 JSON 请求：失败按指数退避重试，应对 WIKI 偶发限流（HTTP 567 等） */
async function getJSON(url, retries = 3) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.status === 429 || res.status === 567) {
        throw new Error(`HTTP ${res.status} (rate limited)`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        const wait = 2000 * Math.pow(2, attempt); // 2s → 4s → 8s
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

/** 列出「远行商人上新!」前缀下的全部页面标题（处理分页续传） */
async function listPages() {
  const titles = [];
  let apcontinue = undefined;
  do {
    let url = `${API}?action=query&list=allpages&apprefix=${encodeURIComponent(PREFIX)}&format=json&aplimit=max`;
    if (apcontinue) url += '&apcontinue=' + encodeURIComponent(apcontinue);
    const data = await getJSON(url);
    const pages = (data.query && data.query.allpages) || [];
    for (const p of pages) titles.push(p.title);
    apcontinue = data.continue && data.continue.apcontinue;
  } while (apcontinue);
  return titles;
}

/** 抓取单页渲染 HTML */
async function fetchPageHTML(title) {
  const url = `${API}?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json`;
  const data = await getJSON(url);
  const parse = data.parse || {};
  const text = parse.text || {};
  return text['*'] || text || '';
}

/** 提取页面中所有 "YYYY-MM-DD HH:mm — YYYY-MM-DD HH:mm" 区间 */
function extractRanges(html) {
  const ranges = [];
  const re = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*—\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    ranges.push({ start: m[1], end: m[2] });
  }
  return ranges;
}

/** 去掉 HTML 标签得到纯文本 */
function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#10;/g, ' ');
}

/** 从「参与玩法」段落解析商品列表 */
function extractGoods(html) {
  const plain = stripTags(html).replace(/\s+/g, ' ');
  const sec = plain.split('参与玩法');
  if (sec.length < 2) return [];
  const goodsText = sec[1].split('特别提示')[0];

  const goods = [];

  // 规则A：每日上架 N 个「X」「Y」…（支持多个球名并列）
  const reDaily = /每日上架\s*(\d+)\s*个\s*((?:「[^」]+」[、]?)+)/g;
  let m;
  while ((m = reDaily.exec(goodsText)) !== null) {
    const names = m[2].match(/「([^」]+)」/g) || [];
    for (const wrapped of names) {
      goods.push({ name: wrapped.slice(1, -1), daily: parseInt(m[1], 10) });
    }
  }

  // 规则B：X月Y日、Z月W日……分别上架a个、b个……「V」
  const reExtra = /((?:\d{1,2}月\d{1,2}日、?)+)[^。]*?分别上架((?:\d+个、?)+)「([^」]+)」/;
  const me = reExtra.exec(goodsText);
  if (me) {
    const dates = me[1].split('、').filter(Boolean);
    const counts = me[2].split('、').filter(Boolean).map((s) => parseInt(s, 10));
    const extra = [];
    for (let i = 0; i < Math.min(dates.length, counts.length); i++) {
      const dm = /(\d{1,2})月(\d{1,2})日/.exec(dates[i]);
      if (dm) {
        const mm = dm[1].padStart(2, '0');
        const dd = dm[2].padStart(2, '0');
        extra.push({ date: `${mm}-${dd}`, count: counts[i] });
      }
    }
    if (extra.length) goods.push({ name: me[3], extra });
  }

  // 规则C：句内出现上架时段（如 20:00-23:59）时，为该句提到的商品附加 window
  const sentences = goodsText.split(/[。！]/);
  for (const st of sentences) {
    const wm = /(\d{1,2}:\d{2})\s*[-–—~]\s*(\d{1,2}:\d{2})/.exec(st);
    if (!wm) continue;
    const namesInSentence = [...st.matchAll(/「([^」]+)」/g)].map((x) => x[1]);
    if (namesInSentence.length === 0) continue;
    const window = `${wm[1]}-${wm[2]}`;
    for (const g of goods) {
      if (namesInSentence.includes(g.name) && !g.window) g.window = window;
    }
  }

  return goods;
}

const TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

async function main() {
  console.log('[1/5] 读取既有数据（用于合并，防止部分失败导致数据回退）...');
  let previous = { sessions: [] };
  try {
    const { readFile } = await import('node:fs/promises');
    const prevRaw = await readFile(join(ROOT, 'public', 'schedule.json'), 'utf8');
    const parsed = JSON.parse(prevRaw);
    if (parsed && Array.isArray(parsed.sessions)) previous = parsed;
    console.log(`      既有数据 ${previous.sessions.length} 个档期`);
  } catch {
    console.log('      无既有数据，全新生成');
  }
  const prevByKey = new Map(
    previous.sessions.map((s) => [s.start + '|' + s.end, s])
  );

  console.log('[2/5] 列出档案页面...');
  const titles = await listPages();
  if (titles.length === 0) throw new Error('未找到任何档案页面，WIKI 结构可能已变化');
  console.log(`      共 ${titles.length} 页`);

  console.log('[3/5] 逐页抓取并解析（每页间隔 1.2s 防限流）...');
  const byKey = new Map(); // key: start|end -> session
  let failCount = 0;
  for (const title of titles) {
    await sleep(1200);
    try {
      const html = await fetchPageHTML(title);
      const ranges = extractRanges(html);
      if (ranges.length === 0) {
        console.warn(`      ⚠ ${title}: 未找到时间区间，跳过`);
        continue;
      }
      // 页面自身的档期 = 最后一个区间（前面是导航目录）
      const own = ranges[ranges.length - 1];
      if (!TIME_RE.test(own.start) || !TIME_RE.test(own.end)) {
        console.warn(`      ⚠ ${title}: 时间格式异常，跳过`);
        continue;
      }
      const key = own.start + '|' + own.end;
      if (!byKey.has(key)) {
        // 新档期先继承既有数据（若有），抓到新明细后覆盖
        const prev = prevByKey.get(key);
        byKey.set(key, { start: own.start, end: own.end, goods: prev ? prev.goods : [] });
      }
      const session = byKey.get(key);
      const goods = extractGoods(html);
      if (goods.length > 0) {
        session.goods = goods;
      }
    } catch (e) {
      failCount++;
      console.warn(`      ⚠ ${title}: 抓取失败（${e.message}），跳过`);
    }
  }

  console.log('[4/5] 合并既有数据...');
  // 既有数据中本次未抓到的档期（如被限流跳过的）原样保留，永不回退
  let inherited = 0;
  for (const [key, prevSession] of prevByKey) {
    if (!byKey.has(key)) {
      byKey.set(key, prevSession);
      inherited++;
    }
  }
  if (inherited > 0) console.log(`      从既有数据继承 ${inherited} 个未抓到的档期`);

  // 失败过多说明被持续限流，宁可失败退出（Actions 会重试/红叉提醒）也不要产出残缺数据
  if (failCount > 0 && failCount >= titles.length * 0.5) {
    throw new Error(`超过半数页面抓取失败（${failCount}/${titles.length}），可能被限流，中止本次生成`);
  }

  if (byKey.size === 0) throw new Error('所有页面均解析失败');

  console.log('[5/5] 汇总排序并写入...');
  const sessions = Array.from(byKey.values()).sort(
    (a, b) => new Date(a.start.replace(/-/g, '/')) - new Date(b.start.replace(/-/g, '/'))
  );
  const withGoods = sessions.filter((s) => s.goods.length > 0).length;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const payload = {
    formatVersion: 1,
    generatedAt: now.toISOString(),
    meta: {
      updatedAt: today,
      businessHours: '每日 08:00 – 24:00（北京时间）',
      source: '洛克王国世界WIKI · 远行商人上新档案'
    },
    sessions
  };

  console.log(`      共 ${sessions.length} 个档期，其中 ${withGoods} 个含商品明细`);
  console.log('[4/4] 写入 public/schedule.json ...');
  const outPath = join(ROOT, 'public', 'schedule.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`      ✓ ${outPath}`);
  console.log(`最近一期: ${sessions[sessions.length - 1].start} ~ ${sessions[sessions.length - 1].end}`);
}

main().catch((e) => {
  console.error('抓取失败:', e.message);
  process.exit(1);
});
