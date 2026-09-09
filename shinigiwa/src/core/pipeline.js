import { loadConfig } from './config.js';
import { renderBody, renderSourceReply } from './formatter.js';
import { generateDraft } from './llm.js';
import { inspect } from './guard.js';
import { renderCard } from './imagecard.js';
import { savePost } from './store.js';

/**
 * 生成 → 整形 → 検査 → 画像 の一本道。
 * CLI からもレビュー UI からも同じ経路を通す。
 */
export async function buildPost(subject, { config = loadConfig(), provider, withImage = null, date = new Date() } = {}) {
  const { draft, meta } = await generateDraft(subject, { provider, config });

  if (subject.deathCategory === 'suicide' && config.safety.suicidePolicy === 'hedged' && config.safety.suicideFooter) {
    draft.footer = config.safety.suicideFooter;
  }

  const id = buildId(subject, date);
  const post = {
    id,
    subjectId: subject.id,
    subjectName: subject.name,
    deathCategory: subject.deathCategory,
    status: 'draft',
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
    generator: meta,
    draft,
    sources: subject.sources ?? [],
    body: '',
    image: null,
    schedule: null,
    publish: null,
    guard: null,
  };

  post.body = renderBody(draft, config);
  post.guard = inspect(post, subject, { config, now: date });

  const wantImage = withImage ?? config.image.enabled;
  if (wantImage && post.guard.ok) {
    post.image = { path: renderCard(post, subject, { config }), generatedAt: new Date().toISOString() };
  }

  savePost(post);
  return post;
}

/** 本文を人力で直したあとに整合性を取り直す */
export function refreshPost(post, subject, { config = loadConfig(), rerender = true, regenerateImage = false } = {}) {
  if (rerender) post.body = renderBody(post.draft, config);
  post.guard = inspect(post, subject, { config });
  if (regenerateImage && config.image.enabled) {
    post.image = { path: renderCard(post, subject, { config }), generatedAt: new Date().toISOString() };
  }
  return savePost(post);
}

export function sourceReplyFor(post, config = loadConfig()) {
  if (!config.posting.sourceReply) return null;
  return renderSourceReply(post, config);
}

function buildId(subject, date) {
  const d = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6);
  return `${d}-${subject.id}-${rand}`;
}
