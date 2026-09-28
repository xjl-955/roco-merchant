#!/usr/bin/env node
/**
 * 参照站详情补充抓取：特性/简介/获取方式/身高体重/星光值/回顾
 *
 * 数据源：rocokingdomworld.org/zh/pokedex/<slug>（服务端渲染 HTML）
 * 产出：public/spirits-extra.json  { <名字>: { trait, traitDesc, desc, obtain, body:{h,w}, star, review, cnName } }
 *
 * 断点续抓 + 1.2s 限速 + 20 条一存
 * 用法：node server/fetch-extra.mjs [--force] [--limit=N]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'spirits-extra.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FORCE = process.argv.includes('--force');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchExtra(slug) {
  const res = await fetch('https://rocokingdomworld.org/zh/pokedex/' + slug + '/', { headers: UA });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const out = {};

  // 特性："特性 - XXX</div><div ...>描述</div>"
  const traitM = /特性 - ([^<]+)<\/div>\s*<div class="text-sm text-ink mt-1 font-semibold">([^<]+)</.exec(html);
  if (traitM) { out.trait = traitM[1].trim(); out.traitDesc = traitM[2].trim(); }

  // 简介：h1 后面的 <p class="mt-4 text-sm ...">
  const descM = /<p class="mt-4 text-sm text-ink-muted leading-relaxed font-semibold">([^<]+)<\/p>/.exec(html);
  if (descM) out.desc = descM[1].trim();

  // dt/dd 字段
  const fields = {};
  const ddRe = /<dt class="text-ink-dim">([^<]+)<\/dt><dd class="text-ink">([^<]*)<\/dd>/g;
  let m;
  while ((m = ddRe.exec(html)) !== null) fields[m[1].trim()] = stripTags(m[2]);
  if (fields['获取方式']) out.obtain = fields['获取方式'];
  if (fields['身高']) out.h = fields['身高'];
  if (fields['体重']) out.w = fields['体重'];
  if (fields['星光值']) out.star = fields['星光值'];
  if (fields['回顾']) out.review = fields['回顾'];
  if (fields['种类']) out.kind = fields['种类'];

  return out;
}

async function main() {
  console.log('[1/3] 读取 spirits.json（slug 索引）...');
  const spirits = JSON.parse(await readFile(join(ROOT, 'public', 'spirits.json'), 'utf8'));
  const todo = [];
  const seen = new Set();
  for (const s of spirits.spirits) {
    if (!s.slug || seen.has(s.slug)) continue;
    seen.add(s.slug);
    todo.push({ name: s.name, slug: s.slug });
  }
  console.log(`      ${todo.length} 个唯一 slug`);

  let existing = {};
  try { existing = JSON.parse(await readFile(OUT, 'utf8')); } catch { }

  const queue = todo.filter((t) => FORCE || !existing[t.name]);
  console.log(`[2/3] 待抓取 ${queue.length} 个（已缓存 ${todo.length - queue.length}）...`);

  let done = 0;
  const failed = [];
  for (const t of queue) {
    if (done >= LIMIT) break;
    try {
      existing[t.name] = await fetchExtra(t.slug);
      done++;
      if (done % 20 === 0) {
        console.log(`      进度 ${done}/${queue.length}`);
        await writeFile(OUT, JSON.stringify(existing));
      }
    } catch (e) {
      failed.push(t.name + '(' + e.message + ')');
      await sleep(3000);
    }
    await sleep(1200);
  }
  await writeFile(OUT, JSON.stringify(existing));

  console.log(`[3/3] 完成：成功 ${done}，失败 ${failed.length}`);
  if (failed.length) console.log('  失败样例:', failed.slice(0, 8).join(', '));
  console.log(`      ✓ public/spirits-extra.json（${Object.keys(existing).length} 条）`);
}

main().catch((e) => { console.error('抓取失败:', e.message); process.exit(1); });
