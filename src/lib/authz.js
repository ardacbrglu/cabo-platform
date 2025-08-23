/**
 * File: src/lib/authz.js
 * Purpose: NextAuth oturum nesnesi üzerinde standart AuthZ kontrolleri (RBAC + status).
 *
 * Security Docblock:
 * - Sadece NextAuth session kullanılır; custom JWT/cookie yoktur.
 * - Hata tipi: AuthzError { status, code, message } — API'ler bunu yakalayıp
 *   {error, request_id} sözleşmesiyle döner.
 */

export class AuthzError extends Error {
  constructor(message, status = 403, code = "FORBIDDEN") {
    super(message);
    this.name = "AuthzError";
    this.status = status;
    this.code = code;
  }
}

export function requireSession(session) {
  if (!session?.user) throw new AuthzError("Unauthorized", 401, "UNAUTHORIZED");
  return session;
}

export function requireStatus(session, required = "active") {
  const s = session?.user?.status;
  if (s !== required) throw new AuthzError("User not active", 403, "USER_NOT_ACTIVE");
}

export function requireRole(session, roles = []) {
  if (!Array.isArray(roles) || roles.length === 0) return;
  const role = session?.user?.role;
  if (!roles.includes(role)) {
    throw new AuthzError("Insufficient role", 403, "INSUFFICIENT_ROLE");
  }
}

export function requireSelfOrRole(session, targetUserId, roles = []) {
  const uid = session?.user?.id;
  if (uid && targetUserId && String(uid) === String(targetUserId)) return;
  requireRole(session, roles);
}

export function ensureActiveRole(session, roles = []) {
  // Tek çağrıda: oturum + status + rol
  requireSession(session);
  requireStatus(session, "active");
  requireRole(session, roles);
  return session;
}

export const getUserId = (session) => session?.user?.id ?? null;

export default Object.freeze({
  AuthzError,
  requireSession,
  requireStatus,
  requireRole,
  requireSelfOrRole,
  ensureActiveRole,
  getUserId,
});
