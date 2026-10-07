#!/usr/bin/env node
/**
 * WIKI 详情全量重抓 v3：新增 性格推荐（natures）+ 种类（kind）+ 简介（wikiDesc）
 * 已含：stats/total/talents/skills/eggGroup/body
 * 数据源：wiki.biligame.com/nrc/<名>（MediaWiki API）
 * 产出：public/spirits-wiki.json（625键）
 * 断点续抓 + 1.4s 限速 + 20条一存
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
  while ((m = talentRe.exec(html)) !== null) talents.push({ name: m[2], p: m[3], desc: m[1] });
  if (talents.length) out.talents = talents;

  // 技能卡
  const positions = [];
  const cardRe = /<div class="roco-sk-card" data-source="([^"]*)"[^>]*data-type="([^"]*)" data-cat="([^"]*)" data-power="([^"]*)"/g;
  while ((m = cardRe.exec(html)) !== null) positions.push({ m, start: m.index });
  const skills = [];
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : Math.min(html.length, p.start + 8000);
    const seg = html.slice(p.start, end);
    const nameM = /<div class="roco-sk-name">([^<]+)<\/div>/.exec(seg);
    const lv = /<div class="roco-sk-lv">([^<]*)<\/div>/.exec(seg);
    const cost = /roco-sk-cost[\s\S]*?>(\d+)<\/span>/.exec(seg);
    const desc = /<div class="roco-sk-card-desc">([\s\S]*?)<\/div>/.exec(seg);
    skills.push({ source: p.m[1], type: p.m[2], cat: p.m[3], power: p.m[4], name: nameM ? nameM[1] : '?', cost: cost ? cost[1] : '', lv: lv ? lv[1].trim() : '', desc: desc ? desc[1].replace(/<[^>]+>/g, '').trim() : '' });
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

  const plain = html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
  const eggM = /蛋组：([^|<]+)/.exec(plain);
  if (eggM) out.eggGroup = eggM[1].trim();

  // 简介
  const descM = /<div class="roco-desc"><span class="roco-desc-dot"[^>]*><\/span><span>([^<]+)<\/span>/.exec(html);
  if (descM) out.wikiDesc = descM[1].trim();

  // 种类
  const kindM = /<div class="roco-kicker">([^<]+)<\/div>/.exec(html);
  if (kindM) out.kind = kindM[1].trim();

  // 性格推荐（pReference 面板内）
  const natures = [];
  const refRe = /<div class="roco-reference-name">([^<]+)<\/div><div class="roco-reference-detail">([^<]+)<\/div><\/div><\/div><div class="roco-reference-value">([^<]+)<\/div>/g;
  while ((m = refRe.exec(html)) !== null && natures.length < 8) {
    natures.push({ name: m[1], detail: m[2], pct: m[3] });
  }
  if (natures.length) out.natures = natures;

  // 图鉴课题（pQuest 面板：罗马数字+任务+奖励）
  var quests = [];
  var pq = html.indexOf('id="rocodex-pQuest"');
  if (pq > 0) {
    var pseg = html.slice(pq, pq + 16000);
    var pplain = pseg.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
    var romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    for (var ri = 0; ri < romans.length; ri++) {
      var rstart = pplain.indexOf('|' + romans[ri] + '|');
      if (rstart < 0) break;
      var rend = ri + 1 < romans.length ? pplain.indexOf('|' + romans[ri + 1] + '|', rstart) : pplain.indexOf('|图鉴记录|', rstart);
      if (rend < 0) rend = rstart + 400;
      var rchunk = pplain.slice(rstart, rend);
      var rparts = rchunk.split('|').filter(function (p) { return p && p !== romans[ri]; });
      if (rparts.length) {
        var text = rparts[0];
        var rest = rparts.slice(1);
        // 任务里"使用1次"后跟技能名——合并
        if (/使用\d+次$/.test(text) && rest.length) {
          text += rest.shift();
        }
        // 奖励数字对合并为 xN 格式
        var rewards = [];
        for (var rp = 0; rp < rest.length; rp++) {
          if (/^x?\d+$/.test(rest[rp])) {
            if (rp + 1 < rest.length && !/^x?\d+$/.test(rest[rp + 1]) && rest[rp + 1].indexOf('x') < 0) {
              rewards.push(rest[rp + 1] + ' ' + rest[rp].replace('x', 'x'));
              rp++;
            } else {
              rewards.push(rest[rp]);
            }
          }
        }
        quests.push({ no: romans[ri], text: text, rewards: rewards.join(' ').slice(0, 60) });
      }
    }
    // 截断到图鉴记录前
    if (quests.length) {
      var last = quests[quests.length - 1];
      var cut = last.rewards.indexOf('图鉴记录');
      if (cut > 0) last.rewards = last.rewards.slice(0, cut).trim();
    }
  }
  if (quests.length) out.quests = quests;

  return out;
}

async function main() {
  console.log('[1/3] 读取 spirits.json（v4，625卡）...');
  const spirits = JSON.parse(await readFile(join(ROOT, 'public', 'spirits.json'), 'utf8'));
  const names = [...new Set(spirits.spirits.map((s) => s.name))].filter(Boolean);
  console.log(`      ${names.length} 个唯一名`);

  let existing = {};
  try { existing = JSON.parse(await readFile(OUT, 'utf8')); } catch { }

  const todo = names.filter((n) => FORCE || !existing[n] || !(existing[n].natures || []).length);
  console.log(`[2/3] 待抓取 ${todo.length} 个（已缓存 ${names.length - todo.length}）...`);

  let done = 0;
  const failed = [];
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
      await sleep(4000);
    }
    await sleep(1400);
  }
  await writeFile(OUT, JSON.stringify(existing));

  console.log(`[3/3] 完成：成功 ${done}，失败 ${failed.length}`);
  if (failed.length) console.log('  失败:', failed.slice(0, 8).join(', '));
  console.log(`      ✓ public/spirits-wiki.json（${Object.keys(existing).length} 键）`);
}

main().catch((e) => { console.error('抓取失败:', e.message); process.exit(1); });
