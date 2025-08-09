// /lib/antiFraud.js
// Click flood / davranışsal anti-fraud yardımcıları.
// Redis varsa ZSET ile kayan pencere; yoksa memory fallback.

let redis = null;
async function getRedis() {
  if (redis !== null) return redis;
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  if (!url) {
    redis = false;
    return redis;
  }
  try {
    const IORedis = (await import("ioredis")).default;
    redis = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 2, enableAutoPipelining: true });
    await redis.connect();
    return redis;
  } catch (e) {
    console.warn("[antiFraud] Redis yok, memory fallback:", e?.message);
    redis = false;
    return redis;
  }
}

// Memory fallback (kayan pencere: timestamp listesi)
const mem = new Map();

/**
 * Son windowMs içinde userId+ip için tıklama sayısını limitle.
 * Limit aşıldıysa true döner (engelle).
 */
export async function checkClickFlood(userId, ip, limit = 20, windowMs = 60_000) {
  const r = await getRedis();
  const now = Date.now();
  const key = `click:${userId || "anon"}:${ip || "unknown"}`;

  if (r) {
    const zkey = `cf:${key}`;
    const minScore = now - windowMs;

    // Eski kayıtları sil
    await r.zremrangebyscore(zkey, 0, minScore);
    // Yeni click ekle
    await r.zadd(zkey, now, String(now));
    // TTL ayarla (window bittiğinde otomatik temizlensin)
    await r.pexpire(zkey, windowMs);

    const count = await r.zcount(zkey, minScore, now);
    return count > limit;
  }

  // Memory fallback
  const list = mem.get(key) || [];
  const filtered = list.filter(ts => now - ts < windowMs);
  filtered.push(now);
  mem.set(key, filtered);
  // Temizlik (key bazlı basit)
  if (filtered.length === 0) mem.delete(key);
  return filtered.length > limit;
}

/**
 * İsteğe bağlı: tek çağrıda log + kontrol
 */
export async function logClickAndCheck(userId, ip, limit = 20, windowMs = 60_000) {
  // Bu fonksiyon şu an checkClickFlood ile aynı davranır; ileride ek telemetri eklenebilir.
  return checkClickFlood(userId, ip, limit, windowMs);
}
