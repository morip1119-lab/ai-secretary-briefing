/** タイムゾーン計算（依存を増やさず Intl だけで済ませる） */

function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** その TZ における YYYY-MM-DD */
export function localDateString(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** 「JST の 2026-09-10 07:30」を UTC の Date に変換する */
export function zonedToUtc(ymd, hhmm, timeZone) {
  const guess = new Date(`${ymd}T${hhmm}:00Z`);
  return new Date(guess.getTime() - tzOffsetMs(guess, timeZone));
}

export function formatInZone(date, timeZone) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * 未使用のスロットを日付順に返す。
 * 全員が同じ分秒に投稿すると機械的に見えるので jitter を足す。
 */
export function nextSlots(count, { config, from = new Date(), taken = [] }) {
  const tz = config.posting.timezone;
  const slots = config.posting.slots.slice(0, Math.max(1, config.posting.maxPostsPerDay));
  const jitter = config.posting.jitterMinutes ?? 0;
  const takenKeys = new Set(taken.map((t) => new Date(t).toISOString().slice(0, 16)));

  const out = [];
  for (let dayOffset = 0; out.length < count && dayOffset < 60; dayOffset += 1) {
    const day = new Date(from.getTime() + dayOffset * 86_400_000);
    const ymd = localDateString(day, tz);
    for (const hhmm of slots) {
      if (out.length >= count) break;
      const base = zonedToUtc(ymd, hhmm, tz);
      if (base <= from) continue;
      const shifted = new Date(base.getTime() + Math.round((Math.random() * 2 - 1) * jitter) * 60_000);
      const key = shifted.toISOString().slice(0, 16);
      if (takenKeys.has(key)) continue;
      takenKeys.add(key);
      out.push(shifted);
    }
  }
  return out;
}
