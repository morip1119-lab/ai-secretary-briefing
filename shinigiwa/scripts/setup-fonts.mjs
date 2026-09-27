#!/usr/bin/env node
/**
 * 画像カード用の日本語フォントを assets/fonts/ に取得する。
 * Noto Sans JP (SIL Open Font License 1.1) を jsDelivr の fontsource ミラーから落とす。
 */
import fs from 'node:fs';
import path from 'node:path';
import { FONT_DIR } from '../src/core/paths.js';

const FILES = [
  {
    name: 'NotoSansJP-Regular.woff2',
    url: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.2.5/files/noto-sans-jp-japanese-400-normal.woff2',
  },
  {
    name: 'NotoSansJP-Bold.woff2',
    url: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.2.5/files/noto-sans-jp-japanese-700-normal.woff2',
  },
];

fs.mkdirSync(FONT_DIR, { recursive: true });

let failures = 0;
for (const f of FILES) {
  const dest = path.join(FONT_DIR, f.name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100_000) {
    console.log(`  skip  ${f.name}（取得済み）`);
    continue;
  }
  process.stdout.write(`  get   ${f.name} ... `);
  try {
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100_000) throw new Error(`サイズが小さすぎます (${buf.length} bytes)`);
    fs.writeFileSync(dest, buf);
    console.log(`ok (${Math.round(buf.length / 1024)} KB)`);
  } catch (e) {
    failures += 1;
    console.log(`失敗: ${e.message}`);
  }
}

const license = path.join(FONT_DIR, 'LICENSE.txt');
if (!fs.existsSync(license)) {
  fs.writeFileSync(
    license,
    [
      'Noto Sans JP',
      'Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name "Source".',
      'Licensed under the SIL Open Font License, Version 1.1.',
      'https://openfontlicense.org',
      '',
      'このディレクトリのフォントは npm run setup:fonts で取得したものです。',
    ].join('\n'),
  );
}

if (failures) {
  console.error('\n一部のフォント取得に失敗しました。ネットワークを確認するか、OS に Noto Sans CJK をインストールしてください。');
  process.exitCode = 1;
} else {
  console.log('\n完了: ' + FONT_DIR);
}
