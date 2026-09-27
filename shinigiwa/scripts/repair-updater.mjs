#!/usr/bin/env node
/**
 * 更新スクリプト（scripts/update.mjs）を GitHub から取り直す。
 *
 * update.mjs 自身が古いと、新しい update.mjs を取ってくる手段がないまま詰む。
 * 実際にそれで止まったので、update.bat が失敗したときだけここに来る。
 *
 * このファイルはプロジェクト内の何も import しない。
 * 壊れているかもしれないコードに依存したら、直す役目を果たせない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'morip1119-lab/ai-secretary-briefing';
const PROJECT_DIR = 'shinigiwa';
const DEFAULT_BRANCH = 'master';
const TARGET = path.join(path.dirname(fileURLToPath(import.meta.url)), 'update.mjs');
/** 落としたものが本当に更新スクリプトかの目印 */
const MARKER = 'SYNC_DIRS';

const dim = (s) => (process.stdout.isTTY ? `\u001b[2m${s}\u001b[0m` : s);

const branch = await findWorkingBranch();
if (!branch) {
  console.error('  更新スクリプトを取り直せませんでした。');
  console.error(dim('    GitHub に接続できているか確認してください。'));
  process.exit(1);
}
console.log(`  ${branch} から取り直しました`);

// ---------------------------------------------------------------

async function findWorkingBranch() {
  if (await fetchUpdater(DEFAULT_BRANCH)) return DEFAULT_BRANCH;

  for (const name of await listBranches()) {
    if (name === DEFAULT_BRANCH) continue;
    if (await fetchUpdater(name)) return name;
  }
  return null;
}

/** そのブランチの update.mjs を取って、中身を確かめてから置き換える */
async function fetchUpdater(branch) {
  const url = `https://raw.githubusercontent.com/${REPO}/${encodeURI(branch)}/${PROJECT_DIR}/scripts/update.mjs`;
  const body = await get(url);
  if (!body || !body.includes(MARKER)) return false;

  fs.writeFileSync(TARGET, body, 'utf8');
  return true;
}

/** 名前に shinigiwa を含むものから当たる。未認証 API の回数を使いすぎないよう数を絞る。 */
async function listBranches() {
  const body = await get(`https://api.github.com/repos/${REPO}/branches?per_page=100`);
  if (!body) return [];
  try {
    return JSON.parse(body)
      .map((b) => b.name)
      .filter(Boolean)
      .sort((a, b) => score(b) - score(a))
      .slice(0, 8);
  } catch {
    return [];
  }
}

function score(name) {
  return (name.includes(PROJECT_DIR) ? 2 : 0) + (name.startsWith('cursor/') ? 1 : 0);
}

async function get(url) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'shinigiwa-updater', accept: '*/*' },
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}
