export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";

const DEBUG = process.env.DEBUG_AUTH === "1";
const RATE_LIMIT_WINDOW_MS = 60_000;
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
function withDebug(res, reason) {
  if (DEBUG && reason) res.headers.set("x-debug-reason", reason);
  return res;
}
function findCookieKV(req, names) {
  const list = Array.isArray(names) ? names : [names];
  const header = req.headers.get("cookie") || "";
  for (const name of list) {
    const re = new RegExp(`(?:^|;\\s*)(${name})=([^;]+)`);
    const m = header.match(re);
    if (m) return { name: m[1], value: m[2] };
  }
  return null;
}
function tokenFromCookieValue(raw) {
  if (!raw) return null;
  let v = raw;
  try { v = decodeURIComponent(raw); } catch {}
  const i = v.indexOf("|");
  return i > 0 ? v.slice(0, i) : null;
}

export async function POST(req) {
  const locale = pickLocale(req);
  const msg = MESSAGES[locale];
  const ip = getClientIp(req);

  try {
    try { validateCsrfToken(req); }
    catch {
      return NextResponse.json({ success: false, message: msg.csrf }, { status: 403 });
    }

    const { ok } = await checkRateLimit({
      key: `login:ip:${ip}`,
      limit: RATE_LIMIT_COUNT,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!ok) return NextResponse.json({ success: false, message: msg.ratelimit }, { status: 429 });

    let body;
    try { body = await req.json(); } catch { body = null; }
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    if (!email || !password) {
      return NextResponse.json({ success: false, message: msg.fill }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ success: false, message: msg.invalid }, { status: 401 });
    if (user.role === "merchant") return NextResponse.json({ success: false, message: msg.merchant }, { status: 403 });
    if (user.lockUntil && new Date(user.lockUntil) > new Date())
      return NextResponse.json({ success: false, message: msg.locked }, { status: 403 });
    if (!user.passwordHash) return NextResponse.json({ success: false, message: msg.google }, { status: 401 });
    if (user.status !== "active") return NextResponse.json({ success: false, message: msg.inactive }, { status: 403 });

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
      return NextResponse.json({ success: false, message: msg.invalid }, { status: 401 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockUntil: null } });

    const csrfKV = findCookieKV(req, [
      "__Host-next-auth.csrf-token",
      "__Secure-next-auth.csrf-token",
      "next-auth.csrf-token",
    ]);
    if (!csrfKV) {
      return withDebug(
        NextResponse.json({ success: false, message: msg.fail }, { status: 500 }),
        "no_nextauth_csrf_cookie"
      );
    }
    const nextAuthCsrfToken = tokenFromCookieValue(csrfKV.value);
    if (!nextAuthCsrfToken) {
      return withDebug(
        NextResponse.json({ success: false, message: msg.fail }, { status: 500 }),
        "csrf_cookie_parse_fail"
      );
    }

    const fullCookieHeader = req.headers.get("cookie") || "";
    const origin = process.env.NEXTAUTH_URL || `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("host")}`;

    const form = new URLSearchParams();
    form.set("csrfToken", nextAuthCsrfToken);
    form.set("email", email);
    form.set("password", password);
    form.set("redirect", "false");
    form.set("callbackUrl", origin);

    const cbRes = await fetch(`${origin}/api/auth/callback/credentials?json=true&redirect=false`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        ...(fullCookieHeader ? { cookie: fullCookieHeader } : {}),
        origin,
        referer: `${origin}/login`,
      },
      body: form.toString(),
      redirect: "manual",
    });

    let cbJson = {};
    try { cbJson = await cbRes.json(); } catch {}

    if (!cbRes.ok || cbJson?.error) {
      return withDebug(
        NextResponse.json({ success: false, message: msg.fail }, { status: 401 }),
        `cb_fail:${cbRes.status}:${cbJson?.error || "unknown"}`
      );
    }

    const res = withDebug(
      NextResponse.json({ success: true, message: msg.success }, { status: 200 }),
      "ok"
    );
    const setCookieHeader = cbRes.headers.get("set-cookie");
    if (setCookieHeader) {
      for (const c of setCookieHeader.split(/,(?=[^,; ]+=)/g)) {
        res.headers.append("set-cookie", c);
      }
    }
    res.headers.set("cache-control", "no-store");
    res.headers.set("vary", "cookie");
    return res;

  } catch (e) {
    return withDebug(
      NextResponse.json({ success: false, message: msg.fail }, { status: 500 }),
      `outer:${e?.message || "err"}`
    );
  }
}
