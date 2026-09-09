import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';

import { weightedLength, hasUrl, truncateWeighted } from '../src/core/text.js';
import { renderBody, renderSourceReply, describeSource } from '../src/core/formatter.js';
import { inspect } from '../src/core/guard.js';
import { zonedToUtc, localDateString } from '../src/core/schedule.js';
import { wrapJapanese } from '../src/core/imagecard.js';
import { scoreSubject } from '../src/core/scorer.js';
import { loadConfig } from '../src/core/config.js';

const config = loadConfig();
const emptyState = { postedSubjects: {}, history: [] };

const subject = {
  id: 'test-person',
  name: 'テスト太郎',
  deathYear: 1990,
  ageAtDeath: 50,
  deathCategory: 'illness',
  causeConfirmed: true,
  sources: ['https://ja.wikipedia.org/wiki/テスト'],
};

const draft = {
  badge: '悲劇',
  hook: '頂点を極めた男が最後にたどり着いたのは、誰もいない部屋だった',
  lead: '導入の一文。',
  sections: [
    { title: '栄光', bullets: ['一番になった', '世界に名が知られた'] },
    { title: 'あまりに静かな最期', bullets: ['1990年に50歳で死去した'] },
  ],
  take: '独自の視点。',
  closing: '締めの一文。',
};

function makePost(overrides = {}) {
  const post = { id: 'p1', subjectId: subject.id, draft, sources: subject.sources, ...overrides };
  post.body = post.body ?? renderBody(post.draft, config);
  return post;
}

/* ---------------- text ---------------- */

test('日本語は2文字、ASCIIは1文字として数える', () => {
  assert.equal(weightedLength('abc'), 3);
  assert.equal(weightedLength('あいう'), 6);
  assert.equal(weightedLength('a あ'), 4);
});

test('URL の検出と省略', () => {
  assert.equal(hasUrl('詳細は https://example.com へ'), true);
  assert.equal(hasUrl('URL は入っていない'), false);
  assert.ok(weightedLength(truncateWeighted('あ'.repeat(100), 40)) <= 40);
});

/* ---------------- formatter ---------------- */

test('本文が参考フォーマットどおりに組み上がる', () => {
  const body = renderBody(draft, config);
  assert.ok(body.startsWith('【悲劇】頂点を極めた男'), body.slice(0, 30));
  assert.ok(body.includes('\n▼栄光\n・一番になった\n・世界に名が知られた'));
  assert.ok(body.includes('▼この話が刺さる理由'));
  assert.ok(body.endsWith('締めの一文。'));
});

test('箇条書きの先頭にある記号は重複させない', () => {
  const body = renderBody({ ...draft, sections: [{ title: 'a', bullets: ['・すでに点が付いている'] }] }, config);
  assert.ok(body.includes('・すでに点が付いている'));
  assert.ok(!body.includes('・・'));
});

test('出典リプライは既定で URL を含めない', () => {
  const reply = renderSourceReply(makePost(), config);
  assert.ok(!hasUrl(reply));
  assert.ok(reply.includes('Wikipedia'));
  assert.equal(describeSource('https://en.wikipedia.org/wiki/Howard_Hughes'), 'Wikipedia「Howard Hughes」');
});

/* ---------------- guard ---------------- */

test('問題のない原稿は通る', () => {
  const v = inspect(makePost(), subject, { config, state: emptyState });
  assert.equal(v.ok, true, v.errors.join(' / '));
});

test('没年のない人物は弾く', () => {
  const v = inspect(makePost(), { ...subject, deathYear: null }, { config, state: emptyState });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('存命')));
});

test('没後が浅い題材は弾く', () => {
  const v = inspect(makePost(), { ...subject, deathYear: new Date().getFullYear() - 1 }, { config, state: emptyState });
  assert.ok(v.errors.some((e) => e.includes('没後')));
});

test('本文の URL を弾く', () => {
  const post = makePost({ body: `${renderBody(draft, config)}\nhttps://example.com` });
  const v = inspect(post, subject, { config, state: emptyState });
  assert.ok(v.errors.some((e) => e.includes('URL')));
});

test('死因が未確定なら断定を許さない', () => {
  const v = inspect(makePost(), { ...subject, causeConfirmed: false }, { config, state: emptyState });
  assert.ok(v.errors.some((e) => e.includes('断定')));

  const hedged = makePost({
    draft: { ...draft, sections: [{ title: '最期', bullets: ['死因は不明とされる'] }] },
  });
  hedged.body = renderBody(hedged.draft, config);
  const v2 = inspect(hedged, { ...subject, causeConfirmed: false }, { config, state: emptyState });
  assert.ok(!v2.errors.some((e) => e.includes('断定')));
});

test('死の手段の具体的な描写を弾く', () => {
  const post = makePost({ body: `${renderBody(draft, config)}\n・彼は首を吊った` });
  const v = inspect(post, subject, { config, state: emptyState });
  assert.ok(v.errors.some((e) => e.includes('手段')));
});

test('自殺の題材には相談窓口が要る', () => {
  const suicideSubject = { ...subject, deathCategory: 'suicide' };
  const without = inspect(makePost(), suicideSubject, { config, state: emptyState });
  assert.ok(without.errors.some((e) => e.includes('相談窓口')));

  const withFooter = makePost({ draft: { ...draft, footer: config.safety.suicideFooter } });
  withFooter.body = renderBody(withFooter.draft, config);
  const v = inspect(withFooter, suicideSubject, { config, state: emptyState });
  assert.ok(!v.errors.some((e) => e.includes('相談窓口')));
});

test('同じ人物を短期間に再投稿させない', () => {
  const state = { postedSubjects: { [subject.id]: new Date().toISOString() }, history: [] };
  const v = inspect(makePost(), subject, { config, state });
  assert.ok(v.errors.some((e) => e.includes('投稿済')));
});

/* ---------------- scorer ---------------- */

test('落差が大きいほどスコアが高い', () => {
  const high = { ...subject, signals: { fame: 10, fallDepth: 10, jpRecognition: 10, gapSurprise: 10, storyClarity: 10 } };
  const low = { ...subject, signals: { fame: 10, fallDepth: 1, jpRecognition: 10, gapSurprise: 1, storyClarity: 10 } };
  assert.ok(scoreSubject(high, { config, state: emptyState }) > scoreSubject(low, { config, state: emptyState }));
});

/* ---------------- schedule ---------------- */

test('JST の時刻を UTC に変換する', () => {
  const utc = zonedToUtc('2026-09-10', '07:30', 'Asia/Tokyo');
  assert.equal(utc.toISOString(), '2026-09-09T22:30:00.000Z');
  assert.equal(localDateString(utc, 'Asia/Tokyo'), '2026-09-10');
});

/* ---------------- 折り返し ---------------- */

test('英数字の並びは途中で改行しない', () => {
  const ctx = createCanvas(400, 100).getContext('2d');
  ctx.font = '30px sans-serif';
  const lines = wrapJapanese(ctx, 'あああああああああ2026年ああ', 200);
  assert.ok(lines.length > 1);
  assert.ok(!lines.some((l) => /^\d+年/.test(l) === false && /\d$/.test(l)));
});
