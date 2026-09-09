import { loadConfig } from './config.js';
import { tidy, weightedLength } from './text.js';

/**
 * 構造化された draft を X のポスト本文に組み立てる。
 *
 * 生成器（LLM でもテンプレでも）は「構造」だけを出し、
 * 見た目の整形は必ずここを通す。こうしておくとフォーマットの微調整が一箇所で済む。
 */
export function renderBody(draft, config = loadConfig()) {
  const ed = config.editorial;
  const blocks = [];

  const badge = draft.badge ? `【${draft.badge}】` : '';
  blocks.push(`${badge}${draft.hook}`.trim());

  if (draft.lead) blocks.push(tidy(draft.lead));

  for (const section of draft.sections ?? []) {
    const lines = [`${ed.sectionHeadPrefix}${section.title}`];
    for (const b of section.bullets ?? []) lines.push(`${ed.bulletPrefix}${cleanBullet(b)}`);
    blocks.push(lines.join('\n'));
  }

  if (ed.originalTake && draft.take) {
    blocks.push(`${ed.originalTakeHeading}\n${ed.bulletPrefix}${cleanBullet(draft.take)}`);
  }

  if (ed.closingLine && draft.closing) blocks.push(tidy(draft.closing));

  if (draft.footer) blocks.push(tidy(draft.footer));

  const tags = (ed.hashtags ?? []).filter(Boolean);
  if (tags.length) blocks.push(tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' '));

  return tidy(blocks.join('\n\n'));
}

/**
 * 出典はリプライにぶら下げる。
 * URL をそのまま書くとリーチが落ちるうえ API 課金が 1 投稿 $0.20 に跳ねるので、
 * 既定では媒体名だけを書き、URL は載せない。
 */
export function renderSourceReply(post, config = loadConfig()) {
  const sources = post.sources ?? [];
  if (!sources.length) return null;
  const withUrls = config.posting.sourceReplyIncludeUrls === true;
  const head = `出典・参考（${config.channel.name}）`;
  const list = sources.map((s, i) => {
    const url = typeof s === 'string' ? s : s.url;
    const title = typeof s === 'string' ? null : s.title;
    return `${i + 1}. ${withUrls ? [title, url].filter(Boolean).join(' ') : title ?? describeSource(url)}`;
  });
  return tidy([head, ...list].join('\n'));
}

/** URL を「Wikipedia「Howard Hughes」」のような表示名に変換する */
export function describeSource(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '').replace(/_/g, ' ');
    if (host.endsWith('wikipedia.org')) return last ? `Wikipedia「${last}」` : 'Wikipedia';
    return last ? `${host}「${last}」` : host;
  } catch {
    return String(url);
  }
}

function cleanBullet(b) {
  return String(b)
    .replace(/^[・\-*\s]+/, '')
    .replace(/\s+$/, '')
    .trim();
}

export function bodyStats(body) {
  return {
    chars: [...body].length,
    weighted: weightedLength(body),
    lines: body.split('\n').length,
  };
}
