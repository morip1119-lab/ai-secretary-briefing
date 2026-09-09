import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';

import { weightedLength, hasUrl, truncateWeighted } from '../src/core/text.js';
import { renderBody, renderSourceReply, describeSource } from '../src/core/formatter.js';
import { inspect } from '../src/core/guard.js';
import { zonedToUtc, localDateString } from '../src/core/schedule.js';
import { wrapJapanese } from '../src/core/imagecard.js';
import { scoreSubject } from '../src/core/scorer.js';
import { parseDraftJson } from '../src/core/llm.js';
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

test('没後が浅い題材は止めずに警告する', () => {
  const recent = { ...subject, deathYear: new Date().getFullYear() - 1, ageAtDeath: null };
  const v = inspect(makePost(), recent, { config, state: emptyState });
  assert.equal(v.errors.length, 0, v.errors.join(' / '));
  assert.ok(v.warnings.some((w) => w.includes('没後')));
});

test('設定で没後年数のブロックを復活できる', () => {
  const strict = { ...config, safety: { ...config.safety, minYearsSinceDeath: 5 } };
  const recent = { ...subject, deathYear: new Date().getFullYear() - 1, ageAtDeath: null };
  const v = inspect(makePost(), recent, { config: strict, state: emptyState });
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

test('相談窓口を空にしてあるので自殺の題材でも要求されない', () => {
  assert.equal(config.safety.suicideFooter, '');
  const v = inspect(makePost(), { ...subject, deathCategory: 'suicide' }, { config, state: emptyState });
  assert.ok(!v.errors.some((e) => e.includes('相談窓口')));
});

test('相談窓口を設定した場合は付与を強制する', () => {
  const footer = '※ 相談窓口のテキスト';
  const withPolicy = { ...config, safety: { ...config.safety, suicideFooter: footer } };
  const suicideSubject = { ...subject, deathCategory: 'suicide' };

  const without = inspect(makePost(), suicideSubject, { config: withPolicy, state: emptyState });
  assert.ok(without.errors.some((e) => e.includes('相談窓口')));

  const withFooter = makePost({ draft: { ...draft, footer } });
  withFooter.body = renderBody(withFooter.draft, withPolicy);
  const v = inspect(withFooter, suicideSubject, { config: withPolicy, state: emptyState });
  assert.ok(!v.errors.some((e) => e.includes('相談窓口')));
});

test('台帳に無い年号・食い違う年齢を警告する', () => {
  const post = makePost({
    draft: { ...draft, sections: [{ title: '最期', bullets: ['2015年に事件が起きた', '享年70で世を去った'] }] },
  });
  post.body = renderBody(post.draft, config);
  const v = inspect(post, { ...subject, birthYear: 1940 }, { config, state: emptyState });
  assert.ok(v.warnings.some((w) => w.includes('2015')), v.warnings.join(' / '));
  assert.ok(v.warnings.some((w) => w.includes('享年')));
});

test('台帳自体の生没年と享年の矛盾を検出する', () => {
  const broken = { ...subject, birthYear: 1940, deathYear: 1990, ageAtDeath: 80 };
  const v = inspect(makePost(), broken, { config, state: emptyState });
  assert.ok(v.warnings.some((w) => w.includes('矛盾')));
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

test('最近の死ほどスコアが高い', () => {
  const year = new Date().getFullYear();
  const recent = { ...subject, deathYear: year - 2 };
  const old = { ...subject, deathYear: year - 80 };
  assert.ok(scoreSubject(recent, { config, state: emptyState }) > scoreSubject(old, { config, state: emptyState }));
});

/* ---------------- LLM の出力の取り込み ---------------- */

test('コードフェンスや前置きが付いた JSON も読める', () => {
  const payload = { hook: 'フック', sections: [{ title: 'a', bullets: ['b'] }] };
  const wrapped = '```json\n' + JSON.stringify(payload) + '\n```';
  assert.deepEqual(parseDraftJson(wrapped, subject).sections, payload.sections);

  const chatty = `はい、作成しました。\n${JSON.stringify(payload)}\nご確認ください。`;
  assert.equal(parseDraftJson(chatty, subject).hook, 'フック');
});

test('出典は LLM の出力ではなく台帳を正とする', () => {
  const payload = { hook: 'フック', sections: [{ title: 'a', bullets: ['b'] }], sources: ['https://捏造.example'] };
  assert.deepEqual(parseDraftJson(JSON.stringify(payload), subject).sources, subject.sources);
});

test('hook や sections が欠けた出力は拒否する', () => {
  assert.throws(() => parseDraftJson('{"hook":"あるだけ"}', subject));
  assert.throws(() => parseDraftJson('これは JSON ではない', subject));
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
