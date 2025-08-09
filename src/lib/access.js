// /lib/access.js
// Authorization yardımcıları (prod-ready)
// SECURITY: user objesi yalnızca NextAuth session’dan gelmeli (server-side)

export function requireRole(user, role) {
  if (!user || user.role !== role) {
    throw new Error("Unauthorized");
  }
}

export function requireSelfOrAdmin(user, resourceUserId) {
  // DİKKAT: user.id session’dan gelir; client’tan gelen userId asla kullanılmaz.
  if (!user || (user.id !== resourceUserId && user.role !== "admin")) {
    throw new Error("Forbidden");
  }
}
