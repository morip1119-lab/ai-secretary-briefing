import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../core/config.js';
import { c, log } from '../core/logger.js';
import { EXPORT_DIR } from '../core/paths.js';
import { getSubject, listPosts, savePost } from '../core/store.js';
import { sourceReplyFor } from '../core/pipeline.js';
import { renderCard } from '../core/imagecard.js';
import { formatInZone, localDateString } from '../core/schedule.js';

/**
 * 手動で X に貼るための書き出し。
 * 本文はそのままコピペできる .txt、画像は同じ連番の .png で並べる。
 */
export async function run({ flags }) {
  const config = loadConfig();
  const tz = config.posting.timezone;

  const posts = pickPosts(flags);
  if (!posts.length) {
    log.warn('書き出せる原稿がありません。generate → review で承認してから実行してください。');
    return;
  }

  const dir = path.join(EXPORT_DIR, flags.dir ?? localDateString(new Date(), tz));
  fs.mkdirSync(dir, { recursive: true });

  const index = [`# ${config.channel.name} 投稿分（${localDateString(new Date(), tz)}）`, ''];

  posts.forEach((post, i) => {
    const no = String(i + 1).padStart(2, '0');
    const base = `${no}_${post.subjectId}`;
    const subject = getSubject(post.subjectId);

    const reply = sourceReplyFor(post, config);
    const text = [post.body, ...(reply ? ['', '--- ここから下はリプライにぶら下げる ---', '', reply] : [])].join('\n');
    fs.writeFileSync(path.join(dir, `${base}.txt`), `${text}\n`, 'utf8');

    let image = null;
    if (config.image.enabled) {
      image = `${base}.png`;
      const src = post.image?.path;
      if (src && fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, image));
      else renderCard(post, subject, { config, outFile: path.join(dir, image) });
    }

    const when = post.schedule?.at ? formatInZone(new Date(post.schedule.at), tz) : '時刻未定';
    index.push(
      `## ${no}. ${post.subjectName}`,
      '',
      `- 投稿予定: **${when}**`,
      `- 本文: \`${base}.txt\``,
      ...(image ? [`- 画像: \`${image}\``] : []),
      `- 投稿したら: \`node src/cli.js posted ${post.id}\``,
      '',
      '```',
      post.body,
      '```',
      '',
    );

    post.exportedAt = new Date().toISOString();
    savePost(post);
    log.ok(`${when}  ${base}`);
  });

  fs.writeFileSync(path.join(dir, 'README.md'), `${index.join('\n')}\n`, 'utf8');

  log.blank();
  log.info(`  書き出し先: ${c.cyan(dir)}`);
  log.info(c.dim('  一覧は README.md。投稿したら node src/cli.js posted <postId> で記録してください。'));
  log.blank();
}

function pickPosts(flags) {
  if (flags.id) return [listPosts().find((p) => p.id === String(flags.id))].filter(Boolean);
  const statuses = flags.all ? ['approved', 'scheduled'] : ['scheduled'];
  const posts = listPosts({ status: statuses }).sort((a, b) =>
    String(a.schedule?.at ?? a.createdAt).localeCompare(String(b.schedule?.at ?? b.createdAt)),
  );
  return posts.length ? posts : listPosts({ status: 'approved' });
}
