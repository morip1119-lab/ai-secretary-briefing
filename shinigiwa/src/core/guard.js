import { loadConfig } from './config.js';
import { loadState } from './store.js';
import { hasUrl, weightedLength } from './text.js';

const HEDGE_WORDS = ['とされる', 'とされて', 'と報じ', 'と伝えられ', 'との見方', '公式には', '推定', 'と言われ', 'された とみられ', 'とみられ'];

/**
 * 投稿前の門番。
 *
 * このジャンルは「事実の扱い」を間違えると一発でアカウントが飛ぶ。
 * errors が 1 つでもあれば投稿させない。warnings は人間が判断する。
 */
export function inspect(post, subject, { config = loadConfig(), state = null, now = new Date() } = {}) {
  const errors = [];
  const warnings = [];
  const s = config.safety;
  const body = post.body ?? '';
  const st = state ?? loadState();

  /* ---- 人物の適格性 ---- */
  if (s.blockLivingPeople && !subject?.deathYear) {
    errors.push('存命（または没年不明）の人物は扱えません。deathYear を設定してください。');
  }

  if (subject?.deathYear) {
    const years = now.getFullYear() - subject.deathYear;
    if (years < s.minYearsSinceDeath) {
      errors.push(`没後 ${years} 年です。遺族配慮のため没後 ${s.minYearsSinceDeath} 年未満は対象外にしています。`);
    } else if (years < s.minYearsSinceDeath + 5) {
      warnings.push(`没後 ${years} 年とまだ新しい題材です。表現が過度に煽っていないか目視してください。`);
    }
  }

  /* ---- 出典 ---- */
  const sources = post.sources ?? subject?.sources ?? [];
  if (sources.length < (s.requireSources ?? 1)) {
    errors.push(`出典が ${sources.length} 件です。最低 ${s.requireSources} 件必要です。`);
  }

  /* ---- 死因の断定 ---- */
  if (s.requireHedgeForUnconfirmedCause && subject?.causeConfirmed === false) {
    const hedged = HEDGE_WORDS.some((w) => body.includes(w));
    if (!hedged) {
      errors.push('死因が公式に確定していない題材です。「〜とされる」「〜と報じられた」など断定を避ける表現を入れてください。');
    }
  }

  /* ---- 自殺の取り扱い（WHO の報道ガイドライン準拠） ---- */
  const isSuicide = subject?.deathCategory === 'suicide';
  for (const p of s.methodDetailPatterns ?? []) {
    if (body.includes(p)) {
      errors.push(`死の手段を具体的に描写する表現が含まれています: 「${p}」。方法の詳細は書かない方針です。`);
    }
  }
  if (isSuicide) {
    if (s.suicidePolicy === 'block') errors.push('設定により自殺の題材はブロックされています。');
    if (s.suicidePolicy === 'hedged' && s.suicideFooter && !body.includes(s.suicideFooter)) {
      errors.push('自殺を扱う投稿には相談窓口のフッターが必要です（generate 時に自動付与されます）。');
    }
    if (/救われた|美しい|かっこい|潔い/.test(body)) {
      warnings.push('自殺を肯定的・美化するニュアンスの語が含まれている可能性があります。');
    }
  }

  /* ---- 名誉毀損・断定リスク ---- */
  for (const p of s.bannedPhrases ?? []) {
    if (body.includes(p)) warnings.push(`断定的・攻撃的になりやすい語が含まれています: 「${p}」`);
  }

  /* ---- X のフォーマット制約 ---- */
  const weighted = weightedLength(body);
  if (weighted > config.posting.charLimit) {
    errors.push(`本文が ${weighted} 文字相当で上限 ${config.posting.charLimit} を超えています。`);
  }
  if (config.posting.charLimitMode !== 'premium' && weighted > 280) {
    errors.push('280文字相当を超えています。長文ポストを出すには X Premium が必要です（config の charLimitMode）。');
  }
  if (!config.posting.allowUrlInBody && hasUrl(body)) {
    errors.push('本文に URL が含まれています（リーチ低下 + API 課金 $0.20/件 のため禁止設定）。出典はリプライに回してください。');
  }

  /* ---- 重複投稿 ---- */
  const lastUsed = st.postedSubjects?.[post.subjectId];
  if (lastUsed) {
    const days = Math.floor((now - new Date(lastUsed)) / 86_400_000);
    if (days < (config.posting.minGapDaysSameSubject ?? 0)) {
      errors.push(`同じ人物を ${days} 日前に投稿済みです（最低 ${config.posting.minGapDaysSameSubject} 日空ける設定）。`);
    }
  }

  /* ---- 原稿の質 ---- */
  const sections = post.draft?.sections ?? [];
  if (sections.length < 2) warnings.push('セクションが 2 つ未満です。物語の起伏が足りない可能性があります。');
  if (!post.draft?.hook || weightedLength(post.draft.hook) < 30) {
    warnings.push('フック（1行目）が短すぎます。ここでスクロールを止められるかが全てです。');
  }
  if (!/最期|最後|幕切れ|死|享年/.test(body)) {
    warnings.push('「最期」に触れている記述が見当たりません。チャンネルの軸がぼけていないか確認してください。');
  }
  if (config.editorial.originalTake && !post.draft?.take) {
    warnings.push('独自の視点（この話が刺さる理由）がありません。X の収益化はオリジナリティを評価するため入れた方が有利です。');
  }

  return { ok: errors.length === 0, errors, warnings, checkedAt: new Date().toISOString(), weighted };
}
