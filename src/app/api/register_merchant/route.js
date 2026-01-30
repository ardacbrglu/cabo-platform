/**
 * Merchant registration (manual) — PROD READY
 *
 * Security Docblock (Cabo PROD)
 * - Tek oturum: NextAuth (Credentials+Google); custom JWT/cookie yok.
 * - Mutasyonlarda: Origin/Referer eşleşmesi + X-Requested-With + X-Request-Id zorunlu.
 * - Rate limit: IP+UA+scope (varsayılan 12/dk).
 * - reCAPTCHA v2 server-side doğrulama (host/IP bağlamıyla).
 * - Giriş doğrulama: Zod + normalize + sanitize (fallback’li).
 * - DB: Prisma, raw SQL yok.
 * - Audit: tüm kritik dallar kayıtlanır.
 * - Hata sözleşmesi: { success:false, error, message, request_id, retry_after?, field? }.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { verifyRecaptcha } from "@/lib/captcha";
import { audit } from "@/lib/logger";
import * as validation from "@/lib/validation";

/* -------------------------- helpers -------------------------- */

function withStd(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

const RL_LIMIT = Number(process.env.MERCHANT_RL_PER_MIN || "12");
const RL_WINDOW_MS = Number(process.env.MERCHANT_RL_WINDOW_MS || "60000");
const RL_SCOPE = "merchant_register_v2";

const MSG = {
  en: {
    ratelimit: "Too many requests. Please wait and try again.",
    required: "Please fill in all fields.",
    email: "Invalid email address.",
    name: "Full name must be 3–40 chars (letters/numbers/space/_). Turkish letters are allowed.",
    company: "Company name must be 2–150 chars; letters, numbers and basic punctuation only.",
    password: "Password must be at least 8 chars and contain both letters and numbers.",
    phone: "Invalid phone number.",
    terms: "You must accept the Terms and Privacy Policy.",
    captcha: "Captcha verification failed. Please try again.",
    uniq: "An account with this email already exists.",
    success: "Merchant registration successful. Your account is pending approval.",
    fail: "Registration failed. Please try again.",
  },
  tr: {
    ratelimit: "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.",
    required: "Lütfen tüm alanları doldurun.",
    email: "Geçersiz e-posta adresi.",
    name: "Ad Soyad 3–40 karakter olmalı (harf/rakam/boşluk/_). Türkçe harfler desteklenir.",
    company: "Şirket adı 2–150 karakter olmalı; harf, rakam ve temel noktalama işaretleri kullanılabilir.",
    password: "Şifre en az 8 karakter ve hem harf hem rakam içermelidir.",
    phone: "Geçersiz telefon numarası.",
    terms: "Kullanım ve Gizlilik şartlarını kabul etmelisiniz.",
    captcha: "Doğrulama başarısız. Lütfen tekrar deneyin.",
    uniq: "Bu e-posta ile bir hesap zaten var.",
    success: "Satıcı kaydı başarılı. Hesabınız onay bekliyor.",
    fail: "Kayıt başarısız. Lütfen tekrar deneyin.",
  },
};

const tFromReq = (req) =>
  (req.headers.get("accept-language") || "").toLowerCase().startsWith("tr")
    ? MSG.tr
    : MSG.en;

const maskEmail = (e) => String(e || "").replace(/(.{2}).*(@.*)/, "$1***$2");

// Unicode normalize (NFKC) + görünmez karakter temizliği
const normalizeU = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const RegisterSchema = z
  .object({
    name: z.string().min(3).max(40).regex(/^[\p{L}\p{N}_ ]+$/u),
    companyName: z.string().min(2).max(150).regex(/^[\p{L}\p{N}\s&_.,'’()\-]+$/u),
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), "weak"),
    phoneNumber: z.string().regex(/^\+?\d{10,15}$/),
    termsAccepted: z.literal(true),
    captcha: z.string().min(1),
  })
  .strict();

/** sanitize: validation.sanitize?.text varsa kullanır, yoksa whitelist */
function sanitizeTextSafe(s) {
  const v = normalizeU(s);
  const fn = validation?.sanitize?.text;
  if (typeof fn === "function") {
    try {
      return fn(v);
    } catch {}
  }
  return v.replace(/[^\p{L}\p{N}\s&_.,'’()\-@:+]/gu, "");
}

/* --------------------------- handler ------------------------- */

export async function POST(req) {
  let requestId = "unknown";
  try {
    requestId = requireRequestId(req);
    requireOrigin(req);
    requireAjax(req);
  } catch (e) {
    return withStd(
      NextResponse.json(
        { success: false, error: e?.code || "bad_request", message: "bad_request", request_id: requestId },
        { status: e?.status || 400 }
      )
    );
  }

  const M = tFromReq(req);

  // Rate limit (fail-open)
  try {
    const rlKey = makeRateLimitKey(req, { scope: RL_SCOPE });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: RL_LIMIT, windowMs: RL_WINDOW_MS });
    if (!ok) {
      const retrySec = Math.max(1, Math.ceil((resetMs || RL_WINDOW_MS) / 1000));
      audit({ evt: "merchant.register.ratelimit", requestId, retrySec });
      return withStd(
        NextResponse.json(
          { success: false, error: "too_many_requests", message: M.ratelimit, request_id: requestId, retry_after: retrySec },
          { status: 429, headers: { "Retry-After": String(retrySec) } }
        )
      );
    }
  } catch {}

  // Body
  let raw;
  try {
    raw = await req.json();
  } catch {
    return withStd(
      NextResponse.json({ success: false, error: "invalid_request", message: M.required, request_id: requestId }, { status: 400 })
    );
  }

  // Normalize + sanitize + validate
  const data = {
    name: sanitizeTextSafe(raw?.name),
    companyName: sanitizeTextSafe(raw?.companyName),
    email: String(raw?.email || "").trim().toLowerCase(),
    password: String(raw?.password || ""),
    phoneNumber: String(raw?.phoneNumber || "").trim(),
    termsAccepted: !!raw?.termsAccepted,
    captcha: String(raw?.captcha || ""),
  };

  const parsed = RegisterSchema.safeParse(data);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0];
    const fieldMsg =
      field === "email" ? M.email :
      field === "name" ? M.name :
      field === "companyName" ? M.company :
      field === "password" ? M.password :
      field === "phoneNumber" ? M.phone :
      field === "termsAccepted" ? M.terms :
      M.required;

    audit({ evt: "merchant.register.invalid", field, requestId });
    return withStd(
      NextResponse.json({ success: false, error: "invalid_payload", field, message: fieldMsg, request_id: requestId }, { status: 400 })
    );
  }

  // CAPTCHA (sadece geçerli payload sonrası)
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  let cap = { ok: false, code: "TOKEN_MISSING" };
  try {
    cap = await verifyRecaptcha(data.captcha, { host });
  } catch {
    cap = { ok: false, code: "VERIFY_EXCEPTION" };
  }
  if (!cap.ok) {
    audit({ evt: "merchant.register.captcha_fail", requestId, code: cap.code });
    return withStd(
      NextResponse.json({ success: false, error: "captcha_failed", message: M.captcha, request_id: requestId }, { status: 400 })
    );
  }

  const { name, companyName, email, password, phoneNumber } = parsed.data;

  // Uniqueness
  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) {
    audit({ evt: "merchant.register.conflict", requestId, email: maskEmail(email) });
    return withStd(
      NextResponse.json({ success: false, error: "conflict", message: M.uniq, request_id: requestId }, { status: 409 })
    );
  }

  // Create merchant (pending)
  try {
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        name,
        realUserFullname: name,
        companyName,
        email,
        passwordHash,
        phoneNumber,
        role: "merchant",
        status: "pending",
        termsAccepted: true,
        languagePreference: (req.headers.get("accept-language") || "").toLowerCase().startsWith("tr") ? "tr" : "en",
      },
    });

    audit({ evt: "merchant.register.ok", requestId, email: maskEmail(email) });
    return withStd(NextResponse.json({ success: true, message: M.success, request_id: requestId }, { status: 200 }));
  } catch (e) {
    audit({
      evt: "merchant.register.db_error",
      requestId,
      code: e?.code || "DB_ERR",
      meta: String(e?.message || "").slice(0, 220),
    });
    return withStd(
      NextResponse.json({ success: false, error: "server_error", message: M.fail, request_id: requestId }, { status: 500 })
    );
  }
}
