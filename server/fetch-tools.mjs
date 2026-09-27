#!/usr/bin/env node
/**
 * 图鉴 + 孵蛋数据抓取脚本
 *
 * 数据源（好游快爆工具箱，onebiji 镜像）：
 *   - 精灵图鉴: hykb_tools/lkwg/jltj/data.php  → RocoData.SPIRITS / TYPE_META / FILTERS
 *   - 孵蛋工具: hykb_tools/lkwg/dzfh/index.php → pokemonList / pokemonAttrList / pokemonGroupAttrs / nestRecommendList
 *
 * 产出（public/ 目录，供小程序远程拉取）：
 *   - spirits.json   精灵图鉴（编号/名称/阶段/属性/蛋组/图片）
 *   - breeding.json  蛋组表 + 属性表 + 巢穴摆法推荐
 *
 * 用法：node server/fetch-tools.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'Mozilla/5.0 (schedule sync for fan mini-program)' };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, retries = 3) {
  let lastErr;
  for (let a = 0; a <= retries; a++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.status === 429 || res.status === 567) throw new Error(`HTTP ${res.status} (rate limited)`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (a < retries) await sleep(2000 * 2 ** a);
    }
  }
  throw lastErr;
}

/** 从孵化页 HTML 中提取 var NAME = {...}; 的值（自动跳过空白） */
function extractVar(html, name) {
  const marker = 'var ' + name + ' =';
  const i = html.indexOf(marker);
  if (i < 0) return null;
  let bodyStart = i + marker.length;
  while (bodyStart < html.length && /\s/.test(html[bodyStart])) bodyStart++;
  const open = html[bodyStart];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = null, esc = false;
  for (let p = bodyStart; p < html.length; p++) {
    const c = html[p];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inStr) { if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(bodyStart, p + 1));
    }
  }
  return null;
}

async function main() {
  console.log('[1/4] 抓取精灵图鉴 data.php ...');
  const dexText = await get('https://www.onebiji.com/hykb_tools/lkwg/jltj/data.php');
  // data.php 是 JS 文件：window.RocoData = (function(){ ... return {...}; })();
  // 直接取三个 var 再拼装
  function extractFromJs(js, name) {
    const marker = 'var ' + name + ' =';
    const i = js.indexOf(marker);
    if (i < 0) throw new Error('未找到 ' + name);
    let bodyStart = i + marker.length;
    while (bodyStart < js.length && /\s/.test(js[bodyStart])) bodyStart++; // 跳过空白，定位真正的起始括号
    const open = js[bodyStart];
    if (open !== '{' && open !== '[') throw new Error(name + ' 起始符异常: ' + JSON.stringify(open));
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
  const SPIRITS = extractFromJs(dexText, 'SPIRITS');
  const TYPE_META = extractFromJs(dexText, 'TYPE_META');
  console.log(`      ${SPIRITS.length} 只精灵, ${Object.keys(TYPE_META).length} 种属性`);

  console.log('[2/4] 抓取孵蛋工具页 ...');
  const breedHtml = await get('https://www.onebiji.com/hykb_tools/lkwg/dzfh/index.php?immgj=0');
  const pokemonList = extractFromJs(breedHtml, 'pokemonList');
  const pokemonGroupAttrs = extractFromJs(breedHtml, 'pokemonGroupAttrs');
  const nestRecommendList = extractFromJs(breedHtml, 'nestRecommendList');
  console.log(`      ${Object.keys(pokemonList).length} 条蛋组记录, ${nestRecommendList.length} 条摆法推荐`);

  console.log('[3/4] 规整化 ...');
  // 精灵图鉴规整化
  const spirits = SPIRITS.map((s) => ({
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
  }));

  // 蛋组记录规整化（pokemonList 键为 _1/_3/...）
  const eggs = {};
  for (const k of Object.keys(pokemonList)) {
    const p = pokemonList[k];
    eggs[p.name] = {
      no: p.no,
      attrs: p.attrs || [],
      groups: (p.groups || []).map((g) => pokemonGroupAttrs[g] || '未知组'),
      size: p.size || '',
      weight: p.weight || '',
      image: p.img ? (p.img.startsWith('//') ? 'https:' + p.img : p.img) : ''
    };
  }

  // 属性表
  const attrs = {};
  for (const k of Object.keys(TYPE_META)) {
    attrs[k] = { color: TYPE_META[k].color, icon: TYPE_META[k].icon || '' };
  }

  // 巢穴摆法推荐
  const nests = (nestRecommendList || []).map((n) => ({
    title: n.title,
    image: n.image || '',
    tag: n.tag || ''
  }));

  const spiritsPayload = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    meta: { updatedAt: new Date().toISOString().slice(0, 10), source: '好游快爆工具箱 · 精灵图鉴库' },
    types: attrs,
    count: spirits.length,
    spirits
  };

  const breedingPayload = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    meta: { updatedAt: new Date().toISOString().slice(0, 10), source: '好游快爆工具箱 · 孵蛋工具' },
    groupNames: pokemonGroupAttrs,
    eggs: eggs,
    nests: nests
  };

  console.log('[4/4] 写入 public/ ...');
  const outDir = join(ROOT, 'public');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'spirits.json'), JSON.stringify(spiritsPayload), 'utf8');
  await writeFile(join(outDir, 'breeding.json'), JSON.stringify(breedingPayload), 'utf8');
  console.log(`      ✓ public/spirits.json (${spirits.length} 只)`);
  console.log(`      ✓ public/breeding.json (${Object.keys(eggs).length} 条蛋组, ${nests.length} 摆法)`);
}

main().catch((e) => {
  console.error('抓取失败:', e.message);
  process.exit(1);
});
