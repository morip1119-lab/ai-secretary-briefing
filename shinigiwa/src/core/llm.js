import { env, loadConfig } from './config.js';
import { UserError } from './logger.js';
import { ENV_FILE } from './paths.js';
import { systemPrompt, userPrompt } from './prompt.js';

/**
 * 原稿の「構造」を作る層。
 * provider を差し替えても出力される draft の形は同じなので、
 * 整形（formatter）と検査（guard）から先は共通で動く。
 */
export async function generateDraft(subject, { provider = env.llmProvider, config = loadConfig() } = {}) {
  switch (provider) {
    case 'mock':
      return { draft: fromTemplate(subject, config), meta: { provider: 'mock', model: 'template' } };
    case 'anthropic':
      return callAnthropic(subject, config);
    case 'openai':
      return callOpenAI(subject, config);
    default:
      throw new UserError(`未知の LLM_PROVIDER: ${provider}（mock | anthropic | openai）`);
  }
}

/**
 * 生成の準備ができているかを返す。レビュー画面の注意書きに使う。
 * キーそのものは絶対に返さない（画面や API 経由で漏れるため）。
 */
export function providerStatus(provider = env.llmProvider) {
  if (provider === 'mock') {
    return { provider, ready: true, keyName: null, reason: null };
  }
  if (provider !== 'anthropic' && provider !== 'openai') {
    return { provider, ready: false, keyName: null, reason: `LLM_PROVIDER が ${provider} になっています（mock | anthropic | openai）` };
  }
  const keyName = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  const ready = Boolean(process.env[keyName]);
  return { provider, ready, keyName, reason: ready ? null : `${keyName} が設定されていません` };
}

/* ---------------- テンプレ生成（APIキー不要） ---------------- */

/**
 * subjects.json に構造化して書いた事実をそのまま組み立てる。
 * LLM を使わないぶん創作リスクがゼロなので、運用初期はこちらが安全。
 */
export function fromTemplate(subject, config = loadConfig()) {
  const story = subject.story ?? {};
  const sections = (Array.isArray(story.sections) && story.sections.length
    ? story.sections
    : ['peak', 'fall', 'end'].map((key) => story[key])
  )
    .filter((s) => s && (s.bullets ?? []).length)
    .map((s) => ({ title: s.title, bullets: s.bullets }));

  if (!sections.length) {
    throw new UserError(
      `${subject.id} には story.sections（または story.peak / fall / end）が必要です。` +
        `\nLLM に書かせる場合は .env の LLM_PROVIDER を anthropic か openai にしてください。`,
    );
  }

  return {
    badge: subject.badge ?? config.editorial.badges[0],
    hook: subject.hook ?? `${subject.field}の頂点に立った人物の、あまりに静かな最期`,
    lead: subject.lead ?? '',
    sections,
    take: subject.take ?? '',
    closing: subject.closing ?? '',
    sources: subject.sources ?? [],
  };
}

/* ---------------- Anthropic ---------------- */

async function callAnthropic(subject, config) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw missingKeyError('ANTHROPIC_API_KEY', 'https://console.anthropic.com/');
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: systemPrompt(config),
      messages: [{ role: 'user', content: userPrompt(subject, config) }],
    }),
  });

  if (!res.ok) throw new UserError(`Anthropic API エラー ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = (json.content ?? []).map((b) => b.text ?? '').join('');
  return { draft: parseDraftJson(text, subject), meta: { provider: 'anthropic', model } };
}

/* ---------------- OpenAI ---------------- */

async function callOpenAI(subject, config) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw missingKeyError('OPENAI_API_KEY', 'https://platform.openai.com/api-keys');
  const model = process.env.OPENAI_MODEL || 'gpt-4.1';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(config) },
        { role: 'user', content: userPrompt(subject, config) },
      ],
    }),
  });

  if (!res.ok) throw new UserError(`OpenAI API エラー ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? '';
  return { draft: parseDraftJson(text, subject), meta: { provider: 'openai', model } };
}

/* ---------------- 共通 ---------------- */

/**
 * キーが無いことを伝えるより、どこに何を書けば直るかを伝える。
 * .env は起動時にしか読まれないので、入れ直しが必要なことまで書く。
 */
function missingKeyError(name, issueUrl) {
  return new UserError(
    [
      `${name} が設定されていません。`,
      `1. ${issueUrl} でキーを発行する`,
      `2. ${ENV_FILE} をメモ帳で開き、${name}= の右に貼り付けて保存する`,
      '3. 黒い画面を Ctrl+C で止めて、start をもう一度動かす（.env は起動時にしか読まれません）',
      'キー無しで試すだけなら、.env の LLM_PROVIDER を mock にすると台帳の内容をそのまま組み立てます。',
    ].join('\n'),
    { kind: 'setup' },
  );
}

export function parseDraftJson(text, subject) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new UserError(`LLM の出力を JSON として解釈できませんでした:\n${text.slice(0, 400)}`);
    parsed = JSON.parse(m[0]);
  }

  if (!parsed.hook || !Array.isArray(parsed.sections)) {
    throw new UserError('LLM の出力に hook / sections が含まれていません。');
  }

  // 出典は LLM に作らせない。台帳側の URL を正とする。
  parsed.sources = subject.sources ?? parsed.sources ?? [];
  return parsed;
}
