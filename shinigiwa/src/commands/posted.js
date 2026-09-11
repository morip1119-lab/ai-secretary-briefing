import { UserError, c, log } from '../core/logger.js';
import { getPost, getSubject } from '../core/store.js';
import { markPosted } from '../core/pipeline.js';

/**
 * 手動で投稿したことを記録する。
 * ここを通さないと重複投稿の判定とスコアの減点が効かないので、投稿したら必ず叩く。
 */
export async function run({ positional, flags }) {
  const id = positional[0];
  if (!id) throw new UserError('原稿 ID を指定してください: node src/cli.js posted <postId> [--url <投稿URL>]');

  const post = getPost(id);
  const subject = getSubject(post.subjectId);
  markPosted(post, subject, { manual: true, url: flags.url ? String(flags.url) : null });

  log.ok(`投稿済みとして記録しました: ${post.subjectName}`);
  if (!flags.url) log.info(c.dim('  --url に投稿URLを渡しておくと、あとで metrics で実績を取れます。'));
}
