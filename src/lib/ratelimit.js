// /lib/ratelimit.js
// Rate limit yardımcıları (Redis varsa kullanır, yoksa in-memory fallback)

import prisma from "@/lib/prisma";
import crypto from "crypto";

let redis = null;
async function getRedis() {
  if (redis !== null) return redis;
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
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
    console.warn("[ratelimit] Redis bağlanamadı, memory fallback:", e?.message);
    redis = false;
    return redis;
  }
}

// In-memory sabit pencere counter
const memory = new Map();

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
 * Env: LOG_PII=false → ip/email hashlenir; true → düz metin.
 */
export async function logApiEvent({ endpoint, ip, ua, event, email = null, error = null }) {
  try {
    const allowPII = String(process.env.LOG_PII || "false").toLowerCase() === "true";
    const data = { endpoint, ua, event, error };

    if (allowPII) {
      data.ip = ip || null;
      data.email = email || null;
    } else {
      data.ipHash = ip ? sha256(ip) : null;
      data.emailHash = email ? sha256(email) : null;
    }

    await prisma.apiLog.create({ data });
  } catch (err) {
    console.error("API Log Error:", err);
  }
}
