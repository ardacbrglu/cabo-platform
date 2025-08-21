// /lib/ratelimit.js
// Rate limit yardımcıları (Redis varsa ioredis kullanır, yoksa in-memory fallback)

import prisma from "@/lib/prisma";
import crypto from "crypto";

let redis = null;

async function getRedis() {
  if (redis !== null) return redis;

  // ioredis için geçerli URL: REDIS_URL veya UPSTASH_REDIS_URL (rediss://...)
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  if (!url) {
    redis = false; // no redis
    return redis;
  }
  try {
    const IORedis = (await import("ioredis")).default;
    redis = new IORedis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableAutoPipelining: true,
    });
    await redis.connect();
    return redis;
  } catch (e) {
    console.warn("[ratelimit] Redis'e bağlanılamadı, memory fallback:", e?.message);
    redis = false;
    return redis;
  }
}

// In-memory sabit pencere counter
const memory = new Map();

export function retryAfterHeader(resetMs) {
  return String(Math.max(1, Math.ceil((resetMs || 0) / 1000)));
}

/**
 * Fixed-window rate limit kontrolü.
 * @param {object} p
 * @param {string} p.key benzersiz anahtar
 * @param {number} p.limit izin verilen istek sayısı
 * @param {number} p.windowMs pencere (ms)
 */
export async function checkRateLimit({ key, limit = 5, windowMs = 60_000 }) {
  const r = await getRedis();
  const now = Date.now();

  if (r) {
    const windowKey = `rl:${key}:${Math.floor(now / windowMs)}`;
    const count = await r.incr(windowKey);
    if (count === 1) await r.pexpire(windowKey, windowMs);
    const remaining = Math.max(0, limit - count);
    return { ok: count <= limit, remaining, resetMs: windowMs - (now % windowMs) };
  }

  // Memory fallback
  const bucketKey = `${key}:${Math.floor(now / windowMs)}`;
  const entry = memory.get(bucketKey) || { count: 0, exp: now + windowMs };
  entry.count += 1;
  memory.set(bucketKey, entry);

  // Temizlik
  for (const [k, v] of memory) {
    if (v.exp < now) memory.delete(k);
  }

  const remaining = Math.max(0, limit - entry.count);
  return { ok: entry.count <= limit, remaining, resetMs: Math.max(0, entry.exp - now) };
}

/**
 * IP+scope veya userId+scope anahtarı üretmek için yardımcı.
 */
export function makeRateLimitKey(req, { scope, userId }) {
  const ip =
    req?.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() ||
    req?.headers?.get?.("x-real-ip") ||
    "unknown";
  return userId ? `${scope}:u:${userId}` : `${scope}:ip:${ip}`;
}

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

/**
 * Kritikleri logla (PII opsiyonel maskeleme)
 * Env: LOG_PII=false → ip/email HASH'li olarak ip/email kolonlarına yazılır.
 *      LOG_PII=true  → düz metin yazılır.
 */
export async function logApiEvent({ endpoint, ip, ua, event, email = null, error = null }) {
  try {
    const allowPII = String(process.env.LOG_PII || "false").toLowerCase() === "true";
    const data = {
      endpoint,
      ua: ua || null,
      event: event || null,
      error: error || null,
      ip: allowPII ? (ip || null) : (ip ? sha256(ip) : null),
      email: allowPII ? (email || null) : (email ? sha256(email) : null),
    };
    await prisma.apiLog.create({ data });
  } catch (err) {
    console.error("API Log Error:", err);
  }
}

/**
 * İsteğe bağlı: Tek satırlık yardımcı (boilerplate azaltır).
 * Kullanım:
 *   const rl = await limitOr429(req, { scope: "login", limit: 5, windowMs: 60_000 });
 *   if (!rl.ok) return rl.response; // 429 JSON hazır
 */
export async function limitOr429(req, { scope, limit, windowMs, userId, locale = "en", message = null }) {
  const { ok, resetMs } = await checkRateLimit({
    key: makeRateLimitKey(req, { scope, userId }),
    limit,
    windowMs,
  });
  if (ok) return { ok: true };

  const msg = (locale === "tr")
    ? (message || "Çok fazla istek. Lütfen tekrar deneyin.")
    : (message || "Too many requests. Please try again.");

  const res = new Response(JSON.stringify({
    success: false,
    error: "too_many_requests",
    message: msg,
  }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Retry-After": retryAfterHeader(resetMs),
    },
  });

  return { ok: false, response: res, resetMs };
}
