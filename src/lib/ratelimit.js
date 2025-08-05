const memory = {};
// SECURITY REVIEW: In-memory rate limiting is not suitable for distributed/multi-instance deployments. Use Redis or another centralized store in production.

export function checkRateLimit(key, limit = 5, windowMs = 60000) {
  const now = Date.now();
  if (!memory[key]) memory[key] = [];
  memory[key] = memory[key].filter(ts => now - ts < windowMs);
  if (memory[key].length >= limit) return false;
  memory[key].push(now);
  return true;
  // WARNING: Rate limiting by key only. Ensure keys are not user-controllable to avoid bypass. Consider per-user/device rate limits for sensitive actions.
}
