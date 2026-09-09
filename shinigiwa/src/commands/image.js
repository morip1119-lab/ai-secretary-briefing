import { loadConfig } from '../core/config.js';
import { UserError, log } from '../core/logger.js';
import { getPost, getSubject, savePost } from '../core/store.js';
import { renderCard } from '../core/imagecard.js';

export async function run({ positional, flags }) {
  const id = positional[0];
  if (!id) throw new UserError('原稿 ID を指定してください: node src/cli.js image <postId> [--theme noir|ash|sepia]');

  const config = structuredClone(loadConfig());
  if (flags.theme) config.image.theme = flags.theme;

  const post = getPost(id);
  const subject = getSubject(post.subjectId);
  const file = renderCard(post, subject, { config });
  post.image = { path: file, generatedAt: new Date().toISOString(), theme: config.image.theme };
  savePost(post);

  log.ok(`画像を生成しました: ${file}`);
}
