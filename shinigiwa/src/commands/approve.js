import { UserError, c, log } from '../core/logger.js';
import { getPost, getSubject, savePost } from '../core/store.js';
import { refreshPost } from '../core/pipeline.js';

export async function run({ positional, flags, command }) {
  const id = positional[0];
  if (!id) throw new UserError(`原稿 ID を指定してください: node src/cli.js ${command} <postId>`);

  const post = getPost(id);

  if (command === 'reject') {
    post.status = 'rejected';
    post.rejectedReason = flags.reason ?? null;
    savePost(post);
    log.ok(`却下しました: ${id}`);
    return;
  }

  const subject = getSubject(post.subjectId);
  refreshPost(post, subject, { rerender: false });

  if (!post.guard.ok && !flags.force) {
    log.error('検査に通っていないため承認できません:');
    for (const e of post.guard.errors) console.log(`    ${c.red('NG')} ${e}`);
    console.log(c.dim('    どうしても通す場合は --force'));
    process.exitCode = 1;
    return;
  }

  post.status = 'approved';
  post.approvedAt = new Date().toISOString();
  savePost(post);
  log.ok(`承認しました: ${id}`);
  log.info(c.dim('  投稿枠への割り当ては  node src/cli.js queue'));
}
