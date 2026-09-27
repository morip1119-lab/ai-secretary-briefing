import { loadConfig } from '../core/config.js';
import { c, log } from '../core/logger.js';
import { listPosts, savePost } from '../core/store.js';
import { formatInZone, nextSlots } from '../core/schedule.js';

export async function run({ flags }) {
  const config = loadConfig();
  const approved = listPosts({ status: 'approved' });

  if (!approved.length) {
    log.warn('承認済みの原稿がありません。node src/cli.js review で承認してください。');
    showQueue(config);
    return;
  }

  const scheduled = listPosts({ status: 'scheduled' });
  const taken = scheduled.map((p) => p.schedule?.at).filter(Boolean);
  const limit = Number(flags.count ?? approved.length);
  const targets = approved.slice(0, limit);
  const slots = nextSlots(targets.length, { config, taken });

  targets.forEach((post, i) => {
    if (!slots[i]) return;
    post.status = 'scheduled';
    post.schedule = { at: slots[i].toISOString(), timezone: config.posting.timezone };
    savePost(post);
    log.ok(`${formatInZone(slots[i], config.posting.timezone)}  ${post.id}`);
  });

  log.blank();
  showQueue(config);
}

function showQueue(config) {
  const scheduled = listPosts({ status: 'scheduled' }).sort((a, b) =>
    String(a.schedule?.at).localeCompare(String(b.schedule?.at)),
  );
  if (!scheduled.length) return;

  log.rule('投稿待ち');
  const now = new Date();
  for (const p of scheduled) {
    const at = new Date(p.schedule.at);
    const due = at <= now;
    const line = `  ${formatInZone(at, config.posting.timezone)}  ${p.subjectName ?? p.subjectId}`;
    console.log(due ? c.yellow(`${line}  ← 投稿時刻を過ぎています`) : line);
  }
  log.blank();
}
