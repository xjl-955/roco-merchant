#!/usr/bin/env node
/**
 * 精灵详情批量抓取（种族值分项/特长/技能表/简介）
 *
 * 数据源：rocokingdomworld.org/zh/pokedex/<slug>/（服务端渲染 HTML）
 * 需要 spirits.json 里的 slug 列表（先跑 fetch-spirits.mjs）。
 *
 * 产出 public/spirits-detail.json：
 *   { [name]: { hp, atk, satk, def, sdef, spd, traits: [{name,p}], skills: {level:[], blood:[], stone:[]}, desc } }
 *
 * 抓取礼仪：每页间隔 1s，失败重试 2 次；断点续抓（已有的跳过，可用 --force 全量重抓）
 * 用法：node server/fetch-details.mjs [--force] [--limit=N]
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'spirits-detail.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FORCE = process.argv.includes('--force');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 解析种族值六项 */
function parseStats(html) {
  const out = { hp: 0, atk: 0, satk: 0, def: 0, sdef: 0, spd: 0 };
  const map = { HP: 'hp', ATK: 'atk', 'M.ATK': 'satk', DEF: 'def', 'M.DEF': 'sdef', SPD: 'spd' };
  // 每项形如：<div class="w-16 ...">HP</div> ... <div class="w-10 ...">120</div>
  const re = /<div class="w-16[^"]*">(HP|ATK|M\.ATK|DEF|M\.DEF|SPD)<\/div>[\s\S]*?<div class="w-10[^"]*">(\d+)<\/div>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const key = map[m[1]];
    if (key) out[key] = parseInt(m[2], 10);
  }
  return out;
}

/** 解析特长概率表 */
function parseTraits(html) {
  const i = html.indexOf('特长');
  if (i < 0) return [];
  const seg = html.slice(i, i + 3000);
  const table = /<table[^>]*>([\s\S]*?)<\/table>/.exec(seg);
  if (!table) return [];
  const traits = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rm;
  while ((rm = rowRe.exec(table[1])) !== null) {
    const cells = [];
    const cr = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
    let cm;
    while ((cm = cr.exec(rm[1])) !== null) cells.push(stripTags(cm[1]));
    if (cells.length === 2 && cells[0] && cells[1] && cells[0] !== '特长') {
      traits.push({ name: cells[0], p: cells[1] });
    }
  }
  return traits;
}

/** 解析 3 张技能表（升级/血脉/技能石） */
function parseSkills(html) {
  const tables = [];
  const re = /<table[^>]*>([\s\S]*?)<\/table>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const rows = [];
    const rr = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rm;
    while ((rm = rr.exec(m[1])) !== null) {
      const cells = [];
      const cr = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
      let cm;
      while ((cm = cr.exec(rm[1])) !== null) cells.push(stripTags(cm[1]));
      rows.push(cells);
    }
    tables.push(rows);
  }
  // 技能表的特征表头：Lv | 技能 | 属性 | 分类 | 威力 | PP | 效果
  const skillTables = tables.filter((t) => t.length > 1 && t[0].length >= 7 && t[0][0] === 'Lv');
  const toSkills = (rows) => rows.slice(1).map((r) => ({
    lv: r[0] || '',
    name: (r[2] || '').trim(),
    type: r[3] || '',
    kind: r[4] || '',
    power: r[5] || '',
    pp: r[6] || '',
    desc: (r[7] || '').trim()
  })).filter((s) => s.name);

  return {
    level: skillTables[0] ? toSkills(skillTables[0]) : [],
    blood: skillTables[1] ? toSkills(skillTables[1]) : [],
    stone: skillTables[2] ? toSkills(skillTables[2]) : []
  };
}

/** 解析简介（特色描述文本） */
function parseDesc(html) {
  // 简介位于 "异色: X" 之后的 <p>
  const m = /异色:\s*[是否]<\/span>\s*<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/.exec(html);
  return m ? stripTags(m[1]) : '';
}

function parseDetailPage(html) {
  return {
    stats: parseStats(html),
    traits: parseTraits(html),
    skills: parseSkills(html),
    desc: parseDesc(html)
  };
}

async function fetchDetail(slug) {
  const res = await fetch(`https://rocokingdomworld.org/zh/pokedex/${slug}/`, { headers: UA });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return parseDetailPage(await res.text());
}

async function main() {
  console.log('[1/3] 读取 spirits.json ...');
  const spirits = JSON.parse(await readFile(join(ROOT, 'public', 'spirits.json'), 'utf8'));
  const slugs = [...new Set(spirits.spirits.filter((s) => s.slug).map((s) => s.slug))];
  console.log(`      ${slugs.length} 个唯一 slug`);

  // 断点续抓：读取已有数据
  let existing = {};
  try {
    existing = JSON.parse(await readFile(OUT, 'utf8'));
  } catch { /* 首次 */ }

  const todo = slugs.filter((slug) => FORCE || !existing[slug]);
  console.log(`[2/3] 待抓取 ${todo.length} 个（已缓存 ${slugs.length - todo.length}）...`);

  let done = 0, failed = [];
  for (const slug of todo) {
    if (done >= LIMIT) break;
    try {
      const detail = await fetchDetail(slug);
      existing[slug] = detail;
      done++;
      if (done % 20 === 0) {
        console.log(`      进度 ${done}/${todo.length}`);
        // 阶段性落盘，防中断丢失
        await writeFile(OUT, JSON.stringify(existing));
      }
    } catch (e) {
      failed.push(slug + '(' + e.message + ')');
    }
    await sleep(1000);
  }
  // 最终落盘
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(existing));

  console.log(`[3/3] 完成：成功 ${done}，失败 ${failed.length}`);
  if (failed.length) console.log('  失败清单:', failed.slice(0, 10).join(', '), failed.length > 10 ? '...' : '');
  console.log(`      ✓ public/spirits-detail.json（共 ${Object.keys(existing).length} 条）`);
}

main().catch((e) => {
  console.error('抓取失败:', e.message);
  process.exit(1);
});
