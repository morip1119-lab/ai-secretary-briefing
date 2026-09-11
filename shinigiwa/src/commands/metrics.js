import { c, log } from '../core/logger.js';
import { listPosts, loadMetrics, saveMetrics } from '../core/store.js';
import { estimateCost, fetchMetrics } from '../core/xclient.js';

export async function run({ flags }) {
  const posted = listPosts({ status: 'posted' }).filter((p) => p.publish?.tweetId);
  if (!posted.length) {
    log.info('実績を取得できる投稿がまだありません。');
    return;
  }

  const maxAgeDays = Number(flags.days ?? 30);
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const targets = posted.filter((p) => new Date(p.publish.postedAt).getTime() >= cutoff);
  const ids = targets.map((p) => p.publish.tweetId);

  log.warn(`${ids.length} 件を取得します。読み取り課金の概算 $${estimateCost({ reads: ids.length }).toFixed(3)}`);

  const metrics = loadMetrics();
  const fetched = await fetchMetrics(ids);

  for (const post of targets) {
    const m = fetched[post.publish.tweetId];
    if (!m) continue;
    metrics.posts[post.id] = {
      tweetId: post.publish.tweetId,
      subjectId: post.subjectId,
      deathCategory: post.deathCategory,
      postedAt: post.publish.postedAt,
      ...m,
    };
  }
  saveMetrics(metrics);

  log.ok(`${Object.keys(fetched).length} 件の実績を保存しました`);
  log.info(c.dim('  集計は  node src/cli.js stats'));
}
