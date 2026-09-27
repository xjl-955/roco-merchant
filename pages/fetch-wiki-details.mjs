#!/usr/bin/env node
/**
 * WIKI 精灵详情批量抓取（v2 —— 以 WIKI 为数据源）
 *
 * 数据源：wiki.biligame.com/nrc/<精灵名>（MediaWiki API 渲染 HTML）
 * 字段：
 *   stats     六项种族值（HP/ATK/MATK/DEF/MDEF/SPD）
 *   total     种族值总和
 *   talents   特长概率 [{name, p, desc}]
 *   skills    技能卡（source: level/blood/machine）
 *   body      身高体重
 *   star      星光值 / money 洛克贝
 *   eggGroup  蛋组
 *   evo       进化链文本
 *
 * 断点续抓 + 限速 1.2s/页 + 失败重试。产出 public/spirits-wiki.json
 * 用法：node server/fetch-wiki-details.mjs [--force] [--limit=N]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://wiki.biligame.com/nrc/api.php?action=parse&prop=text&format=json&page=';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'spirits-wiki.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FORCE = process.argv.includes('--force');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

/** 用 WIKI 名字（精灵页标题）抓取 */
async function fetchWikiDetail(title) {
  const res = await fetch(API + encodeURIComponent(title), { headers: UA });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (data.error) throw new Error('api:' + data.error.code);
  const html = data.parse.text['*'] || data.parse.text;

  const out = {};

  // 种族值
  const stats = {};
  const statRe = /data-rune="(HP|ATK|MATK|DEF|MDEF|SPD)"[\s\S]*?data-val="(\d+)"/g;
  let m;
  while ((m = statRe.exec(html)) !== null) stats[m[1]] = +m[2];
  if (Object.keys(stats).length) out.stats = stats;
  const tot = /roco-race-total" data-val="(\d+)"/.exec(html);
  if (tot) out.total = +tot[1];

  // 特长概率
  const talents = [];
  const talentRe = /<span class="roco-talent" title="([^"]*)"><span class="roco-talent-name">([^<]*)<\/span><span class="roco-talent-pct">([^<]*)<\/span>/g;
  while ((m = talentRe.exec(html)) !== null) {
    talents.push({ name: m[2], p: m[3], desc: m[1] });
  }
  if (talents.length) out.talents = talents;

  // 技能卡（窄窗口逐卡解析）
  const positions = [];
  const cardRe = /<div class="roco-sk-card" data-source="([^"]*)"[^>]*data-type="([^"]*)" data-cat="([^"]*)" data-power="([^"]*)"/g;
  while ((m = cardRe.exec(html)) !== null) {
    positions.push({ m: m, start: m.index });
  }
  const skills = [];
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : Math.min(html.length, p.start + 8000);
    const seg = html.slice(p.start, end);
    const name = /<div class="roco-sk-name">([^<]+)<\/div>/.exec(seg);
    const lv = /<div class="roco-sk-lv">([^<]*)<\/div>/.exec(seg);
    const cost = /roco-sk-cost[\s\S]*?>(\d+)<\/span>/.exec(seg);
    const desc = /<div class="roco-sk-card-desc">([\s\S]*?)<\/div>/.exec(seg);
    skills.push({
      source: p.m[1], type: p.m[2], cat: p.m[3], power: p.m[4],
      name: name ? name[1] : '?', cost: cost ? cost[1] : '',
      lv: lv ? lv[1].trim() : '',
      desc: desc ? desc[1].replace(/<[^>]+>/g, '').trim() : ''
    });
  }
  if (skills.length) out.skills = skills;

  // 身高体重
  const pills = {};
  const pillRe = /<span class="roco-pill[^"]*"><span class="roco-pill-ico"><img alt="([^"]+)"[\s\S]*?<\/span>([\s\S]*?)<span class="roco-pill-unit">([^<]*)<\/span>/g;
  while ((m = pillRe.exec(html)) !== null) {
    const val = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    if (!pills[m[1]]) pills[m[1]] = val + m[3];
  }
  if (pills['身高'] || pills['体重']) out.body = { h: pills['身高'] || '', w: pills['体重'] || '' };

  // 星光值/洛克贝
  const star = /alt="星光值"[\s\S]*?<\/span>\|?(\d+)/.exec(html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|'));
  // 简化：在纯文本里找
  const plain = html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
  const starM = /星光值\|(\d+)/.exec(plain);
  if (starM) out.star = +starM[1];
  const moneyM = /洛克贝\|(\d+)/.exec(plain);
  if (moneyM) out.money = +moneyM[1];

  // 蛋组
  const eggM = /蛋组：([^|<]+)/.exec(plain);
  if (eggM) out.eggGroup = eggM[1].trim();

  // 进化链（pEvo 面板纯文本）
  const pe = html.indexOf('id="rocodex-pEvo"');
  if (pe > 0) {
    const seg = html.slice(pe, pe + 8000).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
    const evoM = /进化分支([\s\S]{10,600}?)(?:数据库更新时间|$)/.exec(seg);
    if (evoM) out.evo = evoM[1].trim().slice(0, 400);
  }

  return out;
}

async function main() {
  console.log('[1/3] 读取 spirits.json（取 WIKI 页面名）...');
  const spirits = JSON.parse(await readFile(join(ROOT, 'public', 'spirits.json'), 'utf8'));
  // WIKI 页面名 = 精灵名（refresh 数据里 name 就是 WIKI 标题）
  const names = [...new Set(spirits.spirits.map((s) => s.name))].filter(Boolean);
  console.log(`      ${names.length} 个精灵名`);

  let existing = {};
  try { existing = JSON.parse(await readFile(OUT, 'utf8')); } catch { }

  const todo = names.filter((n) => FORCE || !existing[n]);
  console.log(`[2/3] 待抓取 ${todo.length} 个（已缓存 ${names.length - todo.length}）...`);

  let done = 0, failed = [];
  for (const name of todo) {
    if (done >= LIMIT) break;
    try {
      existing[name] = await fetchWikiDetail(name);
      done++;
      if (done % 20 === 0) {
        console.log(`      进度 ${done}/${todo.length}`);
        await writeFile(OUT, JSON.stringify(existing));
      }
    } catch (e) {
      failed.push(name + '(' + e.message + ')');
    }
    await sleep(1200);
  }
  await writeFile(OUT, JSON.stringify(existing));

  console.log(`[3/3] 完成：成功 ${done}，失败 ${failed.length}`);
  if (failed.length) console.log('  失败:', failed.slice(0, 10).join(', '), failed.length > 10 ? '...' : '');
  console.log(`      ✓ public/spirits-wiki.json（共 ${Object.keys(existing).length} 条）`);
}

main().catch((e) => { console.error('抓取失败:', e.message); process.exit(1); });
