import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { MEDIA_DIR } from './paths.js';
import { FAMILY, ensureJapaneseFont } from './fonts.js';
import { loadConfig } from './config.js';

const THEMES = {
  noir: {
    bg: '#0a0a0c',
    glow: 'rgba(120, 20, 30, 0.42)',
    accent: '#c0392b',
    text: '#f5f2ee',
    sub: '#9a938c',
    badgeText: '#ffffff',
  },
  ash: {
    bg: '#111418',
    glow: 'rgba(60, 90, 120, 0.35)',
    accent: '#5b7fa6',
    text: '#eef1f4',
    sub: '#8e979f',
    badgeText: '#ffffff',
  },
  sepia: {
    bg: '#14100c',
    glow: 'rgba(150, 110, 40, 0.32)',
    accent: '#b08542',
    text: '#f3ece0',
    sub: '#a1937c',
    badgeText: '#1a1408',
  },
};

// 行頭に来てはいけない文字（簡易禁則処理）
const NO_LINE_START = '、。，．・？！」』）］｝〉》”’ゝゞーぁぃぅぇぉっゃゅょゎヵヶァィゥェォッャュョ:;,.!?)]}';
const NO_LINE_END = '「『（［｛〈《“‘([{';

/**
 * ポストに添える画像を生成する。
 * 他人の写真を使うと権利面が詰むので、既定では文字だけのオリジナルカードを作る。
 */
export function renderCard(post, subject, { config = loadConfig(), outFile = null } = {}) {
  ensureJapaneseFont();

  const cfg = config.image;
  const theme = THEMES[cfg.theme] ?? THEMES.noir;
  const W = cfg.width;
  const H = cfg.height;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  paintBackground(ctx, W, H, theme);

  const margin = Math.round(W * 0.07);
  const badge = post.draft?.badge ?? '悲劇';
  const badgeBottom = drawBadge(ctx, `【${badge}】`, margin, margin, theme, W);

  const footerTop = H - Math.round(margin * 1.1);
  const areaTop = badgeBottom + Math.round(H * 0.04);
  const areaBottom = footerTop - Math.round(H * 0.03);

  // 見出し・区切り線・人物情報をひとかたまりとして縦中央に置く
  const headline = post.draft?.hook ?? subject?.name ?? '';
  const fit = measureAutoFit(ctx, headline, {
    width: W - margin * 2,
    height: areaBottom - areaTop,
    family: FAMILY,
    weight: 'bold',
    maxSize: Math.round(H * 0.098),
    minSize: Math.round(H * 0.048),
    lineHeight: 1.4,
    maxLines: 4,
  });

  const meta = buildMetaLine(subject);
  const metaSize = Math.round(H * 0.04);
  const gapAfterHeadline = Math.round(H * 0.06);
  const gapAfterRule = Math.round(H * 0.055);
  const blockH = fit.height + gapAfterHeadline + 4 + (meta ? gapAfterRule + metaSize : 0);

  let y = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2);

  ctx.font = `bold ${fit.size}px ${FAMILY}`;
  ctx.fillStyle = theme.text;
  let lineY = y + fit.size;
  for (const line of fit.lines) {
    ctx.fillText(line, margin, lineY);
    lineY += fit.size * 1.4;
  }
  y += fit.height + gapAfterHeadline;

  ctx.fillStyle = theme.accent;
  ctx.fillRect(margin, y, Math.round(W * 0.09), 4);

  if (meta) {
    y += gapAfterRule + metaSize;
    ctx.font = `${metaSize}px ${FAMILY}`;
    ctx.fillStyle = theme.sub;
    ctx.fillText(meta, margin, y);
  }

  drawFooter(ctx, W, H, margin, theme, cfg, post);

  const file = outFile ?? path.join(MEDIA_DIR, `${post.id}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
  return file;
}

function paintBackground(ctx, W, H, theme) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.78, H * 0.12, 0, W * 0.78, H * 0.12, W * 0.8);
  glow.addColorStop(0, theme.glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // 走査線でわずかに古い映像の質感を出す
  ctx.fillStyle = 'rgba(255,255,255,0.018)';
  for (let i = 0; i < H; i += 4) ctx.fillRect(0, i, W, 1);
}

function drawBadge(ctx, label, x, y, theme, W) {
  const size = Math.round(W * 0.028);
  ctx.font = `${size}px ${FAMILY}`;
  const w = ctx.measureText(label).width;
  const padX = Math.round(size * 0.55);
  const padY = Math.round(size * 0.42);
  const boxH = size + padY * 2;

  ctx.fillStyle = theme.accent;
  roundRect(ctx, x, y, w + padX * 2, boxH, 6);
  ctx.fill();

  ctx.fillStyle = theme.badgeText;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + padX, y + boxH / 2 + 1);
  ctx.textBaseline = 'alphabetic';

  return y + boxH;
}

function drawFooter(ctx, W, H, margin, theme, cfg, post) {
  const size = Math.round(H * 0.034);
  ctx.font = `${size}px ${FAMILY}`;
  ctx.fillStyle = theme.sub;
  ctx.fillText(cfg.footerText ?? '', margin, H - margin * 0.6);

  if (cfg.showSourceNote && (post.sources ?? []).length) {
    const note = '出典はリプライ欄に記載';
    ctx.font = `${Math.round(H * 0.028)}px ${FAMILY}`;
    const w = ctx.measureText(note).width;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(note, W - margin - w, H - margin * 0.6);
  }
}

function buildMetaLine(subject) {
  if (!subject) return '';
  const parts = [subject.name];
  if (subject.birthYear && subject.deathYear) parts.push(`${subject.birthYear}–${subject.deathYear}`);
  else if (subject.deathYear) parts.push(`没 ${subject.deathYear}`);
  if (subject.ageAtDeath) parts.push(`享年${subject.ageAtDeath}`);
  if (subject.field) parts.push(subject.field);
  return parts.filter(Boolean).join('　/　');
}

/** 指定の箱に収まる最大の文字サイズと、折り返し済みの行を求める */
function measureAutoFit(ctx, text, opts) {
  const weight = opts.weight ? `${opts.weight} ` : '';
  for (let size = opts.maxSize; size >= opts.minSize; size -= 2) {
    ctx.font = `${weight}${size}px ${opts.family}`;
    const lines = wrapJapanese(ctx, text, opts.width);
    const height = (lines.length - 1) * size * opts.lineHeight + size;
    if (lines.length <= opts.maxLines && height <= opts.height) return { size, lines, height };
  }

  const size = opts.minSize;
  ctx.font = `${weight}${size}px ${opts.family}`;
  const lines = wrapJapanese(ctx, text, opts.width).slice(0, opts.maxLines);
  if (lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
  return { size, lines, height: (lines.length - 1) * size * opts.lineHeight + size };
}

/** 分割してはいけない塊（英数字・URL的な並び）を 1 トークンとして扱う */
function tokenize(text) {
  return String(text).match(/[A-Za-z0-9]+(?:[.,][A-Za-z0-9]+)*|[\s\S]/g) ?? [];
}

/** 日本語向けの折り返し（任意位置で改行しつつ簡易禁則を適用） */
export function wrapJapanese(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const token of tokenize(paragraph)) {
      const candidate = line + token;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        if (NO_LINE_START.includes(token)) {
          lines.push(candidate); // 行頭に置けない記号はぶら下げる
          line = '';
          continue;
        }
        if (NO_LINE_END.includes(line[line.length - 1])) {
          const moved = line[line.length - 1];
          lines.push(line.slice(0, -1));
          line = moved + token;
          continue;
        }
        lines.push(line);
        line = token;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
