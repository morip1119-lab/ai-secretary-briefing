import fs from 'node:fs';
import { env } from './config.js';
import { UserError, c, log } from './logger.js';
import { hasUrl } from './text.js';

/** 2026年2月以降の従量課金レート（参考値・変更されうる） */
export const RATES = {
  postCreate: 0.015,
  postCreateWithUrl: 0.2,
  postRead: 0.005,
  contentManage: 0.005,
};

export function estimateCost({ posts = 0, postsWithUrl = 0, reads = 0, mediaUploads = 0 }) {
  return (
    posts * RATES.postCreate +
    postsWithUrl * RATES.postCreateWithUrl +
    reads * RATES.postRead +
    mediaUploads * RATES.contentManage
  );
}

let clientPromise = null;

async function getClient() {
  if (clientPromise) return clientPromise;
  const { creds, missing } = env.xCredentials;
  if (missing.length) {
    throw new UserError(`X の認証情報が足りません: ${missing.join(', ')}\n.env を確認してください。`);
  }
  clientPromise = import('twitter-api-v2').then(({ TwitterApi }) => new TwitterApi(creds));
  return clientPromise;
}

/**
 * 本文（＋画像）を投稿し、出典があればリプライでぶら下げる。
 * DRY_RUN=true の間は API を一切叩かない。
 */
export async function publishPost({ body, imagePath = null, replyText = null, dryRun = env.dryRun }) {
  const bodyHasUrl = hasUrl(body);
  const replyHasUrl = Boolean(replyText) && hasUrl(replyText);
  const withUrl = bodyHasUrl || replyHasUrl;
  const cost = estimateCost({
    posts: (bodyHasUrl ? 0 : 1) + (replyText && !replyHasUrl ? 1 : 0),
    postsWithUrl: (bodyHasUrl ? 1 : 0) + (replyHasUrl ? 1 : 0),
    mediaUploads: imagePath ? 1 : 0,
  });

  if (dryRun) {
    log.warn(c.yellow('DRY_RUN'), '実際には投稿していません');
    log.rule('本文');
    console.log(body);
    if (imagePath) log.info(c.dim(`\n[画像] ${imagePath}`));
    if (replyText) {
      log.rule('リプライ（出典）');
      console.log(replyText);
    }
    log.rule();
    return { dryRun: true, tweetId: null, url: null, estimatedCostUsd: round(cost), withUrl };
  }

  const client = await getClient();
  let mediaIds;
  if (imagePath) {
    if (!fs.existsSync(imagePath)) throw new UserError(`画像が見つかりません: ${imagePath}`);
    const buf = fs.readFileSync(imagePath);
    const mediaId = await client.v2.uploadMedia(buf, { media_type: 'image/png', media_category: 'tweet_image' });
    mediaIds = [mediaId];
  }

  const payload = { text: body };
  if (mediaIds) payload.media = { media_ids: mediaIds };

  const { data } = await client.v2.tweet(payload);
  const result = {
    dryRun: false,
    tweetId: data.id,
    url: `https://x.com/i/web/status/${data.id}`,
    postedAt: new Date().toISOString(),
    estimatedCostUsd: round(cost),
    withUrl,
  };

  if (replyText) {
    try {
      const reply = await client.v2.reply(replyText, data.id);
      result.replyTweetId = reply.data.id;
    } catch (e) {
      log.warn(`出典リプライの投稿に失敗しました（本体は成功）: ${e.message}`);
    }
  }

  return result;
}

/** 投稿の実績を取得する。1件あたり $0.005 の読み取り課金が発生する点に注意。 */
export async function fetchMetrics(tweetIds, { dryRun = env.dryRun } = {}) {
  if (!tweetIds.length) return {};
  if (dryRun) {
    log.warn(c.yellow('DRY_RUN'), `${tweetIds.length} 件のメトリクス取得をスキップしました`);
    return {};
  }
  const client = await getClient();
  const res = await client.v2.tweets(tweetIds, {
    'tweet.fields': ['public_metrics', 'non_public_metrics', 'created_at'],
  });
  const out = {};
  for (const t of res.data ?? []) {
    out[t.id] = {
      ...t.public_metrics,
      ...(t.non_public_metrics ?? {}),
      fetchedAt: new Date().toISOString(),
    };
  }
  return out;
}

export async function whoami() {
  const client = await getClient();
  const me = await client.v2.me();
  return me.data;
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
