import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { GlobalFonts } from '@napi-rs/canvas';
import { FONT_DIR } from './paths.js';
import { UserError } from './logger.js';

export const FAMILY = 'ShinigiwaJP';

let registered = null;

/**
 * 日本語フォントを確保する。
 * 1. assets/fonts/ に置かれたフォント（npm run setup:fonts で取得）
 * 2. OS にインストール済みの Noto Sans CJK / ヒラギノ / 游ゴシック など
 */
export function ensureJapaneseFont() {
  if (registered) return registered;

  const local = findLocalFonts();
  if (local.length) {
    for (const f of local) GlobalFonts.registerFromPath(f, FAMILY);
    registered = { family: FAMILY, files: local, source: 'assets/fonts' };
    return registered;
  }

  const system = findSystemCjkFont();
  if (system) {
    GlobalFonts.registerFromPath(system, FAMILY);
    registered = { family: FAMILY, files: [system], source: 'system' };
    return registered;
  }

  throw new UserError(
    '日本語フォントが見つかりません。\n' +
      '  npm run setup:fonts\n' +
      'を実行してフォントを取得してください（assets/fonts/ に保存されます）。',
  );
}

function findLocalFonts() {
  if (!fs.existsSync(FONT_DIR)) return [];
  return fs
    .readdirSync(FONT_DIR)
    .filter((f) => /\.(woff2|ttf|otf|ttc)$/i.test(f))
    .sort() // Bold を先に読ませたくないので名前順で安定させる
    .map((f) => path.join(FONT_DIR, f));
}

function findSystemCjkFont() {
  const candidates = [
    '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf',
    'C:\\Windows\\Fonts\\YuGothB.ttc',
    'C:\\Windows\\Fonts\\meiryob.ttc',
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;

  try {
    const out = execFileSync('fc-list', [':lang=ja', 'file'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const first = out
      .split('\n')
      .map((l) => l.replace(/:\s*$/, '').trim())
      .filter(Boolean)[0];
    if (first && fs.existsSync(first)) return first;
  } catch {
    /* fc-list が無い環境は無視 */
  }
  return null;
}
