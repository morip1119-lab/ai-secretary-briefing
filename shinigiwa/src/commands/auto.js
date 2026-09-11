import { loadConfig } from '../core/config.js';
import { c, log } from '../core/logger.js';
import { listPosts } from '../core/store.js';
import { run as generate } from './generate.js';
import { run as queue } from './queue.js';
import { run as publish } from './publish.js';
import { run as exportPosts } from './export.js';

/**
 * cron から 1 コマンドで回すための入口。
 * 「在庫を補充 → 枠に入れる → 出す」を順に実行する。
 * manual モードでは最後が「X に投稿」ではなく「手動で貼れる形に書き出し」になる。
 */
export async function run({ flags }) {
  const config = loadConfig();
  const buffer = Number(flags.buffer ?? config.posting.queueBufferDays ?? 2);
  const want = Math.ceil(config.posting.postsPerDay * buffer);

  const stock = listPosts({ status: ['approved', 'scheduled'] }).length;
  const shortage = Math.max(0, want - stock);

  log.blank();
  log.step(`在庫 ${stock} 本 / 目標 ${want} 本`);

  if (shortage) {
    await generate({ flags: { count: shortage } });
  } else {
    log.info(c.dim('  在庫は足りているので生成をスキップします'));
  }

  await queue({ flags: {} });

  if (config.posting.mode === 'manual') await exportPosts({ flags: {} });
  else await publish({ flags: {} });
}
