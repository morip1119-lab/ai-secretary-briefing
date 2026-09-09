/**
 * X の文字数カウント（twitter-text の weighted length 準拠）。
 * 下記レンジは 1 文字、それ以外（日本語など）は 2 文字として数えられる。
 */
const WEIGHT_1_RANGES = [
  [0x0000, 0x10ff],
  [0x2000, 0x200d],
  [0x2010, 0x201f],
  [0x2032, 0x2037],
];

export function weightedLength(text) {
  let total = 0;
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    const light = WEIGHT_1_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
    total += light ? 1 : 2;
  }
  return total;
}

/** X 上でリンクは一律 23 文字換算になる点を踏まえた概算 */
export function weightedLengthWithUrls(text) {
  const urls = text.match(URL_RE) || [];
  const withoutUrls = text.replace(URL_RE, '');
  return weightedLength(withoutUrls) + urls.length * 23;
}

export const URL_RE = /https?:\/\/[^\s]+/g;

export function hasUrl(text) {
  URL_RE.lastIndex = 0;
  return URL_RE.test(text);
}

export function truncateWeighted(text, limit) {
  if (weightedLength(text) <= limit) return text;
  let out = '';
  let total = 0;
  for (const ch of text) {
    const add = weightedLength(ch);
    if (total + add > limit - 2) break;
    out += ch;
    total += add;
  }
  return `${out}…`;
}

/** 全角スペース・連続改行などの掃除 */
export function tidy(text) {
  return String(text)
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function pickRange([min, max], rand = Math.random) {
  if (max === undefined) return min;
  return min + Math.floor(rand() * (max - min + 1));
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
