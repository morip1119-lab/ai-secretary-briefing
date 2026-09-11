import { loadConfig } from '../core/config.js';
import { c, log } from '../core/logger.js';
import { getSubject, listPosts, listSubjects } from '../core/store.js';
import { filterByRotation, rankSubjects } from '../core/scorer.js';
import { buildPost } from '../core/pipeline.js';
import { bodyStats } from '../core/formatter.js';

export async function run({ flags }) {
  const config = loadConfig();
  const count = Number(flags.count ?? config.posting.postsPerDay);
  const withImage = flags.noImage ? false : undefined;

  const targets = flags.subject
    ? [getSubject(flags.subject)]
    : pickSubjects(count, config);

  if (!targets.length) {
    log.warn('生成できるネタがありません。data/subjects.json にネタを追加してください。');
    return;
  }

  log.blank();
  log.step(`${targets.length} 本の原稿を生成します（provider: ${flags.provider ?? process.env.LLM_PROVIDER ?? 'mock'}）`);
  log.blank();

  for (const subject of targets) {
    try {
      const post = await buildPost(subject, { config, provider: flags.provider, withImage });
      report(post);
    } catch (e) {
      log.error(`${subject.id}: ${e.message}`);
    }
  }

  log.blank();
  log.info(c.dim('  確認・編集は  node src/cli.js review  でブラウザから行えます。'));
  log.blank();
}

function pickSubjects(count, config) {
  const pending = new Set(
    listPosts({ status: ['draft', 'approved', 'scheduled'] }).map((p) => p.subjectId),
  );
  const candidates = listSubjects().filter((s) => s.status !== 'used' && !pending.has(s.id));
  const ranked = filterByRotation(rankSubjects(candidates), { config });
  return ranked.slice(0, count);
}

function report(post) {
  const stats = bodyStats(post.body);
  const head = `${post.id}  ${c.dim(`${stats.weighted}字相当`)}`;
  if (post.guard.ok && !post.guard.warnings.length) log.ok(head);
  else if (post.guard.ok) log.warn(head);
  else log.error(head);

  console.log(c.dim(`    ${post.draft.hook.slice(0, 60)}`));
  for (const e of post.guard.errors) console.log(`    ${c.red('NG')} ${e}`);
  for (const w of post.guard.warnings) console.log(`    ${c.yellow('要確認')} ${w}`);
  if (post.image) console.log(c.dim(`    画像: ${post.image.path}`));
}
