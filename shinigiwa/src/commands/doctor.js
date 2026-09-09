import fs from 'node:fs';
import { env, loadConfig } from '../core/config.js';
import { ENV_FILE } from '../core/paths.js';
import { c, log } from '../core/logger.js';
import { listPosts, listSubjects } from '../core/store.js';
import { estimateCost } from '../core/xclient.js';

export async function run() {
  const config = loadConfig();
  log.blank();
  log.rule('診断');

  check('.env', fs.existsSync(ENV_FILE), fs.existsSync(ENV_FILE) ? '読み込み済み' : '未作成（.env.example をコピーしてください）');

  const { missing } = env.xCredentials;
  check('X の認証情報', missing.length === 0, missing.length ? `未設定: ${missing.join(', ')}` : '4つとも設定済み');

  check('DRY_RUN', true, env.dryRun ? c.yellow('true（投稿は行われません）') : c.red('false（実際に投稿されます）'));

  const provider = env.llmProvider;
  const keyOk =
    provider === 'mock' ||
    (provider === 'anthropic' && !!process.env.ANTHROPIC_API_KEY) ||
    (provider === 'openai' && !!process.env.OPENAI_API_KEY);
  check(`原稿生成 (${provider})`, keyOk, keyOk ? 'OK' : 'API キーが未設定です');

  let fontMsg;
  let fontOk = false;
  try {
    const { ensureJapaneseFont } = await import('../core/fonts.js');
    const f = ensureJapaneseFont();
    fontOk = true;
    fontMsg = `${f.source} (${f.files.length} ファイル)`;
  } catch (e) {
    fontMsg = e.message.split('\n')[0];
  }
  check('日本語フォント', fontOk, fontMsg);

  const subjects = listSubjects();
  check('ネタ台帳', subjects.length > 0, `${subjects.length} 件`);

  const posts = listPosts();
  const byStatus = posts.reduce((acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }), {});
  check('原稿', true, Object.entries(byStatus).map(([k, v]) => `${k}:${v}`).join('  ') || 'なし');

  log.blank();
  log.rule('運用コストの目安');
  const perDay = config.posting.postsPerDay;
  const monthlyPosts = perDay * 30 * (config.posting.sourceReply ? 2 : 1);
  const monthly = estimateCost({ posts: monthlyPosts, mediaUploads: perDay * 30 });
  console.log(`  1日 ${perDay} 投稿 → X API 課金の概算 ${c.bold(`$${monthly.toFixed(2)} / 月`)}`);
  console.log(c.dim('  ※ 本文に URL を入れると 1 投稿 $0.20 に跳ね上がるため既定で禁止しています'));
  console.log(c.dim('  ※ 長文ポストと収益化には別途 X Premium の月額が必要です'));
  log.blank();
}

function check(label, ok, detail) {
  const mark = ok ? c.green('✓') : c.red('✗');
  console.log(`  ${mark} ${label.padEnd(20)} ${c.dim(detail ?? '')}`);
}
