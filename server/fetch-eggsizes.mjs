#!/usr/bin/env node
/**
 * 孵蛋鉴定数据抓取（蛋体型范围反查）
 *
 * 数据源：rocokingdomworld.org/zh/egg-groups/ 页面内嵌 JSON 的 sizesData
 *   每条：{ name, heightMin/Max, weightMin/Max, pic, ... }（蛋的身高体重范围）
 *
 * 产出 public/eggsizes.json，供小程序孵蛋鉴定功能反查。
 * 数据月度级稳定，无需定时抓取；想更新时手动跑一次即可。
 *
 * 用法：node server/fetch-eggsizes.mjs
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = 'https://rocokingdomworld.org/zh/egg-groups/';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  console.log('[1/3] 抓取孵蛋鉴定页面 ...');
  var res = await fetch(SRC, { headers: UA });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  var html = await res.text();

  console.log('[2/3] 提取内嵌 sizesData ...');
  var re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  var m, data = null;
  while ((m = re.exec(html)) !== null) {
    if (m[1].length > 100000) {
      data = JSON.parse(m[1]);
      break;
    }
  }
  if (!data || !Array.isArray(data.sizesData)) throw new Error('未找到 sizesData，页面结构可能已变化');

  var sizes = data.sizesData.map(function (s) {
    return {
      name: s.name,
      pic: s.pic && s.pic.indexOf('/') === 0 ? 'https://rocokingdomworld.org' + s.pic : s.pic,
      eggHeightMin: s.heightMin,
      eggHeightMax: s.heightMax,
      eggWeightMin: s.weightMin,
      eggWeightMax: s.weightMax
    };
  }).filter(function (s) { return s.name && s.eggHeightMin !== undefined; });

  console.log(`      ${sizes.length} 条蛋体型数据`);

  console.log('[3/3] 写入 public/eggsizes.json ...');
  var outDir = join(ROOT, 'public');
  await mkdir(outDir, { recursive: true });
  await writeFile(outDir && join(outDir, 'eggsizes.json'), JSON.stringify({
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    meta: { updatedAt: new Date().toISOString().slice(0, 10), source: 'rocokingdomworld.org 孵蛋鉴定数据' },
    cannotNames: data.cannotNames || [],
    count: sizes.length,
    sizes: sizes
  }), 'utf8');
  console.log(`      ✓ public/eggsizes.json (${sizes.length} 条)`);
}

main().catch(function (e) {
  console.error('抓取失败:', e.message);
  process.exit(1);
});
