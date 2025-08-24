/**
 * File: src/lib/ratelimit.js
 * Purpose: ioredis tabanlı rate limit (+ güvenli memory fallback).
 *
 * Security Docblock (Cabo PROD):
 * - Redis bağlantısı LAZY (import anında bağlanmaz). Build ortamında DNS/bağlantı denenmez.
 * - Env: REDIS_URL (redis://:pass@host:port veya rediss://…)
 * - Redis yoksa ya da bağlanamazsa memory fallback devreye girer (build ve arıza anında servis kesilmesin).
 * - Error event yakalanır; “Unhandled error event” log spam’i engellenir.
 */

import Redis from "ioredis";

let redis = null;
let redisReady = false;
let warnedOnce = false;

function warnOnce(msg) {
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(`[ratelimit] ${msg}`);
  }
}

function getEnvRedisUrl() {
  // Railway/Vercel fark etmeksizin tek değişken kullanalım
  return process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || "";
}

function createRedis() {
  if (typeof window !== "undefined") return null; // client tarafında asla
  const url = getEnvRedisUrl();
  if (!url) {
    warnOnce("REDIS_URL yok; memory fallback kullanılacak.");
    return null;
  }
  try {
    const useTLS = url.startsWith("rediss://");
    const client = new Redis(url, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 2,
      tls: useTLS ? {} : undefined,
      retryStrategy: () => 1000, // kısa backoff
      reconnectOnError: () => false,
    });
    client.on("error", () => {
      // Ayrıntılı log istersen console.debug kullan.
    });
    return client;
  } catch {
    warnOnce("Redis client oluşturulamadı; memory fallback.");
    return null;
  }
}

async function ensureRedis() {
  if (redisReady) return redis;
  if (!redis) redis = createRedis();
  if (!redis) return null;
  try {
    if (redis.status === "end" || redis.status === "wait") {
      await redis.connect();
    } else if (redis.status === "ready") {
      // hazır
    } else if (redis.status === "connecting") {
      // bekle
    } else if (redis.options?.lazyConnect) {
      await redis.connect();
    }
    redisReady = redis.status === "ready";
    if (!redisReady) warnOnce("Redis hazır değil; memory fallback devreye giriyor.");
    return redisReady ? redis : null;
  } catch {
    warnOnce("Redis'e bağlanılamadı (DNS/ENOTFOUND?). Memory fallback.");
    return null;
  }
}

/* -------- Memory fallback (token bucket) -------- */
const memBuckets = new Map(); // key -> { count, resetAt }

function memCheck({ key, limit, windowMs }) {
  const now = Date.now();
  const entry = memBuckets.get(key);
  if (!entry || entry.resetAt <= now) {
    memBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, resetMs: windowMs };
  }
  entry.count += 1;
  const ok = entry.count <= limit;
  const resetMs = Math.max(entry.resetAt - now, 0);
  return { ok, resetMs };
}

/* -------- Public API -------- */

/**
 * checkRateLimit({ key, limit, windowMs })
 * Returns: { ok:boolean, resetMs:number }
 */
export async function checkRateLimit({ key, limit, windowMs }) {
  const client = await ensureRedis();
  if (!client) {
    return memCheck({ key, limit, windowMs });
  }

  const ttlSec = Math.ceil(windowMs / 1000);
  try {
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, ttlSec);

    let pttl = await client.pttl(key); // ms
    if (pttl < 0) pttl = windowMs;

    return { ok: count <= limit, resetMs: Math.max(pttl, 0) };
  } catch {
    warnOnce("Redis komutu başarısız; memory fallback.");
    return memCheck({ key, limit, windowMs });
  }
}

/**
 * makeRateLimitKey(req, { scope, userId })
 * - IP + scope + (opsiyonel userId)
 */
export function makeRateLimitKey(req, { scope = "default", userId } = {}) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0";
  const uid = userId ? `:u:${userId}` : "";
  return `rl:${scope}:ip:${ip}${uid}`;
}

/**
 * 429 yanıtları için standart header üretir.
 * Örn:
 * return json(payload, { status: 429, headers: rateLimitHeaders(resetMs) })
 */
export function rateLimitHeaders(resetMs) {
  const secs = Math.ceil(Math.max(resetMs || 0, 0) / 1000);
  return { "Retry-After": String(secs) };
}

/* Opsiyonel yardımcı: testlerde temizlik */
export async function __closeRedisForTests() {
  try {
    await redis?.quit?.();
  } catch {}
  redis = null;
  redisReady = false;
}
