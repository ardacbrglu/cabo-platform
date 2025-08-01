const memory = {};

export function checkRateLimit(key, limit = 5, windowMs = 60000) {
  const now = Date.now();
  if (!memory[key]) memory[key] = [];
  memory[key] = memory[key].filter(ts => now - ts < windowMs);
  if (memory[key].length >= limit) return false;
  memory[key].push(now);
  return true;
}
