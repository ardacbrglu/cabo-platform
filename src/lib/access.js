// User yetkisi ve admin/self erişim kontrolü
// SECURITY REVIEW: Ensure that user objects are always validated and not user-controlled. Consider logging failed attempts for monitoring.

export function requireRole(user, role) {
  if (!user || user.role !== role) throw new Error("Unauthorized");
  // NOTE: Throws generic error. Consider custom error types for better error handling and logging.
}

export function requireSelfOrAdmin(user, resourceUserId) {
  if (!user || (user.userId !== resourceUserId && user.role !== 'admin')) {
    throw new Error("Forbidden");
  }
  // WARNING: Make sure user.userId is not user-controlled or spoofable. Always validate user identity from a trusted source (e.g., JWT or session).
}
