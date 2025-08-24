export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/logout/route.js
 * Purpose: Tüm roller için idempotent logout + güvenli redirect.
 *
 * Güvenlik (Cabo PROD):
 * - Method: GET/HEAD (CSRF gerekmez).
 * - Rate limit: IP 30/dk → 429 + Retry-After.
 * - Cookies: NextAuth oturum/CSRF/callback-url çerezlerinin tüm varyantlarını expire eder.
 * - Redirect: /merchant* sayfalarından çıkış → /merchant/login, diğer her yer → /login.
 * - Origin tespiti: proxy arkasında x-forwarded-*; localhost ise http.
 * - Headers: security defaults + Cache-Control: no-store.
 */

import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

// IP çıkarımı (rate-limit anahtarı için)
function ipOf(req) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return (fwd.split(",")[0] || req.headers.get("x-real-ip") || "").trim() || "0.0.0.0";
}

// Sağlam origin tespiti (localhost => http)
function getBaseOrigin(req) {
  const xfProto = (req.headers.get("x-forwarded-proto") || "").toLowerCase();
  const xfHost = req.headers.get("x-forwarded-host");
  const host = xfHost || req.headers.get("host") || "localhost:3000";
  let proto = xfProto || (process.env.NODE_ENV === "production" ? "https" : "http");
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) proto = "http";
  return `${proto}://${host}`;
}

// Nereden gelindiğine göre login hedefi
function guessLoginPath(req) {
  const referer = req.headers.get("referer") || "";
  try {
    const u = new URL(referer);
    if (u.pathname.startsWith("/merchant")) return "/merchant/login";
  } catch {}
  return "/login";
}

// Tüm varyantları expire et (Lax/None + Secure)
function expireCookieVariants(res, name) {
  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";
  const base = `; Path=/; Expires=${expires}; HttpOnly`;
  // Lax
  res.headers.append("set-cookie", `${name}=; SameSite=Lax${base}`);
  res.headers.append("set-cookie", `${name}=; SameSite=Lax; Secure${base}`);
  // None (OAuth akışlarında görülebilir)
  res.headers.append("set-cookie", `${name}=; SameSite=None; Secure${base}`);
}

function nukeCookies(res) {
  const names = [
    // Session
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "__Host-next-auth.session-token",
    // CSRF
    "next-auth.csrf-token",
    "__Secure-next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
    // Callback URL / helpers
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url",
    "__Host-next-auth.callback-url",
    "next-auth.state",
    "next-auth.pkce.code_verifier",
    // Legacy
    "google_reg_precheck",
    "csrf_token",
    "cabo_token",
  ];
  for (const n of names) expireCookieVariants(res, n);
}

async function handle(req) {
  const requestId =
    req.headers.get("x-request-id") ||
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random()}`;

  // Rate limit: IP 30/dk
  const key = `auth:logout:ip:${ipOf(req)}`;
  const { allowed, retryAfterSec } = await checkRateLimit(key, 30, 60);

  const base = getBaseOrigin(req);
  const loginPath = guessLoginPath(req);
  const redirectUrl = new URL(loginPath, base);

  const res = NextResponse.redirect(redirectUrl, 302);
  nukeCookies(res);

  if (!allowed) {
    res.headers.set("Retry-After", String(retryAfterSec || 60));
  }

  audit({ evt: "logout", requestId, to: loginPath });
  return withHeaders(res);
}

export async function GET(req) {
  try {
    return await handle(req);
  } catch {
    const res = NextResponse.redirect(new URL("/login", getBaseOrigin(req)), 302);
    nukeCookies(res);
    return withHeaders(res);
  }
}

export async function HEAD(req) {
  return GET(req);
}
