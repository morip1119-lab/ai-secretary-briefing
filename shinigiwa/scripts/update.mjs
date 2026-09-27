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
/** ネタ台帳のうち、手元の値を必ず残すキー（投稿の実績） */
const SUBJECT_STATE_KEYS = ['status', 'lastPostedAt'];
/** どのブランチから取り込んだかの記録。次回の探索を省くためだけに使う */
const SOURCE_FILE = path.join(ROOT, 'data', 'source.json');

const c = process.stdout.isTTY
  ? { dim: (s) => `\u001b[2m${s}\u001b[0m`, bold: (s) => `\u001b[1m${s}\u001b[0m`, cyan: (s) => `\u001b[36m${s}\u001b[0m`, yellow: (s) => `\u001b[33m${s}\u001b[0m`, red: (s) => `\u001b[31m${s}\u001b[0m`, green: (s) => `\u001b[32m${s}\u001b[0m` }
  : new Proxy({}, { get: () => (s) => s });

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'shinigiwa-update-'));

console.log('');
console.log(`  ${c.bold('更新を取り込みます')}  ${c.dim(REPO)}`);
console.log('');

try {
  const { branch, source } = await resolveSource();
  const { changed, notes } = apply(source);
  rememberBranch(branch);

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

/**
 * どこから取り込むかを決めて、展開済みのフォルダを返す。
 *
 * ダブルクリックで運用する前提なので「ブランチを指定して叩き直してください」で
 * 終わらせない。master にまだ入っていない間も、置いてあるブランチを自分で探す。
 */
async function resolveSource() {
  const asked = argValue('--branch');
  if (asked) {
    const source = await download(asked);
    if (source) return { branch: asked, source };
    throw new Error(`ブランチ ${asked} から ${PROJECT_DIR}/ を取れませんでした。`);
  }

  const tried = [];
  for await (const ref of candidateBranches()) {
    if (tried.includes(ref)) continue;
    tried.push(ref);
    const source = await download(ref);
    if (source) return { branch: ref, source };
  }

  throw new Error(
    [
      `${REPO} のどのブランチにも ${PROJECT_DIR}/ が見つかりませんでした。`,
      `    試したブランチ: ${tried.join(', ')}`,
      '    ブランチが分かっている場合:  node scripts/update.mjs --branch ブランチ名',
    ].join('\n'),
  );
}

/**
 * 試す順番。master にマージされたらそちらが正なので先に見る。
 * 探索は前の候補が外れたときにしか動かない（API の呼び出しを無駄にしないため）。
 */
async function* candidateBranches() {
  yield DEFAULT_BRANCH;

  const remembered = rememberedBranch();
  if (remembered) yield remembered;

  const found = await findBranchWithProject();
  if (found) yield found;
}

/** shinigiwa/ が置かれているブランチを探す。名前に shinigiwa を含むものから当たる。 */
async function findBranchWithProject() {
  process.stdout.write(`  ${c.cyan('›')} 置き場所を探しています ... `);
  const branches = await githubJson(`https://api.github.com/repos/${REPO}/branches?per_page=100`);
  if (!Array.isArray(branches)) {
    console.log('できませんでした');
    return null;
  }

  const names = branches.map((b) => b.name).filter(Boolean).sort((a, b) => score(b) - score(a));
  // 未認証の GitHub API は回数が限られているので、当てにいく数を絞る
  for (const name of names.slice(0, 8)) {
    const url = `https://api.github.com/repos/${REPO}/contents/${PROJECT_DIR}?ref=${encodeURIComponent(name)}`;
    const res = await githubJson(url, { raw: true });
    if (res?.ok) {
      console.log(`${name} にありました`);
      return name;
    }
  }
  console.log('見つかりませんでした');
  return null;
}

function score(name) {
  return (name.includes(PROJECT_DIR) ? 2 : 0) + (name.startsWith('cursor/') ? 1 : 0);
}

async function githubJson(url, { raw = false } = {}) {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'shinigiwa-updater' },
      signal: AbortSignal.timeout(30_000),
    });
    if (raw) return res;
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function rememberedBranch() {
  try {
    return JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8')).branch ?? null;
  } catch {
    return null;
  }
}

function rememberBranch(branch) {
  if (rememberedBranch() === branch) return;
  try {
    fs.mkdirSync(path.dirname(SOURCE_FILE), { recursive: true });
    fs.writeFileSync(SOURCE_FILE, `${JSON.stringify({ branch }, null, 2)}\n`, 'utf8');
  } catch {
    /* 覚えられなくても、次回また探すだけ */
  }
}

/**
 * ブランチの zip を落として展開する。
 * ブランチが無い、または shinigiwa/ が入っていない場合は null（次の候補を試す合図）。
 */
async function download(ref) {
  const url = `https://codeload.github.com/${REPO}/zip/refs/heads/${ref}`;
  process.stdout.write(`  ${c.cyan('›')} ${ref} を取得 ... `);

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  } catch {
    console.log('失敗');
    throw new Error('GitHub に接続できませんでした。ネットワークを確認してください。');
  }
  if (res.status === 404) {
    console.log('ブランチがありません');
    return null;
  }
  if (!res.ok) {
    console.log('失敗');
    throw new Error(`ダウンロードに失敗しました (HTTP ${res.status})`);
  }

  const dir = path.join(work, ref.replace(/[^A-Za-z0-9._-]/g, '_'));
  const zip = path.join(dir, 'source.zip');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));

  const out = path.join(dir, 'unpacked');
  fs.mkdirSync(out, { recursive: true });
  extract(zip, out);

  const [top] = fs.readdirSync(out);
  const source = path.join(out, top ?? '', PROJECT_DIR);
  if (!fs.existsSync(source)) {
    console.log(`${PROJECT_DIR}/ は入っていません`);
    return null;
  }
  console.log(`ok (${Math.round(fs.statSync(zip).size / 1024)} KB)`);
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
 * ネタ台帳は、中身（事実・構成）は上流が正で、実績（投稿済みかどうか）は手元が正。
 * 上流の加筆を取り込みつつ、投稿履歴だけは必ず手元のものを残す。
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
  const byId = new Map(local.map((s) => [s.id, s]));
  const added = [];
  const revised = [];

  const merged = incoming.map((next) => {
    const mine = byId.get(next.id);
    if (!mine) {
      added.push(next);
      return next;
    }
    byId.delete(next.id);
    const state = Object.fromEntries(
      SUBJECT_STATE_KEYS.filter((k) => mine[k] !== undefined).map((k) => [k, mine[k]]),
    );
    const result = { ...next, ...state };
    if (JSON.stringify(result) !== JSON.stringify(mine)) revised.push(next.name ?? next.id);
    return result;
  });

  // 上流から消えた（＝手元で足した）ネタは残す
  const localOnly = [...byId.values()];
  const subjects = [...merged, ...localOnly];

  if (!added.length && !revised.length) return;
  fs.writeFileSync(dest, `${JSON.stringify({ subjects }, null, 2)}\n`, 'utf8');
  if (added.length) changed.push(`ネタ台帳に ${added.length} 件追加（${added.map((s) => s.name).join('、')}）`);
  if (revised.length) changed.push(`ネタ台帳の ${revised.length} 件を更新（${revised.join('、')}）`);
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
