// lib/ratelimit.js
import prisma from "@/lib/prisma";

// Simple in-memory rate limit (for demo/development)
// Production: Use Redis!
const memory = {};

export function checkRateLimit(key, limit = 5, windowMs = 60000) {
  const now = Date.now();
  if (!memory[key]) memory[key] = [];
  memory[key] = memory[key].filter(ts => now - ts < windowMs);
  if (memory[key].length >= limit) return false;
  memory[key].push(now);
  return true;
}

export async function logApiEvent({ endpoint, ip, ua, event, email = null, error = null }) {
  try {
    await prisma.apiLog.create({
      data: { endpoint, ip, ua, event, email, error }
    });
  } catch (err) {
    console.error("API Log Error:", err);
  }
}
