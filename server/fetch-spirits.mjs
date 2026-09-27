#!/usr/bin/env node
/**
 * 精灵图鉴数据抓取（增强版：含种族值/进化家族/详情 slug）
 *
 * 数据源：
 *   1. onebiji 图鉴 data.php —— 基础数据（621只：编号/名称/阶段/属性/蛋组/图片）
 *   2. rocokingdomworld.org/zh/pokedex/ —— 增强（种族值 total / 进化家族 / 详情页 slug）
 *
 * 产出 public/spirits.json（小程序图鉴 + 详情页共用）。
 * 数据月度级稳定；想更新时手动跑一次。
 *
 * 用法：node server/fetch-spirits.mjs
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, retries = 2) {
  let lastErr;
  for (let a = 0; a <= retries; a++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.status === 429 || res.status === 567) throw new Error('HTTP ' + res.status);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (a < retries) await sleep(3000 * 2 ** a);
    }
  }
  throw lastErr;
}

function extractFromJs(js, name) {
  const marker = 'var ' + name + ' =';
  const i = js.indexOf(marker);
  if (i < 0) throw new Error('未找到 ' + name);
  let bodyStart = i + marker.length;
  while (bodyStart < js.length && /\s/.test(js[bodyStart])) bodyStart++;
  const open = js[bodyStart];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = null, esc = false;
  for (let p = bodyStart; p < js.length; p++) {
    const c = js[p];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inStr) { if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(js.slice(bodyStart, p + 1));
    }
  }
  throw new Error(name + ' 解析失败');
}

function norm(name) {
  return String(name)
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/\s+/g, '')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .trim();
}

/** 从列表页解析 644 张卡（slug/total/family），链接在 cell 内部，边界用下一 cell */
function parseCards(html) {
  const cellStarts = [];
  const pre = /<div class="spirit-cell"/g;
  let pm;
  while ((pm = pre.exec(html)) !== null) cellStarts.push(pm.index);

  const cards = [];
  const cellRe = /<div class="spirit-cell"([^>]*)>/g;
  let cm, idx = 0;
  while ((cm = cellRe.exec(html)) !== null) {
    const attrs = cm[1];
    const attr = (name) => {
      const am = new RegExp('data-' + name + '="([^"]*)"').exec(attrs);
      return am ? am[1] : '';
    };
    const end = idx + 1 < cellStarts.length ? cellStarts[idx + 1] : html.length;
    const after = html.slice(cm.index, end);
    const am = /<a href="\/zh\/pokedex\/([a-z0-9-]+)" class="group block"/.exec(after);
    cards.push({
      slug: am ? am[1] : '',
      name: attr('title'),
      total: parseInt(attr('total'), 10) || 0,
      family: attr('family')
    });
    idx++;
  }
  return cards;
}

async function main() {
  console.log('[1/4] 抓取基础图鉴 data.php ...');
  const dexText = await get('https://www.onebiji.com/hykb_tools/lkwg/jltj/data.php');
  const SPIRITS = extractFromJs(dexText, 'SPIRITS');
  const TYPE_META = extractFromJs(dexText, 'TYPE_META');
  console.log(`      ${SPIRITS.length} 只精灵, ${Object.keys(TYPE_META).length} 种属性`);

  console.log('[2/4] 抓取增强列表页（种族值/家族/slug）...');
  const listHtml = await get('https://rocokingdomworld.org/zh/pokedex/');
  const cards = parseCards(listHtml);
  const withSlug = cards.filter((c) => c.slug).length;
  console.log(`      ${cards.length} 张卡片（${withSlug} 条含 slug）`);

  console.log('[3/4] 合并 ...');
  const byName = {};
  cards.forEach((c) => { if (c.slug) byName[norm(c.name)] = c; });

  let merged = 0;
  const spirits = SPIRITS.map((s) => {
    const out = {
      id: s.id,
      no: s.no,
      name: s.name,
      stage: s.stage,
      stageLabel: s.stageLabel,
      types: s.types || [],
      egg: s.egg || '未发现',
      ride: s.ride || '',
      shiny: s.shiny === 'yes',
      image: s.image || ''
    };
    // 两轮匹配：先精确（归一化），再形态变体去括号挂到基础形态
    let c = byName[norm(s.name)];
    if (!c) {
      const baseName = norm(s.name).replace(/\([^)]*\)/, '');
      c = byName[baseName];
    }
    if (c) {
      out.slug = c.slug;
      out.total = c.total;
      out.family = c.family;
      merged++;
    }
    return out;
  });
  console.log(`      合并 ${merged}/${spirits.length}`);
  if (merged < spirits.length * 0.9) throw new Error(`合并率过低（${merged}/${spirits.length}），中止`);

  console.log('[4/4] 写入 ...');
  const outDir = join(ROOT, 'public');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'spirits.json'), JSON.stringify({
    formatVersion: 2,
    generatedAt: new Date().toISOString(),
    meta: { updatedAt: new Date().toISOString().slice(0, 10), source: 'rocokingdomworld.org 图鉴（含种族值/进化家族/详情slug）' },
    types: TYPE_META,
    count: spirits.length,
    spirits
  }));
  console.log(`      ✓ public/spirits.json（${spirits.length} 只，formatVersion 2）`);
}

main().catch((e) => {
  console.error('抓取失败:', e.message);
  process.exit(1);
});
