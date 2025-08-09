// /lib/ratelimit.js
// Rate limit yardımcıları (Redis varsa kullanır, yoksa in-memory fallback)
// SECURITY: Tüm mutating endpointlerde ve hassas GET'lerde kullanın.

import prisma from "@/lib/prisma";

let redis = null;
async function getRedis() {
  if (redis !== null) return redis;
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  if (!url) {
    redis = false; // no redis
    return redis;
  }
  try {
    // ioredis önerilir. Upstash REST de olabilir; burada ioredis örneği:
    const IORedis = (await import("ioredis")).default;
    redis = new IORedis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableAutoPipelining: true,
    });
    await redis.connect();
    return redis;
  } catch (e) {
    console.warn("[ratelimit] Redis bağlanamadı, memory fallback kullanılacak:", e?.message);
    redis = false;
    return redis;
  }
}

// In-memory sabit pencere counter (basit ve güvenli)
const memory = new Map();
/**
 * Fixed-window rate limit kontrolü.
 * @param {object} p
 * @param {string} p.key benzersiz anahtar (örn: ip veya userId+scope)
 * @param {number} p.limit izin verilen istek sayısı
 * @param {number} p.windowMs pencere (ms)
 * @returns {Promise<{ok:boolean, remaining:number, resetMs:number}>}
 */
export async function checkRateLimit({ key, limit = 5, windowMs = 60_000 }) {
  const r = await getRedis();
  const now = Date.now();

  if (r) {
    const windowKey = `rl:${key}:${Math.floor(now / windowMs)}`; // window bucket
    const count = await r.incr(windowKey);
    if (count === 1) {
      await r.pexpire(windowKey, windowMs);
    }
    const remaining = Math.max(0, limit - count);
    return { ok: count <= limit, remaining, resetMs: windowMs - (now % windowMs) };
  }

  // Memory fallback
  const bucketKey = `${key}:${Math.floor(now / windowMs)}`;
  const entry = memory.get(bucketKey) || { count: 0, exp: now + windowMs };
  entry.count += 1;
  memory.set(bucketKey, entry);

  // Temizlik (basit)
  for (const [k, v] of memory) {
    if (v.exp < now) memory.delete(k);
  }

  const remaining = Math.max(0, limit - entry.count);
  return { ok: entry.count <= limit, remaining, resetMs: Math.max(0, entry.exp - now) };
}

/**
 * IP+scope veya userId+scope anahtarı üretmek için yardımcı.
 * @param {Request} req
 * @param {object} p
 * @param {string} p.scope örn: "login", "register", "wallet"
 * @param {string|number} [p.userId]
 */
export function makeRateLimitKey(req, { scope, userId }) {
  const ip = req?.headers?.get?.("x-forwarded-for")?.split(",")[0]
    || req?.headers?.get?.("x-real-ip")
    || "unknown";
  return userId ? `${scope}:u:${userId}` : `${scope}:ip:${ip}`;
}

/**
 * Kritikleri logla (hata, aşımlar, vb.)
 */
export async function logApiEvent({ endpoint, ip, ua, event, email = null, error = null }) {
  try {
    await prisma.apiLog.create({
      data: { endpoint, ip, ua, event, email, error },
    });
  } catch (err) {
    console.error("API Log Error:", err);
  }
}
