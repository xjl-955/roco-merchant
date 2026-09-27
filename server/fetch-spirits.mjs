#!/usr/bin/env node
/**
 * 精灵图鉴数据抓取（v3 —— WIKI 官方分类体系）
 *
 * 数据源：
 *   1. onebiji 图鉴 data.php —— 基础数据（621只：编号/名称/阶段/属性/蛋组/图片）
 *   2. rocokingdomworld.org/zh/pokedex/ —— 增强（种族值/家族/slug）
 *   3. wiki.biligame.com/nrc/精灵图鉴 —— WIKI 官方分类维度（阶段/形态/赛季/异色）
 *
 * 分类维度（与 WIKI 图鉴页一致）：
 *   stageLabel: 一阶/二阶/三阶/首领
 *   form: 原始形态/地区形态/首领形态（main/regional/lord）
 *   season: S1/S2/S3/S4/未分类
 *   shiny: true/false
 *
 * 产出 public/spirits.json（formatVersion 3）
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

/** 解析 WIKI 图鉴卡（分类维度在 data- 属性里） */
function parseWikiCards(html) {
  const cards = [];
  // 预计算所有 npc-card 起点作为边界
  const starts = [];
  const pre = /<div class="npc-card"/g;
  let pm;
  while ((pm = pre.exec(html)) !== null) starts.push(pm.index);

  const re = /<div class="npc-card"([^>]*)>/g;
  let m, idx = 0;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const attr = (name) => {
      const am = new RegExp('data-' + name + '="([^"]*)"').exec(attrs);
      return am ? am[1] : '';
    };
    const aria = /aria-label="([^"]*)"/.exec(attrs);
    const end = idx + 1 < starts.length ? starts[idx + 1] : Math.min(html.length, m.index + 6000);
    const seg = html.slice(m.index, end);
    const nameM = /<div class="npc-name">([^<]+)<\/div>/.exec(seg);
    const imgM = /npc-art-normal"><img[^>]*src="([^"]+)"/.exec(seg);
    const stageTxt = /<div class="npc-stage">([^<]*)<\/div>/.exec(seg);

    // 名字：aria-label 优先（含形态全名，如"鸭吉吉（蓬松的样子）"）
    // npc-name 是简短名（"鸭吉吉"），形态卡会撞名导致覆盖
    const name = aria ? aria[1].replace(/^\d+\s*/, '').trim()
      : (nameM ? nameM[1].trim() : '');

    cards.push({
      id: attr('id'),
      number: attr('number'),
      stage: attr('stage'),           // 1/2/3/''（空=首领或特殊）
      form: attr('form'),             // main/regional/lord 及组合
      shiny: attr('shiny'),           // yes/no
      season: attr('season'),         // S1~S4/none
      types: attr('type').split('|').filter(Boolean),
      name: name,
      image: imgM ? imgM[1] : '',
      stageText: stageTxt ? stageTxt[1] : ''
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
  console.log(`      ${SPIRITS.length} 只基础精灵`);

  console.log('[2/4] 抓取 WIKI 图鉴（官方分类 625 卡）...');
  const wikiHtml = await get('https://wiki.biligame.com/nrc/%E7%B2%BE%E7%81%B5%E5%9B%BE%E9%89%B4');
  const wikiCards = parseWikiCards(wikiHtml);
  const byName = {};
  wikiCards.forEach((c) => { if (c.name) byName[norm(c.name)] = c; });
  console.log(`      ${wikiCards.length} 张 WIKI 卡`);

  // 参照站列表页（种族值 total 数据源）
  console.log('[2.5/4] 抓取参照站列表页（种族值）...');
  const totalByName = {};
  try {
    const rkwHtml = await get('https://rocokingdomworld.org/zh/pokedex/');
    const cellRe = /<div class="spirit-cell"([^>]*)>/g;
    let cm;
    while ((cm = cellRe.exec(rkwHtml)) !== null) {
      const attrs = cm[1];
      const titleM = /data-title="([^"]*)"/.exec(attrs);
      const totalM = /data-total="(\d+)"/.exec(attrs);
      if (titleM && totalM) {
        totalByName[norm(titleM[1])] = parseInt(totalM[1], 10);
      }
    }
    console.log(`      ${Object.keys(totalByName).length} 条种族值`);
  } catch (e) {
    console.warn('      ⚠ 参照站种族值抓取失败（不影响分类，仅缺 total）:', e.message);
  }

  console.log('[3/4] 合并（WIKI 分类为准）...');
  const spirits = [];
  let matched = 0;
  for (const s of SPIRITS) {
    let wc = byName[norm(s.name)];
    // 兜底：形态名（如"板板壳(本来的样子)"）在 WIKI 中可能就叫基础名"板板壳"
    if (!wc) {
      const baseName = norm(s.name).replace(/\([^)]*\)/, '');
      wc = byName[baseName];
    }
    // 兜底2：棋契陛下类——WIKI 名带"分支"后缀（"棋契陛下（白棋棋骑士分支）"）
    if (!wc) {
      const m2 = /^(.+?)\((.+?)\)$/.exec(norm(s.name));
      if (m2) {
        const stem = m2[1];
        const branch = m2[2];
        wc = byName[stem + '(' + branch + '分支)'] || null;
      }
    }
    // 兜底3：白子/黑子 → 按 编号+颜色 映射（WIKI 用分支名，基础图鉴用白子/黑子）
    if (!wc) {
      const m3 = /^(.+?)\((白|黑)子\)$/.exec(norm(s.name));
      if (m3) {
        const color = m3[2] === '白' ? '白' : '黑';
        const no = String(s.no).replace(/^NO\.?/, '');
        for (const c of wikiCards) {
          if (c.number === no && c.name.indexOf('棋契陛下') >= 0 && c.name.indexOf(color) >= 0) { wc = c; break; }
        }
      }
    }
    // 种族值（参照站 total，形态名去括号兜底）
    const total = totalByName[norm(s.name)] ||
                  totalByName[norm(s.name).replace(/\([^)]*\)/, '')] || 0;
    const out = {
      id: s.id,
      no: s.no,
      name: s.name,
      types: s.types || [],
      egg: s.egg || '未发现',
      ride: s.ride || '',
      shiny: s.shiny === 'yes',
      image: s.image || '',
      // WIKI 官方分类维度
      stage: wc ? wc.stage : '',
      form: wc ? wc.form : '',
      season: wc ? wc.season : 'none',
      stageText: wc ? wc.stageText : '',
      // 种族值总和
      total: total || 0
    };
    if (wc) {
      out.wikiImage = wc.image;
      matched++;
    }
    spirits.push(out);
  }
  console.log(`      WIKI 匹配 ${matched}/${spirits.length}`);
  if (matched < spirits.length * 0.9) throw new Error(`WIKI 匹配率过低（${matched}/${spirits.length}），中止`);

  console.log('[4/4] 写入 ...');
  const outDir = join(ROOT, 'public');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'spirits.json'), JSON.stringify({
    formatVersion: 3,
    generatedAt: new Date().toISOString(),
    meta: {
      updatedAt: new Date().toISOString().slice(0, 10),
      source: '洛克王国世界WIKI · 精灵图鉴（官方分类：阶段/形态/赛季/异色）'
    },
    types: TYPE_META,
    count: spirits.length,
    spirits
  }));
  console.log(`      ✓ public/spirits.json（${spirits.length} 只，formatVersion 3）`);
}

main().catch((e) => { console.error('抓取失败:', e.message); process.exit(1); });
