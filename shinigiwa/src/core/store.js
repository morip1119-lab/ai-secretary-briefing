import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, MEDIA_DIR, METRICS_FILE, POSTS_DIR, STATE_FILE, SUBJECTS_FILE } from './paths.js';
import { UserError } from './logger.js';

function ensureDirs() {
  for (const d of [DATA_DIR, POSTS_DIR, MEDIA_DIR]) fs.mkdirSync(d, { recursive: true });
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new UserError(`JSON の読み込みに失敗: ${file}\n${e.message}`);
  }
}

function writeJson(file, value) {
  ensureDirs();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/* ---------------- subjects（ネタ台帳） ---------------- */

export function listSubjects() {
  const data = readJson(SUBJECTS_FILE, { subjects: [] });
  return data.subjects ?? [];
}

export function saveSubjects(subjects) {
  writeJson(SUBJECTS_FILE, { subjects });
}

export function getSubject(id) {
  const s = listSubjects().find((x) => x.id === id);
  if (!s) throw new UserError(`subject が見つかりません: ${id}`);
  return s;
}

export function upsertSubject(subject) {
  const all = listSubjects();
  const i = all.findIndex((x) => x.id === subject.id);
  if (i >= 0) all[i] = { ...all[i], ...subject };
  else all.push(subject);
  saveSubjects(all);
  return subject;
}

/* ---------------- posts（原稿） ---------------- */

export function postFile(id) {
  return path.join(POSTS_DIR, `${id}.json`);
}

export function listPosts(filter = {}) {
  ensureDirs();
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.json'));
  let posts = files.map((f) => readJson(path.join(POSTS_DIR, f), null)).filter(Boolean);
  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    posts = posts.filter((p) => statuses.includes(p.status));
  }
  return posts.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function getPost(id) {
  const p = readJson(postFile(id), null);
  if (!p) throw new UserError(`post が見つかりません: ${id}`);
  return p;
}

export function savePost(post) {
  post.updatedAt = new Date().toISOString();
  writeJson(postFile(post.id), post);
  return post;
}

export function deletePost(id) {
  const f = postFile(id);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

/* ---------------- state / metrics ---------------- */

export function loadState() {
  return readJson(STATE_FILE, { postedSubjects: {}, postedCategories: {}, history: [] });
}

export function saveState(state) {
  writeJson(STATE_FILE, state);
}

export function loadMetrics() {
  return readJson(METRICS_FILE, { posts: {} });
}

export function saveMetrics(metrics) {
  writeJson(METRICS_FILE, metrics);
}

export { ensureDirs, readJson, writeJson };
