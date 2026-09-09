import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, '..', '..');
export const CONFIG_FILE = path.join(ROOT, 'config', 'config.json');
export const DATA_DIR = path.join(ROOT, 'data');
export const SUBJECTS_FILE = path.join(DATA_DIR, 'subjects.json');
export const POSTS_DIR = path.join(DATA_DIR, 'posts');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const STATE_FILE = path.join(DATA_DIR, 'state.json');
export const METRICS_FILE = path.join(DATA_DIR, 'metrics.json');
export const FONT_DIR = path.join(ROOT, 'assets', 'fonts');
export const ENV_FILE = path.join(ROOT, '.env');
