import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { env, loadConfig } from '../core/config.js';
import { UserError, c, log } from '../core/logger.js';
import { MEDIA_DIR } from '../core/paths.js';
import { getPost, getSubject, listPosts, listSubjects, savePost } from '../core/store.js';
import { rankSubjects } from '../core/scorer.js';
import { buildPost, markPosted, refreshPost, sourceReplyFor } from '../core/pipeline.js';
import { bodyStats } from '../core/formatter.js';
import { renderCard } from '../core/imagecard.js';
import { inspect } from '../core/guard.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export function startServer({ port = env.reviewPort, open = false } = {}) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      // 原稿ファイルを消したあとに古い画面から操作された場合など、原因が利用者側にあるものは 404 で返す
      if (e instanceof UserError) return json(res, 404, { error: `${e.message}（画面を再読込してください）` });
      log.error(e.stack ?? e.message);
      json(res, 500, { error: e.message });
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', (e) => {
      if (e.code !== 'EADDRINUSE') return reject(e);
      reject(
        new UserError(
          [
            `ポート ${port} はすでに使われています。`,
            '  別のウィンドウで起動済みなら、そちらのブラウザをそのまま使ってください。',
            `  同時に動かしたい場合は  node src/cli.js review --port ${port + 1}`,
          ].join('\n'),
        ),
      );
    });

    server.listen(port, '127.0.0.1', () => {
      const url = `http://localhost:${port}`;
      log.blank();
      log.ok(`レビュー画面: ${c.cyan(url)}`);
      log.info(c.dim('  ブラウザが開かない場合は、上の URL をコピーして開いてください'));
      log.info(c.dim('  終了するときは Ctrl+C（この画面を閉じても止まります）'));
      log.blank();
      if (open) openBrowser(url);
      resolve(server);
    });
  });
}

/** 既定のブラウザで開く。開けなくても運用はできるので失敗は無視する。 */
function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* ブラウザが開けないだけなので握りつぶす */
  }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
  }

  if (req.method === 'GET' && pathname.startsWith('/media/')) {
    const file = path.join(MEDIA_DIR, path.basename(pathname));
    if (!fs.existsSync(file)) return json(res, 404, { error: 'not found' });
    return sendFile(res, file);
  }

  if (req.method === 'GET' && pathname === '/api/state') {
    const config = loadConfig();
    return json(res, 200, {
      config: { channel: config.channel, posting: config.posting, image: config.image },
      dryRun: env.dryRun,
      provider: env.llmProvider,
      posts: listPosts().map(decorate),
      subjects: rankSubjects(listSubjects()).slice(0, 40),
    });
  }

  if (req.method === 'POST' && pathname === '/api/generate') {
    const body = await readBody(req);
    const config = loadConfig();
    const created = [];
    if (body.subjectId) {
      created.push(await buildPost(getSubject(body.subjectId), { config }));
    } else {
      const pending = new Set(listPosts({ status: ['draft', 'approved', 'scheduled'] }).map((p) => p.subjectId));
      const ranked = rankSubjects(listSubjects().filter((s) => s.status !== 'used' && !pending.has(s.id)));
      for (const s of ranked.slice(0, Number(body.count ?? 1))) created.push(await buildPost(s, { config }));
    }
    return json(res, 200, { created: created.map(decorate) });
  }

  const postMatch = pathname.match(/^\/api\/posts\/([^/]+)(?:\/(\w+))?$/);
  if (postMatch && req.method === 'POST') {
    const [, id, action] = postMatch;
    const post = getPost(decodeURIComponent(id));
    const subject = getSubject(post.subjectId);
    const config = loadConfig();
    const body = await readBody(req);

    switch (action) {
      case undefined: {
        if (typeof body.body === 'string') {
          post.body = body.body;
          post.bodyEdited = true;
        }
        if (body.draft) {
          post.draft = { ...post.draft, ...body.draft };
          if (!post.bodyEdited) refreshPost(post, subject, { config, rerender: true });
        }
        post.guard = inspect(post, subject, { config });
        savePost(post);
        return json(res, 200, decorate(post));
      }
      case 'approve': {
        post.guard = inspect(post, subject, { config });
        if (!post.guard.ok && !body.force) return json(res, 400, { error: '検査に通っていません', guard: post.guard });
        post.status = 'approved';
        post.approvedAt = new Date().toISOString();
        savePost(post);
        return json(res, 200, decorate(post));
      }
      case 'reject': {
        post.status = 'rejected';
        post.rejectedReason = body.reason ?? null;
        savePost(post);
        return json(res, 200, decorate(post));
      }
      case 'posted': {
        markPosted(post, subject, { manual: true, url: body.url ?? null });
        return json(res, 200, decorate(post));
      }
      case 'image': {
        const cfg = structuredClone(config);
        if (body.theme) cfg.image.theme = body.theme;
        const file = renderCard(post, subject, { config: cfg });
        post.image = { path: file, generatedAt: new Date().toISOString(), theme: cfg.image.theme };
        savePost(post);
        return json(res, 200, decorate(post));
      }
      default:
        return json(res, 404, { error: 'unknown action' });
    }
  }

  return json(res, 404, { error: 'not found' });
}

function decorate(post) {
  const config = loadConfig();
  return {
    ...post,
    stats: bodyStats(post.body ?? ''),
    imageUrl: post.image?.path ? `/media/${path.basename(post.image.path)}?v=${Date.parse(post.image.generatedAt)}` : null,
    sourceReply: sourceReplyFor(post, config),
  };
}

function sendFile(res, file) {
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

function json(res, status, payload) {
  const buf = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (ch) => chunks.push(ch));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
