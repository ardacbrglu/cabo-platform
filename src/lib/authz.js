// src/lib/authz.js
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
  if (!roles.includes(role)) throw new AuthzError("Insufficient role", 403, "INSUFFICIENT_ROLE");
}

export function requireSelfOrRole(session, targetUserId, roles = []) {
  const uid = session?.user?.id;
  if (uid === targetUserId) return;
  requireRole(session, roles);
}
