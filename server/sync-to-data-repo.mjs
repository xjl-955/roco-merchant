#!/usr/bin/env node
/**
 * 把 public/live.json（以及可选的 schedule.json）同步到数据仓库 xjl-955/roco-data
 * 需要 GitHub Token（对 roco-data 有 repo 权限），通过环境变量 TOKEN 传入。
 *
 * 特性：
 *  - 内容与远端一致时跳过（不产生垃圾提交）
 *  - live.json 必须存在，缺失则报错
 *  - schedule.json 存在则一并同步（可选）
 *
 * 用法（在 GitHub Actions 中）：
 *   env.TOKEN = <secret>; node server/sync-to-data-repo.mjs
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OWNER = 'xjl-955';
const REPO = 'roco-data';
const BRANCH = 'main';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = ['live.json', 'schedule.json'];

const API = (path) => `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

async function getRemote(path, token) {
  const res = await fetch(API(path), {
    headers: {
      'User-Agent': 'roco-sync-script',
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json'
    }
  });
  if (res.status === 404) return { sha: null, content: null };
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`);
  const j = await res.json();
  return { sha: j.sha, content: Buffer.from(j.content, 'base64').toString('utf8') };
}

async function putFile(path, content, sha, token, message) {
  const res = await fetch(API(path), {
    method: 'PUT',
    headers: {
      'User-Agent': 'roco-sync-script',
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: BRANCH,
      ...(sha ? { sha } : {})
    })
  });
  if (!res.ok) throw new Error(`PUT ${path} → HTTP ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  return res.json();
}

async function main() {
  const token = process.env.TOKEN;
  if (!token) {
    console.log('::warning:: 缺少 TOKEN 环境变量，跳过同步');
    process.exit(0);
  }

  let pushed = 0, skipped = 0;
  for (const file of FILES) {
    const localPath = join(ROOT, 'public', file);
    let local;
    try {
      local = await readFile(localPath, 'utf8');
    } catch {
      if (file === 'live.json') throw new Error('public/live.json 不存在，请先运行 fetch-live.mjs');
      console.log(`  - ${file} 本地不存在，跳过`);
      continue;
    }

    const remote = await getRemote(file, token);
    if (remote.content === local) {
      console.log(`  = ${file} 内容一致，跳过`);
      skipped++;
      continue;
    }

    await putFile(file, local, remote.sha, token,
      `chore: sync ${file} from roco-merchant (${new Date().toISOString().slice(0, 16)})`);
    console.log(`  ✓ ${file} 已推送 (${remote.sha ? '更新' : '新建'})`);
    pushed++;
  }

  console.log(`同步完成：${pushed} 个文件推送，${skipped} 个跳过`);
  if (pushed === 0 && skipped === 0) throw new Error('没有同步任何文件');
}

main().catch(function (e) {
  console.error('同步失败:', e.message);
  process.exit(1);
});
