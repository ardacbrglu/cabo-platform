import prisma from "@/lib/prisma";

const memory = {};
// WARNING: In-memory rate limiting is not distributed-safe! 
// For real production, switch to Redis/memcached.

export function checkRateLimit(key, limit = 5, windowMs = 60000) {
  const now = Date.now();
  if (!memory[key]) memory[key] = [];
  memory[key] = memory[key].filter(ts => now - ts < windowMs);
  if (memory[key].length >= limit) return false;
  memory[key].push(now);
  return true;
}

// Production-ready, Prisma API log fonksiyonu
export async function logApiEvent({ endpoint, ip, ua, event, email = null, error = null }) {
  try {
    await prisma.apiLog.create({
      data: {
        endpoint,
        ip,
        ua,
        event,
        email,
        error,
      }
    });
  } catch (err) {
    // Log hatası burada apiyi kırmaz, sadece konsolda görünür
    console.error("API Log Error:", err);
  }
}
