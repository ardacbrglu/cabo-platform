// ✅ app/api/login/route.js
// Sorumluluk: Manuel login (Credentials Provider) için güvenli giriş.
// Google login zaten /api/auth/[...nextauth] üzerinden çalışıyor.

export const dynamic = "force-dynamic";

/**
 * SECURITY NOTES
 * - Auth: NextAuth (custom JWT yok). Bu endpoint sadece kimlik doğrular ve
 *   NextAuth Credentials callback'ine sunucu-tarafı proxy yaparak session'ı kurar.
 * - CSRF: Header (x-csrf-token | csrf-token) + cookie (csrf_token) eşleşmesi zorunlu.
 * - Rate limit: IP bazlı (dakikada 6).
 * - Brute force: failedAttempts + geçici lock (15dk).
 * - Yanıt: JSON; başarılıysa Set-Cookie başlıkları ile birlikte döner.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;   // 1 dk
const RATE_LIMIT_COUNT     = 6;
const MAX_FAILED_ATTEMPTS  = 5;
const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 dk

const MESSAGES = {
  en: {
    fill:      "Please enter your email and password.",
    invalid:   "Incorrect email or password.",
    merchant:  "Merchants cannot log in here.",
    google:    "You signed up with Google. Please use Google login.",
    inactive:  "Your account has not been activated yet.",
    locked:    "Too many failed attempts. Please try again later.",
    success:   "Login successful!",
    fail:      "Login failed. Please try again.",
    ratelimit: "Too many requests. Please wait.",
    csrf:      "Invalid CSRF token."
  },
  tr: {
    fill:      "Lütfen e-posta ve şifrenizi girin.",
    invalid:   "E-posta veya şifre yanlış.",
    merchant:  "Satıcı hesapları buradan giriş yapamaz.",
    google:    "Google ile kayıt oldunuz. Lütfen Google ile giriş yapın.",
    inactive:  "Hesabınız henüz aktifleştirilmedi.",
    locked:    "Çok fazla hatalı deneme. Lütfen daha sonra tekrar deneyin.",
    success:   "Giriş başarılı!",
    fail:      "Giriş başarısız. Lütfen tekrar deneyin.",
    ratelimit: "Çok fazla istek. Lütfen bekleyin.",
    csrf:      "Geçersiz CSRF anahtarı."
  }
};

function pickLocale(req) {
  const raw = req.headers.get("accept-language")?.split(",")[0] || "en";
  return raw.startsWith("tr") ? "tr" : "en";
}
function getClientIp(req) {
  const xf = req.headers.get("x-forwarded-for");
  return xf ? xf.split(",")[0].trim() : req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req) {
  const locale = pickLocale(req);
  const msg = MESSAGES[locale];
  const ip = getClientIp(req);

  try {
    // 1) CSRF (header + cookie eşleşmeli)
    try {
      validateCsrfToken(req);
    } catch {
      return NextResponse.json({ success: false, message: msg.csrf }, { status: 403 });
    }

    // 2) Rate limit (IP bazlı)
    const { ok } = await checkRateLimit({
      key: `login:ip:${ip}`,
      limit: RATE_LIMIT_COUNT,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!ok) {
      return NextResponse.json({ success: false, message: msg.ratelimit }, { status: 429 });
    }

    // 3) Input
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, message: msg.fill }, { status: 400 });
    }
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    if (!email || !password) {
      return NextResponse.json({ success: false, message: msg.fill }, { status: 400 });
    }

    // 4) User fetch (minimum alanlar)
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Bilerek generic mesaj
      return NextResponse.json({ success: false, message: msg.invalid }, { status: 401 });
    }

    // 5) Rol / durum kontrolleri
    if (user.role === "merchant") {
      return NextResponse.json({ success: false, message: msg.merchant }, { status: 403 });
    }
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      return NextResponse.json({ success: false, message: msg.locked }, { status: 403 });
    }
    if (!user.passwordHash) {
      // Google ile kayıt: manuel login yasak (şifre oluşturmadıkça)
      return NextResponse.json({ success: false, message: msg.google }, { status: 401 });
    }
    if (user.status !== "active") {
      return NextResponse.json({ success: false, message: msg.inactive }, { status: 403 });
    }

    // 6) Parola doğrulama + brute-force sayaçları
    const okPass = await bcrypt.compare(password, user.passwordHash);
    if (!okPass) {
      const nextFailed = (user.failedAttempts || 0) + 1;
      const willLock = nextFailed >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: nextFailed,
          lockUntil: willLock ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS) : user.lockUntil
        }
      });
      return NextResponse.json({ success: false, message: msg.invalid }, { status: 401 });
    }

    // Başarılı giriş → sayaç sıfırla
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockUntil: null }
    });

    /**
     * 7) SESSION KURULUMU — NextAuth Credentials callback'e sunucu-tarafı proxy
     * - Akış:
     *   a) /api/auth/csrf → csrfToken + (Set-Cookie: next-auth.csrf-token)
     *   b) /api/auth/callback/credentials?json=true&redirect=false (POST, urlencoded)
     *      → (Set-Cookie: next-auth.session-token[|__Secure-...])
     * - Sonuç: Dönen Set-Cookie başlıklarını kendi yanıtımıza ekliyoruz.
     */
    const origin = req.nextUrl?.origin || `${req.headers.get("x-forwarded-proto") || "http"}://${req.headers.get("host")}`;

    // a) CSRF al
    const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
      method: "GET",
      headers: { accept: "application/json" },
    });

    const csrfJson = await csrfRes.json().catch(() => ({}));
    const csrfToken = csrfJson?.csrfToken;
    if (!csrfToken) {
      // Beklenmedik durum
      return NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
    }

    // NextAuth, callback isteğinde aynı request cookie'lerinde csrf cookie'sini görmek ister.
    // Node fetch cookie jar olmadığından, önceki cevaptaki Set-Cookie'yi header "cookie" olarak yeniden gönderiyoruz.
    const csrfSetCookie = csrfRes.headers.get("set-cookie") || "";

    // b) Credentials callback (redirect=false + json=true)
    const form = new URLSearchParams();
    form.set("csrfToken", csrfToken);
    form.set("email", email);
    form.set("password", password);
    form.set("redirect", "false");
    form.set("callbackUrl", origin); // isteğe bağlı

    const cbRes = await fetch(`${origin}/api/auth/callback/credentials?json=true&redirect=false`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "accept": "application/json",
        // CSRF cookie'yi ilet
        ...(csrfSetCookie ? { cookie: csrfSetCookie } : {}),
      },
      body: form.toString(),
      redirect: "manual",
    });

    // NextAuth JSON cevabı (error alanı varsa başarısız)
    let cbJson = {};
    try { cbJson = await cbRes.json(); } catch {}

    if (!cbRes.ok || cbJson?.error) {
      return NextResponse.json({ success: false, message: msg.fail }, { status: 401 });
    }

    // NextAuth'ın döndürdüğü session cookie'lerini geçir
    const setCookieHeader = cbRes.headers.get("set-cookie");
    const res = NextResponse.json({ success: true, message: msg.success }, { status: 200 });

    if (setCookieHeader) {
      // Birden fazla Set-Cookie olabilirse ayırmayı dene (güvenli olmayan virgül bölmeleri varsa yine ilk cookie en kritik olan session’dır)
      // Modern Node/undici çoğu durumda tek header döndürür; bunu aynen iletmek yeterlidir.
      res.headers.append("set-cookie", setCookieHeader);
    }

    // Önbellek devre dışı
    res.headers.set("cache-control", "no-store");
    return res;

  } catch (err) {
    // GENEL HATA: generic mesaj
    return NextResponse.json({ success: false, message: MESSAGES[locale].fail }, { status: 500 });
  }
}
