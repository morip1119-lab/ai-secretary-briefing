import fs from 'node:fs';
import { env, loadConfig } from '../core/config.js';
import { renderCard } from '../core/imagecard.js';
import { c, log } from '../core/logger.js';
import { getPost, getSubject, listPosts, loadState, savePost, saveState, upsertSubject } from '../core/store.js';
import { inspect } from '../core/guard.js';
import { sourceReplyFor } from '../core/pipeline.js';
import { publishPost } from '../core/xclient.js';
import { formatInZone, localDateString } from '../core/schedule.js';

export async function run({ flags }) {
  const config = loadConfig();
  const now = new Date();
  const state = loadState();

  const targets = selectTargets({ flags, config, now });
  if (!targets.length) {
    log.info('投稿時刻に達した原稿はありません。');
    return;
  }

  const postedToday = countPostedToday(config, now);
  const room = Math.max(0, config.posting.maxPostsPerDay - postedToday);
  if (room === 0) {
    log.warn(`本日は既に上限 ${config.posting.maxPostsPerDay} 件を投稿済みです。`);
    return;
  }

  log.blank();
  if (env.dryRun) log.warn(c.yellow('DRY_RUN=true'), 'のため実際には投稿しません（.env で false にすると本番投稿）');

  let totalCost = 0;
  for (const post of targets.slice(0, room)) {
    const subject = getSubject(post.subjectId);

    // 承認から時間が経っている可能性があるので直前に検査し直す
    const verdict = inspect(post, subject, { config, state, now });
    post.guard = verdict;
    if (!verdict.ok && !flags.force) {
      savePost(post);
      log.error(`${post.id} は検査に落ちたためスキップしました:`);
      for (const e of verdict.errors) console.log(`    ${c.red('NG')} ${e}`);
      continue;
    }

    const result = await publishPost({
      body: post.body,
      imagePath: ensureImage(post, subject, config),
      replyText: sourceReplyFor(post, config),
    });

    totalCost += result.estimatedCostUsd ?? 0;

    if (result.dryRun) {
      log.info(c.dim(`  （${post.id} は DRY_RUN のため状態を変更していません）`));
      continue;
    }

    post.status = 'posted';
    post.publish = result;
    savePost(post);

    state.postedSubjects = state.postedSubjects ?? {};
    state.postedSubjects[post.subjectId] = result.postedAt;
    state.history = [
      ...(state.history ?? []),
      {
        postId: post.id,
        subjectId: post.subjectId,
        deathCategory: post.deathCategory,
        tweetId: result.tweetId,
        at: result.postedAt,
      },
    ];
    saveState(state);

    upsertSubject({ ...subject, status: 'used', lastPostedAt: result.postedAt });

    log.ok(`投稿しました: ${result.url}`);
  }

  log.blank();
  log.info(c.dim(`  X API 課金の概算: $${totalCost.toFixed(3)}`));
  log.blank();
}

/** 画像は追跡していないので、CI など手元にファイルが無い環境では作り直す */
function ensureImage(post, subject, config) {
  if (!config.image.enabled || !post.image?.path) return null;
  if (fs.existsSync(post.image.path)) return post.image.path;
  return renderCard(post, subject, { config });
}

function selectTargets({ flags, config, now }) {
  if (flags.id) return [getPost(String(flags.id))];

  const scheduled = listPosts({ status: 'scheduled' }).sort((a, b) =>
    String(a.schedule?.at).localeCompare(String(b.schedule?.at)),
  );

  if (flags.now) return scheduled.slice(0, Number(flags.count ?? 1));

  const due = scheduled.filter((p) => p.schedule?.at && new Date(p.schedule.at) <= now);
  if (!due.length && scheduled.length) {
    const next = new Date(scheduled[0].schedule.at);
    log.info(c.dim(`  次の投稿予定: ${formatInZone(next, config.posting.timezone)}`));
  }
  return due;
}

function countPostedToday(config, now) {
  const today = localDateString(now, config.posting.timezone);
  return listPosts({ status: 'posted' }).filter(
    (p) => p.publish?.postedAt && localDateString(new Date(p.publish.postedAt), config.posting.timezone) === today,
  ).length;
}
