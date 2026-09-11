#!/usr/bin/env node
/**
 * ローカル運用の入口。
 * 依存のインストール・フォント取得・.env の用意まで面倒を見てから
 * レビュー画面を立ち上げてブラウザで開く。
 *
 * ターミナルに慣れていなくても start.bat / start.command のダブルクリックで
 * ここに来られるようにしてある。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, ENV_FILE, FONT_DIR } from '../src/core/paths.js';

const c = process.stdout.isTTY
  ? { dim: (s) => `\u001b[2m${s}\u001b[0m`, bold: (s) => `\u001b[1m${s}\u001b[0m`, cyan: (s) => `\u001b[36m${s}\u001b[0m`, yellow: (s) => `\u001b[33m${s}\u001b[0m`, red: (s) => `\u001b[31m${s}\u001b[0m`, green: (s) => `\u001b[32m${s}\u001b[0m` }
  : new Proxy({}, { get: () => (s) => s });

console.log('');
console.log(c.bold('  死に際チャンネル'));
console.log(c.dim(`  ${ROOT}`));
console.log('');

ensureEnvFile();
ensureDependencies();
markIgnoredByDropbox();
await ensureFonts();
warnAboutApiKey();

const { startServer } = await import('../src/server/index.js');
const { loadEnv } = await import('../src/core/config.js');
loadEnv();
await startServer({ open: true });
await new Promise(() => {});

// ---------------------------------------------------------------

function ensureEnvFile() {
  if (fs.existsSync(ENV_FILE)) return;
  const sample = path.join(ROOT, '.env.example');
  if (!fs.existsSync(sample)) return;
  fs.copyFileSync(sample, ENV_FILE);
  console.log(`  ${c.green('✓')} .env を作成しました`);
}

function ensureDependencies() {
  const modules = path.join(ROOT, 'node_modules');
  const stamp = path.join(modules, '.package-lock.json');
  const lock = path.join(ROOT, 'package-lock.json');

  const missing = !fs.existsSync(path.join(modules, '@napi-rs', 'canvas'));
  const stale =
    !missing &&
    fs.existsSync(lock) &&
    fs.existsSync(stamp) &&
    fs.statSync(lock).mtimeMs > fs.statSync(stamp).mtimeMs;
  if (!missing && !stale) return;

  console.log(`  ${c.cyan('›')} 必要な部品をインストールします（初回は数分かかります）`);
  console.log('');
  const res = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  console.log('');
  if (res.status !== 0) {
    fail(
      'npm install に失敗しました。',
      'ネットワークにつながっているか、Node.js が正しく入っているかを確認してください。',
    );
  }
}

/**
 * Dropbox 配下だと node_modules の数万ファイルを同期しようとして
 * インストールが固まったり壊れたりする。Dropbox 公式の除外フラグを立てておく。
 */
function markIgnoredByDropbox() {
  if (!/dropbox/i.test(ROOT)) return;
  const targets = [path.join(ROOT, 'node_modules'), path.join(ROOT, 'data', 'media')];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    try {
      if (process.platform === 'win32') {
        fs.writeFileSync(`${target}:com.dropbox.ignored`, '1');
      } else if (process.platform === 'darwin') {
        spawnSync('xattr', ['-w', 'com.dropbox.ignored', '1', target], { stdio: 'ignore' });
      }
    } catch {
      /* 除外できなくても動作はする */
    }
  }
}

async function ensureFonts() {
  const has = fs.existsSync(FONT_DIR) && fs.readdirSync(FONT_DIR).some((f) => f.endsWith('.woff2'));
  if (has) return;
  console.log(`  ${c.cyan('›')} 画像用の日本語フォントを取得します`);
  await import('./setup-fonts.mjs');
  console.log('');
}

function warnAboutApiKey() {
  const raw = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  // \s だと改行まで食って次の行を拾ってしまうので、行内の空白だけを対象にする
  const value = (name) => raw.match(new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? '';
  const provider = (value('LLM_PROVIDER') || 'mock').toLowerCase();
  const key = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  if (provider === 'mock' || value(key)) return;

  console.log(`  ${c.yellow('!')} ${key} が空です。このままだと原稿を生成できません。`);
  console.log(c.dim(`    ${ENV_FILE} を開いて ${key}= の右にキーを貼り付けてください。`));
  console.log('');
}

function fail(...lines) {
  console.log('');
  console.error(`  ${c.red('✗')} ${lines[0]}`);
  for (const line of lines.slice(1)) console.error(c.dim(`    ${line}`));
  console.log('');
  process.exit(1);
}
