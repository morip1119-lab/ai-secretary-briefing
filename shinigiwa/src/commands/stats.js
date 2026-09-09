import { c, log } from '../core/logger.js';
import { loadMetrics } from '../core/store.js';

/**
 * 何が伸びたのかを見て、次に何を仕込むかを決めるための集計。
 * 感覚ではなく数字でネタの方向性を寄せていく。
 */
export async function run() {
  const { posts } = loadMetrics();
  const rows = Object.entries(posts).map(([id, m]) => ({ id, ...m }));

  if (!rows.length) {
    log.info('まだ実績データがありません。node src/cli.js metrics で取得してください。');
    return;
  }

  log.blank();
  log.rule('伸びた投稿 トップ10');
  const ranked = [...rows].sort((a, b) => (b.impression_count ?? 0) - (a.impression_count ?? 0));
  for (const r of ranked.slice(0, 10)) {
    const imp = r.impression_count ?? 0;
    const eng = (r.like_count ?? 0) + (r.retweet_count ?? 0) + (r.reply_count ?? 0);
    const rate = imp ? ((eng / imp) * 100).toFixed(2) : '–';
    console.log(`  ${String(imp).padStart(8)} imp  ${String(rate).padStart(5)}%  ${r.subjectId}`);
  }

  log.blank();
  log.rule('死因カテゴリ別の平均インプレッション');
  const byCategory = groupBy(rows, (r) => r.deathCategory ?? 'unknown');
  const catRows = Object.entries(byCategory)
    .map(([k, list]) => ({ k, n: list.length, avg: avg(list.map((r) => r.impression_count ?? 0)) }))
    .sort((a, b) => b.avg - a.avg);
  for (const r of catRows) {
    console.log(`  ${r.k.padEnd(12)} ${String(Math.round(r.avg)).padStart(8)} imp  ${c.dim(`(${r.n}件)`)}`);
  }

  log.blank();
  log.rule('時間帯別の平均インプレッション');
  const byHour = groupBy(rows, (r) => new Date(r.postedAt).toISOString().slice(11, 13));
  const hourRows = Object.entries(byHour)
    .map(([k, list]) => ({ k, n: list.length, avg: avg(list.map((r) => r.impression_count ?? 0)) }))
    .sort((a, b) => b.avg - a.avg);
  for (const r of hourRows.slice(0, 8)) {
    console.log(`  ${r.k}:00 UTC  ${String(Math.round(r.avg)).padStart(8)} imp  ${c.dim(`(${r.n}件)`)}`);
  }
  log.blank();
}

function groupBy(rows, fn) {
  return rows.reduce((acc, r) => {
    const k = fn(r);
    (acc[k] ??= []).push(r);
    return acc;
  }, {});
}

function avg(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}
