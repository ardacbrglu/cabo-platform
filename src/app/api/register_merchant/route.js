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
// sanitize için namespace import + güvenli fallback
import * as validation from "@/lib/validation";

/* -------------------------- helpers -------------------------- */

function withStd(res, req) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res, req);
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

// Unicode güvenli normalize (NFKC) + görünmez karakter temizliği
const normalizeU = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width
    .replace(/\s+/g, " ")
    .trim();

const RegisterSchema = z
  .object({
    // Türkçe dahil tüm harfler: \p{L}; rakam: \p{N}; boşluk ve _ serbest
    name: z.string().min(3).max(40).regex(/^[\p{L}\p{N}_ ]+$/u),
    companyName: z
      .string()
      .min(2)
      .max(150)
      .regex(/^[\p{L}\p{N}\s&_.,'’()\-]+$/u),
    email: z.string().email(),
    password: z.string().min(8).refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), "weak"),
    phoneNumber: z.string().regex(/^\+?\d{10,15}$/),
    termsAccepted: z.literal(true),
    captcha: z.string().min(1),
  })
  .strict();

/** Güvenli sanitize: validation.sanitize?.text varsa onu kullanır, yoksa whitelist. */
function sanitizeTextSafe(s) {
  const v = normalizeU(s);
  const fn = validation?.sanitize?.text;
  if (typeof fn === "function") {
    try {
      return fn(v);
    } catch {
      /* fallthrough */
    }
  }
  // Harf, rakam, boşluk ve bazı temel işaretler whitelisti (Unicode)
  return v.replace(/[^\p{L}\p{N}\s&_.,'’()\-@:+]/gu, "");
}

/* --------------------------- handler ------------------------- */

export async function POST(req) {
  // ---- Preflight
  let requestId = "unknown";
  try {
    requestId = requireRequestId(req);
    requireOrigin(req);
    requireAjax(req);
  } catch {
    return withStd(
      NextResponse.json(
        { success: false, error: "bad_request", message: "bad_request", request_id: requestId },
        { status: 400 }
      ),
      req
    );
  }

  const M = tFromReq(req);

  // ---- Rate limit
  try {
    const rlKey = makeRateLimitKey(req, { scope: RL_SCOPE });
    const { ok, resetMs } = await checkRateLimit({
      key: rlKey,
      limit: RL_LIMIT,
      windowMs: RL_WINDOW_MS,
    });
    if (!ok) {
      const retrySec = Math.max(1, Math.ceil((resetMs || RL_WINDOW_MS) / 1000));
      audit({ evt: "merchant.register.ratelimit", requestId, retrySec });
      return withStd(
        NextResponse.json(
          {
            success: false,
            error: "too_many_requests",
            message: M.ratelimit,
            request_id: requestId,
            retry_after: retrySec,
          },
          { status: 429, headers: { "Retry-After": String(retrySec) } }
        ),
        req
      );
    }
  } catch {
    // rate-limit problemi akışı durdurmasın (fail-open)
  }

  // ---- Body
  let raw;
  try {
    raw = await req.json();
  } catch {
    return withStd(
      NextResponse.json(
        { success: false, error: "invalid_request", message: M.required, request_id: requestId },
        { status: 400 }
      ),
      req
    );
  }

  // ---- Normalize + validate + sanitize (CAPTCHA'DAN ÖNCE!)
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
      field === "email"
        ? M.email
        : field === "name"
        ? M.name
        : field === "companyName"
        ? M.company
        : field === "password"
        ? M.password
        : field === "phoneNumber"
        ? M.phone
        : field === "termsAccepted"
        ? M.terms
        : M.required;

    audit({ evt: "merchant.register.invalid", field, requestId });
    return withStd(
      NextResponse.json(
        {
          success: false,
          error: "invalid_payload",
          field,
          message: fieldMsg,
          request_id: requestId,
        },
        { status: 400 }
      ),
      req
    );
  }

  // ---- CAPTCHA (artık sadece form sahası geçerliyse çalışır)
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
      NextResponse.json(
        { success: false, error: "captcha_failed", message: M.captcha, request_id: requestId },
        { status: 400 }
      ),
      req
    );
  }

  const { name, companyName, email, password, phoneNumber } = parsed.data;

  // ---- Uniqueness
  const exists = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (exists) {
    audit({ evt: "merchant.register.conflict", requestId, email });
    return withStd(
      NextResponse.json(
        { success: false, error: "conflict", message: M.uniq, request_id: requestId },
        { status: 409 }
      ),
      req
    );
  }

  // ---- Create merchant (pending)
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        name,
        realUserFullname: name,
        companyName,
        email,
        passwordHash,
        phoneNumber, // prisma modelinde opsiyonel
        role: "merchant",
        status: "pending",
        termsAccepted: true,
        languagePreference: (req.headers.get("accept-language") || "")
          .toLowerCase()
          .startsWith("tr")
          ? "tr"
          : "en",
        // currencyCode default TRY, createdAt default now()
      },
    });

    audit({ evt: "merchant.register.ok", requestId, email });
    return withStd(
      NextResponse.json(
        { success: true, message: M.success, request_id: requestId },
        { status: 200 }
      ),
      req
    );
  } catch (e) {
    audit({
      evt: "merchant.register.db_error",
      requestId,
      code: e?.code || "DB_ERR",
      meta: String(e?.message || "").slice(0, 220),
    });
    return withStd(
      NextResponse.json(
        { success: false, error: "server_error", message: M.fail, request_id: requestId },
        { status: 500 }
      ),
      req
    );
  }
}
