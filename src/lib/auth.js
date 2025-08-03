import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";

// Cookie'den cabo_token'ı çeker
export function getTokenFromRequest(req) {
  // Next.js API Route için request header'dan token'ı çek
  // (Hem üst seviye middleware, hem de /api route.js için çalışır)
  const cookieHeader =
    req.headers?.get?.('cookie') || req.headers?.cookie || "";
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/cabo_token=([^;]+)/);
  return match ? match[1] : null;
}

// JWT'yi verify et ve payload'ı döndür (hatalıysa null)
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}
