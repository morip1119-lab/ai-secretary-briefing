import { listSubjects } from '../core/store.js';
import { rankSubjects } from '../core/scorer.js';
import { c, log } from '../core/logger.js';

export async function run({ flags }) {
  const all = listSubjects();
  const ranked = rankSubjects(all);
  const top = flags.all ? ranked : ranked.slice(0, Number(flags.top ?? 20));

  log.blank();
  console.log(c.bold(`  ネタ台帳  ${all.length} 件（スコア順）`));
  log.blank();
  console.log(c.dim('  score  id                          人物                 没年  カテゴリ    状態'));

  for (const s of top) {
    const line = [
      String(s.score).padStart(6),
      '  ',
      s.id.padEnd(28).slice(0, 28),
      pad(s.name, 24),
      String(s.deathYear ?? '-').padEnd(6),
      pad(s.deathCategory ?? '-', 12),
      s.status ?? 'idea',
    ].join('');
    console.log(s.score >= 70 ? c.bold(line) : line);
  }

  log.blank();
  const ready = ranked.filter((s) => s.status !== 'used').length;
  console.log(c.dim(`  未使用 ${ready} 件 / 使用済み ${all.length - ready} 件`));
  log.blank();
}

/** 全角を2幅として整形する（はみ出す場合は詰める） */
function pad(s, width) {
  let out = '';
  let w = 0;
  for (const ch of String(s ?? '')) {
    const cw = ch.codePointAt(0) > 0x2000 ? 2 : 1;
    if (w + cw > width - 1) {
      out += '…';
      w += 1;
      break;
    }
    out += ch;
    w += cw;
  }
  return out + ' '.repeat(Math.max(1, width - w));
}
