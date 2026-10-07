#!/usr/bin/env node
/**
 * 拆分 spirits-wiki.json → 单精灵文件 details/{id}.json
 * id = spirits.json 里的自增 id（1~625），避免中文名做文件名的编码问题
 * 产出：public/details/ 目录 + public/details-index.json（名字→id 映射）
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  console.log('[1/3] 读取数据...');
  const spirits = JSON.parse(await readFile(join(ROOT, 'public', 'spirits.json'), 'utf8'));
  const detail = JSON.parse(await readFile(join(ROOT, 'public', 'spirits-wiki.json'), 'utf8'));

  // 名字→id 映射（含形态变体共享基础详情的情况：变体也指向基础 id）
  const outDir = join(ROOT, 'public', 'details');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const index = {}; // norm(name) -> { id, base }
  let written = 0;

  for (const s of spirits.spirits) {
    const norm = String(s.name).replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '').trim();
    const d = detail[s.name];
    if (!d) continue;
    const file = 'd' + s.id + '.json';
    await writeFile(join(outDir, file), JSON.stringify(d));
    index[norm] = { id: s.id, file: file };
    // 同 baseName 的变体（详情已在前面挂接过，直接映射同 id）
    written++;
  }

  // 变体兜底：写 index 时把每个名字都映射（包括带括号的形态名）
  // 上面循环已覆盖全部 spirits.spirits 名称

  // 索引文件
  await writeFile(join(ROOT, 'public', 'details-index.json'), JSON.stringify({
    formatVersion: 1,
    count: written,
    index: index
  }));

  console.log(`[2/3] 拆分完成: ${written} 个详情文件`);
  console.log(`[3/3] ✓ public/details/ + details-index.json`);
}
main();
