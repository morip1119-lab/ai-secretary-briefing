#!/usr/bin/env node
/**
 * GitHub 側で更新したコードを、このローカル環境へ取り込む。
 *
 * 触らないもの: .env / data/posts / data/state.json / data/metrics.json /
 *               data/media / data/export / node_modules / assets/fonts
 * 特別扱い:     data/subjects.json は「増えたネタを足す」マージ
 *               config/config.json は上書きせず .new として横に置く
 *
 * git は不要。ブランチの zip を落として差し替えている。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../src/core/paths.js';

const REPO = 'morip1119-lab/ai-secretary-briefing';
const PROJECT_DIR = 'shinigiwa';
const DEFAULT_BRANCH = 'master';

/** 利用者が書き換えない場所。まるごと同期する（上流で消えたファイルはこちらでも消す） */
const SYNC_DIRS = ['src', 'scripts', 'test', 'docs'];
/** 単体で上書きするファイル */
const SYNC_FILES = ['package.json', 'package-lock.json', 'README.md', '.env.example', 'start.bat', 'start.command', 'update.bat'];

const c = process.stdout.isTTY
  ? { dim: (s) => `\u001b[2m${s}\u001b[0m`, bold: (s) => `\u001b[1m${s}\u001b[0m`, cyan: (s) => `\u001b[36m${s}\u001b[0m`, yellow: (s) => `\u001b[33m${s}\u001b[0m`, red: (s) => `\u001b[31m${s}\u001b[0m`, green: (s) => `\u001b[32m${s}\u001b[0m` }
  : new Proxy({}, { get: () => (s) => s });

const branch = argValue('--branch') ?? DEFAULT_BRANCH;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'shinigiwa-update-'));

console.log('');
console.log(`  ${c.bold('更新を取り込みます')}  ${c.dim(`${REPO} / ${branch}`)}`);
console.log('');

try {
  const source = await download(branch);
  const { changed, notes } = apply(source);

  console.log('');
  if (changed.length === 0) {
    console.log(`  ${c.green('✓')} すでに最新でした`);
  } else {
    console.log(`  ${c.green('✓')} ${changed.length} 件を更新しました`);
    for (const line of changed.slice(0, 40)) console.log(c.dim(`    ${line}`));
    if (changed.length > 40) console.log(c.dim(`    ほか ${changed.length - 40} 件`));
    console.log('');
    console.log(c.dim('  start.bat を起動し直すと反映されます'));
  }
  for (const note of notes) console.log(`  ${c.yellow('!')} ${note}`);
  console.log('');
} catch (e) {
  console.log('');
  console.error(`  ${c.red('✗')} ${e.message}`);
  console.log('');
  process.exitCode = 1;
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------

async function download(ref) {
  const url = `https://codeload.github.com/${REPO}/zip/refs/heads/${ref}`;
  process.stdout.write(`  ${c.cyan('›')} ダウンロード中 ... `);

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  } catch {
    throw new Error('GitHub に接続できませんでした。ネットワークを確認してください。');
  }
  if (res.status === 404) throw new Error(`ブランチ ${ref} が見つかりません。\n    別のブランチなら:  node scripts/update.mjs --branch ブランチ名`);
  if (!res.ok) throw new Error(`ダウンロードに失敗しました (HTTP ${res.status})`);

  const zip = path.join(work, 'source.zip');
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  console.log(`ok (${Math.round(fs.statSync(zip).size / 1024)} KB)`);

  const out = path.join(work, 'unpacked');
  fs.mkdirSync(out, { recursive: true });
  extract(zip, out);

  const [top] = fs.readdirSync(out);
  const source = path.join(out, top ?? '', PROJECT_DIR);
  if (!fs.existsSync(source)) {
    throw new Error(
      `ブランチ ${ref} に ${PROJECT_DIR}/ がありません。\n` +
        '    まだ master に取り込まれていない場合は、ブランチを指定してください:\n' +
        '      node scripts/update.mjs --branch cursor/shinigiwa-x-auto-post-system-37df',
    );
  }
  return source;
}

function extract(zip, dest) {
  const run =
    process.platform === 'win32'
      ? spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dest}' -Force`], { stdio: 'ignore' })
      : spawnSync('unzip', ['-q', zip, '-d', dest], { stdio: 'ignore' });
  if (run.status !== 0) throw new Error('zip の展開に失敗しました。');
}

function apply(source) {
  const changed = [];
  const notes = [];

  for (const dir of SYNC_DIRS) {
    syncDir(path.join(source, dir), path.join(ROOT, dir), dir, changed);
  }
  for (const file of SYNC_FILES) {
    copyIfChanged(path.join(source, file), path.join(ROOT, file), file, changed);
  }

  mergeSubjects(path.join(source, 'data', 'subjects.json'), changed);
  offerConfig(path.join(source, 'config', 'config.json'), changed, notes);

  return { changed, notes };
}

/** src にあるものを dest に反映し、src から消えたものは dest からも消す */
function syncDir(src, dest, label, changed) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) syncDir(from, to, `${label}/${entry.name}`, changed);
    else copyIfChanged(from, to, `${label}/${entry.name}`, changed);
  }

  for (const entry of fs.readdirSync(dest, { withFileTypes: true })) {
    if (fs.existsSync(path.join(src, entry.name))) continue;
    fs.rmSync(path.join(dest, entry.name), { recursive: true, force: true });
    changed.push(`削除 ${label}/${entry.name}`);
  }
}

function copyIfChanged(from, to, label, changed) {
  if (!fs.existsSync(from)) return;
  if (fs.existsSync(to) && fs.readFileSync(from).equals(fs.readFileSync(to))) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  changed.push(label);
}

/**
 * ネタ台帳は「使用済み」などの実績がローカルにしかないので上書きできない。
 * 手元にない id だけを足す。
 */
function mergeSubjects(src, changed) {
  if (!fs.existsSync(src)) return;
  const dest = path.join(ROOT, 'data', 'subjects.json');
  const incoming = JSON.parse(fs.readFileSync(src, 'utf8')).subjects ?? [];

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    changed.push(`data/subjects.json（${incoming.length} 件）`);
    return;
  }

  const local = JSON.parse(fs.readFileSync(dest, 'utf8')).subjects ?? [];
  const known = new Set(local.map((s) => s.id));
  const added = incoming.filter((s) => !known.has(s.id));
  if (added.length === 0) return;

  fs.writeFileSync(dest, `${JSON.stringify({ subjects: [...local, ...added] }, null, 2)}\n`, 'utf8');
  changed.push(`ネタ台帳に ${added.length} 件追加（${added.map((s) => s.name).join('、')}）`);
}

/** 運用方針は手元で調整している可能性が高いので、勝手に上書きしない */
function offerConfig(src, changed, notes) {
  if (!fs.existsSync(src)) return;
  const dest = path.join(ROOT, 'config', 'config.json');
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    changed.push('config/config.json');
    return;
  }
  if (fs.readFileSync(src).equals(fs.readFileSync(dest))) {
    fs.rmSync(`${dest}.new`, { force: true });
    return;
  }

  const next = `${dest}.new`;
  // 前回置いたものと同じなら「また更新があった」とは言わず、未処理であることだけ伝える
  if (fs.existsSync(next) && fs.readFileSync(src).equals(fs.readFileSync(next))) {
    notes.push('config/config.json.new が未処理のままです（中身を見比べて、必要なら差し替えてください）');
    return;
  }
  fs.copyFileSync(src, next);
  changed.push('config/config.json.new（設定が変わっています。中身を見比べて必要なら差し替えてください）');
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
