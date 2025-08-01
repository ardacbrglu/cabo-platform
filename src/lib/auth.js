import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";

export function getTokenFromRequest(req) {
  // Next.js API Route için request header'dan token'ı çek
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/cabo_token=([^;]+)/);
  return match ? match[1] : null;
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}
