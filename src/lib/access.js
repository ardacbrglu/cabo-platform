// User yetkisi ve admin/self erişim kontrolü

export function requireRole(user, role) {
  if (!user || user.role !== role) throw new Error("Unauthorized");
}

export function requireSelfOrAdmin(user, resourceUserId) {
  if (!user || (user.userId !== resourceUserId && user.role !== 'admin')) {
    throw new Error("Forbidden");
  }
}
