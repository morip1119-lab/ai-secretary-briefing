import fs from 'node:fs';
import { CONFIG_FILE, ENV_FILE } from './paths.js';
import { UserError } from './logger.js';

/**
 * .env を読み込む（依存を増やさないための最小実装）。
 * 既に process.env にある値は上書きしない = CI の Secrets が優先される。
 */
export function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const raw = fs.readFileSync(ENV_FILE, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
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
