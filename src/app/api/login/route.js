// app/api/login/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 6;
const MAX_FAILED_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000;

const MESSAGES = {
  en: {
    fill: "Please enter your email and password.",
    invalid: "Incorrect email or password.",
    merchant: "Merchants cannot log in here.",
    google: "You signed up with Google. Please use Google login.",
    inactive: "Your account has not been activated yet.",
    locked: "Too many failed attempts. Please try again later.",
    success: "Login successful!",
    fail: "Login failed. Please try again.",
    ratelimit: "Too many requests. Please wait.",
    csrf: "Invalid CSRF token.",
  },
  tr: {
    fill: "Lütfen e-posta ve şifrenizi girin.",
    invalid: "E-posta veya şifre yanlış.",
    merchant: "Satıcı hesapları buradan giriş yapamaz.",
    google: "Google ile kayıt oldunuz. Lütfen Google ile giriş yapın.",
    inactive: "Hesabınız henüz aktifleştirilmedi.",
    locked: "Çok fazla hatalı deneme. Lütfen daha sonra tekrar deneyin.",
    success: "Giriş başarılı!",
    fail: "Giriş başarısız. Lütfen tekrar deneyin.",
    ratelimit: "Çok fazla istek. Lütfen bekleyin.",
    csrf: "Geçersiz CSRF anahtarı.",
  },
};

function pickLocale(req) {
  const raw = req.headers.get("accept-language")?.split(",")[0] || "en";
  return raw.toLowerCase().startsWith("tr") ? "tr" : "en";
}
function getClientIp(req) {
  const xf = req.headers.get("x-forwarded-for");
  return xf ? xf.split(",")[0].trim() : (req.headers.get("x-real-ip") || "unknown");
}

// Split multiple Set-Cookie values safely
function splitSetCookies(v) {
  return v ? v.split(/,(?=[^,; ]+=)/g) : [];
}

// Parse "Cookie" header into a case-insensitive map
function parseCookieHeader(cookieHeader) {
  const map = new Map();
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      const name = part.slice(0, eq).trim().toLowerCase();
      const value = part.slice(eq + 1).trim();
      map.set(name, value);
    }
  }
  return map;
}

// Try to extract NextAuth CSRF token and cookie pairs from incoming request cookies
function extractNextAuthFromClientCookies(req) {
  const cookiesMap = parseCookieHeader(req.headers.get("cookie") || "");
  // Possible names (https → __Host / __Secure prefixes)
  const nameCandidates = [
    "__host-next-auth.csrf-token",
    "__secure-next-auth.csrf-token",
    "next-auth.csrf-token",
  ];
  const cbCandidates = [
    "__secure-next-auth.callback-url",
    "next-auth.callback-url",
  ];

  let csrfCookiePair = "";
  let csrfToken = "";
  for (const nm of nameCandidates) {
    const val = cookiesMap.get(nm);
    if (val) {
      csrfCookiePair = `${nm.replace(/^__host-|^__secure-/, "")}=${val}`; // normalize name is not necessary, keep as-is
      try {
        // value like: "<token>|<hash>" (urlencoded)
        const raw = decodeURIComponent(val);
        csrfToken = raw.split("|")[0] || "";
      } catch {
        csrfToken = val.split("%7C")[0] || "";
      }
      break;
    }
  }
  // callback-url is optional but helps
  let callbackPair = "";
  for (const nm of cbCandidates) {
    const val = cookiesMap.get(nm);
    if (val) {
      callbackPair = `${nm}=${val}`;
      break;
    }
  }

  const cookieJar = [csrfCookiePair, callbackPair].filter(Boolean).join("; ");
  return { csrfToken, cookieJar };
}

export async function POST(req) {
  const locale = pickLocale(req);
  const msg = MESSAGES[locale];
  const ip = getClientIp(req);

  // Helper to build JSON response with optional debug header
  const json = (body, init = {}) => {
    const res = NextResponse.json(body, init);
    if (body?.reason) res.headers.set("X-Debug-Reason", String(body.reason));
    res.headers.set("Cache-Control", "no-store");
    return res;
  };

  try {
    // 1) CSRF validation (header+cookie)
    try {
      await validateCsrfToken(req);
    } catch {
      return json({ success: false, message: msg.csrf, reason: "csrf_mismatch" }, { status: 403 });
    }

    // 2) Rate limit
    const { ok, resetMs } = await checkRateLimit({
      key: `login:ip:${ip}`,
      limit: RATE_LIMIT_COUNT,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!ok) {
      return new NextResponse(
        JSON.stringify({ success: false, message: msg.ratelimit }),
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((resetMs || RATE_LIMIT_WINDOW_MS) / 1000)),
            "Content-Type": "application/json",
          },
        }
      );
    }

    // 3) Input
    let body;
    try { body = await req.json(); } catch { return json({ success: false, message: msg.fill }, { status: 400 }); }
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    if (!email || !password) return json({ success: false, message: msg.fill }, { status: 400 });

    // 4) User gates
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return json({ success: false, message: msg.invalid }, { status: 401 });
    if (user.role === "merchant") return json({ success: false, message: msg.merchant }, { status: 403 });
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) return json({ success: false, message: msg.locked }, { status: 403 });
    if (!user.passwordHash) return json({ success: false, message: msg.google }, { status: 401 });
    if (user.status !== "active") return json({ success: false, message: msg.inactive }, { status: 403 });

    // 5) Password check + brute force accounting
    const okPass = await bcrypt.compare(password, user.passwordHash);
    if (!okPass) {
      const nextFailed = (user.failedAttempts || 0) + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: nextFailed,
          lockUntil: nextFailed >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS)
            : user.lockUntil,
        },
      });
      return json({ success: false, message: msg.invalid }, { status: 401 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockUntil: null } });

    // 6) Prepare NextAuth Credentials callback
    const scheme = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host");
    const origin = req.nextUrl?.origin || `${scheme}://${host}`;

    // First try to use client's existing NextAuth cookies (already present in your logs)
    let { csrfToken, cookieJar } = extractNextAuthFromClientCookies(req);
    let debugPath = "client_cookie";

    // Fallback: get a fresh csrf + cookies from NextAuth
    if (!csrfToken || !cookieJar) {
      const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const csrfJson = await csrfRes.json().catch(() => ({}));
      const tokenFromApi = csrfJson?.csrfToken;
      if (!tokenFromApi) {
        return json({ success: false, message: msg.fail, reason: "no_csrf_token" }, { status: 500 });
      }
      const setCookieHeader = csrfRes.headers.get("set-cookie") || "";
      const pairs = [];
      for (const c of splitSetCookies(setCookieHeader)) {
        const pair = c.split(";")[0].trim();
        const name = pair.slice(0, pair.indexOf("=")).trim().toLowerCase();
        if (
          name === "__host-next-auth.csrf-token" ||
          name === "__secure-next-auth.csrf-token" ||
          name === "next-auth.csrf-token" ||
          name === "__secure-next-auth.callback-url" ||
          name === "next-auth.callback-url"
        ) {
          pairs.push(pair);
        }
      }
      cookieJar = pairs.join("; ");
      csrfToken = tokenFromApi;
      debugPath = "fallback_csrf";
    }

    // Call Credentials callback
    const form = new URLSearchParams();
    form.set("csrfToken", csrfToken);
    form.set("email", email);
    form.set("password", password);
    form.set("redirect", "false");
    form.set("callbackUrl", origin);

    const cbRes = await fetch(`${origin}/api/auth/callback/credentials?json=true&redirect=false`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        ...(cookieJar ? { cookie: cookieJar } : {}),
      },
      body: form.toString(),
      redirect: "manual",
    });

    let cbJson = {};
    try { cbJson = await cbRes.json(); } catch {}

    if (!cbRes.ok || cbJson?.error) {
      return json(
        { success: false, message: msg.fail, reason: cbJson?.error || `status_${cbRes.status}|${debugPath}` },
        { status: 401 }
      );
    }

    // Pass NextAuth session cookies through
    const res = json({ success: true, message: msg.success }, { status: 200 });
    const setCookieHeader = cbRes.headers.get("set-cookie");
    if (setCookieHeader) {
      for (const c of splitSetCookies(setCookieHeader)) {
        res.headers.append("set-cookie", c);
      }
    }
    return res;

  } catch {
    return NextResponse.json(
      { success: false, message: msg.fail, reason: "unhandled" },
      { status: 500 }
    );
  }
}
