import fs from 'node:fs';
import { CONFIG_FILE, ENV_FILE } from './paths.js';
import { UserError } from './logger.js';

/** 本物の環境変数として最初から入っていたキー。CI の Secrets を .env で上書きしないための記録。 */
let pristineKeys = null;

/**
 * .env を読み込む（依存を増やさないための最小実装）。
 * 本物の環境変数が入っているものは上書きしない = CI の Secrets が優先される。
 *
 * refresh を立てると、.env の現在の内容で読み直す。
 * キーを貼ったあと起動し直さないと反映されないのは、
 * ターミナルに慣れていない人には理不尽なので、必要な場面で読み直せるようにしてある。
 */
export function loadEnv({ refresh = false } = {}) {
  if (!pristineKeys) {
    pristineKeys = new Set(Object.entries(process.env).filter(([, v]) => v).map(([k]) => k));
  }
  if (!fs.existsSync(ENV_FILE)) return;

  for (const [key, value] of Object.entries(parseEnvFile(fs.readFileSync(ENV_FILE, 'utf8')))) {
    if (pristineKeys.has(key)) continue;
    // 空文字が入っているだけの変数は「未設定」と同じ扱いにする
    if (!refresh && process.env[key]) continue;
    process.env[key] = value;
  }
}

/**
 * KEY=VALUE の羅列を読む。
 *
 * Windows のエディタで編集される前提なので、BOM・CRLF・全角スペースを吸収する。
 * ここで値を trim しないと、行末の空白ひとつで API キーが無言で無効になる。
 */
export function parseEnvFile(raw) {
  const out = {};
  const BLANK = '[ \\t\\u3000]';
  for (const line of String(raw).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^${BLANK}*([A-Za-z_][A-Za-z0-9_]*)${BLANK}*=(.*)$`));
    if (!m) continue;
    let value = m[2].replace(new RegExp(`^${BLANK}+|${BLANK}+$`, 'g'), '');
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    out[m[1]] = value;
  }
  return out;
}

let cached = null;

export function loadConfig() {
  if (cached) return cached;
  if (!fs.existsSync(CONFIG_FILE)) throw new UserError(`config が見つかりません: ${CONFIG_FILE}`);
  cached = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return cached;
}

export const env = {
  get dryRun() {
    const v = (process.env.DRY_RUN ?? 'true').toLowerCase();
    return v !== 'false' && v !== '0';
  },
  get llmProvider() {
    return (process.env.LLM_PROVIDER || 'mock').toLowerCase();
  },
  get reviewPort() {
    return Number(process.env.REVIEW_PORT || 4321);
  },
  get xCredentials() {
    const creds = {
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_SECRET,
    };
    const missing = Object.entries(creds)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    return { creds, missing };
  },
};
