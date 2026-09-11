#!/usr/bin/env node
import { loadEnv } from './core/config.js';
import { UserError, c, log } from './core/logger.js';

loadEnv();

const COMMANDS = {
  doctor: { desc: '設定・認証・フォントの状態を診断する', load: () => import('./commands/doctor.js') },
  subjects: { desc: 'ネタ台帳をスコア順に一覧表示する', load: () => import('./commands/subjects.js') },
  generate: { desc: '上位のネタから原稿を生成する', load: () => import('./commands/generate.js') },
  review: { desc: 'ブラウザで原稿を確認・編集・承認する', load: () => import('./commands/review.js') },
  approve: { desc: '原稿を承認する', load: () => import('./commands/approve.js') },
  reject: { desc: '原稿を却下する', load: () => import('./commands/approve.js') },
  image: { desc: '画像を作り直す', load: () => import('./commands/image.js') },
  queue: { desc: '承認済みの原稿を投稿枠に割り当てる', load: () => import('./commands/queue.js') },
  export: { desc: '手動で貼れるように本文と画像を書き出す', load: () => import('./commands/export.js') },
  posted: { desc: '手動で投稿したことを記録する', load: () => import('./commands/posted.js') },
  publish: { desc: '投稿時刻を過ぎたものを X に投稿する（API連携時）', load: () => import('./commands/publish.js') },
  auto: { desc: '補充→予約→投稿をまとめて実行する（cron 用）', load: () => import('./commands/auto.js') },
  metrics: { desc: '投稿の実績を取得する（読み取り課金あり）', load: () => import('./commands/metrics.js') },
  stats: { desc: '伸びたネタの傾向を集計する', load: () => import('./commands/stats.js') },
};

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      const key = k.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      if (v !== undefined) flags[key] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('-')) flags[key] = argv[(i += 1)];
      else flags[key] = true;
    } else if (a.startsWith('-') && a.length > 1) {
      flags[a.slice(1)] = true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function usage() {
  log.blank();
  console.log(c.bold('  死に際チャンネル 運用システム'));
  log.blank();
  console.log('  使い方: node src/cli.js <command> [options]');
  log.blank();
  for (const [name, { desc }] of Object.entries(COMMANDS)) {
    console.log(`  ${c.cyan(name.padEnd(10))} ${desc}`);
  }
  log.blank();
  console.log(c.dim('  はじめての人は  node src/cli.js doctor  から。'));
  log.blank();
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    usage();
    return;
  }
  const entry = COMMANDS[cmd];
  if (!entry) {
    log.error(`未知のコマンド: ${cmd}`);
    usage();
    process.exitCode = 1;
    return;
  }
  const mod = await entry.load();
  const { positional, flags } = parseArgs(rest);
  await mod.run({ positional, flags, command: cmd });
}

main().catch((e) => {
  if (e instanceof UserError) {
    log.error(e.message);
    process.exitCode = 1;
  } else {
    log.error(e.stack ?? e.message);
    process.exitCode = 1;
  }
});
