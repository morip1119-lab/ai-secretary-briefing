import { loadConfig } from './config.js';
import { loadState } from './store.js';

/**
 * 「バズりやすさ」を数値化する。
 *
 * このチャンネルの前提は "成功の高さ × 転落の深さ"。
 * どちらか片方だけ大きくても伸びないので、加算ではなく相乗を効かせている。
 */
export function scoreSubject(subject, { config = loadConfig(), state = null, now = new Date() } = {}) {
  const w = config.scoring.weights;
  const s = subject.signals ?? {};
  const get = (k) => clamp(Number(s[k] ?? 5), 0, 10);

  const fame = get('fame');
  const fallDepth = get('fallDepth');
  const jpRecognition = get('jpRecognition');
  const gapSurprise = get('gapSurprise');
  const storyClarity = get('storyClarity');

  // 頂点と落差の相乗効果。両方 10 なら 100、片方 0 ならほぼ 0。
  const gapCore = (fame * fallDepth) / 10;

  const weighted =
    gapCore * w.fame +
    fallDepth * w.fallDepth +
    jpRecognition * w.jpRecognition +
    gapSurprise * w.gapSurprise +
    storyClarity * w.storyClarity;

  const maxWeighted = 10 * w.fame + 10 * w.fallDepth + 10 * w.jpRecognition + 10 * w.gapSurprise + 10 * w.storyClarity;

  let score = (weighted / maxWeighted) * 100;

  const bonus = config.scoring.categoryBonus[subject.deathCategory] ?? 0;
  score += bonus;

  // 没後が浅い題材は炎上・遺族配慮のリスクが高いので減点しておく
  const yearsSinceDeath = subject.deathYear ? now.getFullYear() - subject.deathYear : 999;
  if (yearsSinceDeath < config.scoring.recencyPenaltyYears) {
    score -= (config.scoring.recencyPenaltyYears - yearsSinceDeath) * 1.5;
  }

  const st = state ?? loadState();
  if (st.postedSubjects?.[subject.id]) score -= config.scoring.usedPenalty;
  if (subject.status === 'used') score -= config.scoring.usedPenalty;

  return Math.round(clamp(score, 0, 130) * 10) / 10;
}

export function rankSubjects(subjects, opts = {}) {
  const state = loadState();
  return subjects
    .map((s) => ({ ...s, score: scoreSubject(s, { ...opts, state }) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * 直近と同じ死因カテゴリが続かないようにする（タイムラインが単調になるのを防ぐ）。
 */
export function filterByRotation(ranked, { config = loadConfig(), state = loadState(), now = new Date() } = {}) {
  const gapDays = config.posting.minGapDaysSameCategory ?? 0;
  if (!gapDays) return ranked;
  const recent = (state.history ?? []).filter((h) => daysBetween(new Date(h.at), now) < gapDays);
  const blocked = new Set(recent.map((h) => h.deathCategory).filter(Boolean));
  const preferred = ranked.filter((s) => !blocked.has(s.deathCategory));
  return preferred.length ? preferred : ranked;
}

function daysBetween(a, b) {
  return Math.abs(b - a) / 86_400_000;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
