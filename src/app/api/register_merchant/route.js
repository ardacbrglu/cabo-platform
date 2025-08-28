/**
 * Merchant registration (no Google). Creates user with role=merchant & status=pending.
 */
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { verifyRecaptchaFromRequest } from "@/lib/captcha";
import { audit } from "@/lib/logger";
import { sanitize } from "@/lib/validation";

export const runtime = "nodejs";

const RL_LIMIT = Number(process.env.MERCHANT_RL_PER_MIN || "12");
const RL_WINDOW_MS = Number(process.env.MERCHANT_RL_WINDOW_MS || "60000"); // 60s
const RL_SCOPE = "merchant_register_v2"; // scope'ı değiştirerek eski sayaçları da boşa düşürüyoruz

const MSG = {
  en: {
    ratelimit: "Too many requests. Please wait and try again.",
    required: "Please fill in all fields.",
    email: "Invalid email address.",
    name: "Name must be 3–40 chars (letters/numbers/space/_).",
    company: "Company name must be 2–150 chars and valid characters only.",
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
    name: "Ad Soyad 3–40 karakter olmalı (harf/rakam/boşluk/_).",
    company: "Şirket adı 2–150 karakter olmalı ve yalnızca geçerli karakterler içermeli.",
    password: "Şifre en az 8 karakter ve hem harf hem rakam içermelidir.",
    phone: "Geçersiz telefon numarası.",
    terms: "Kullanım ve gizlilik şartlarını kabul etmelisiniz.",
    captcha: "Doğrulama başarısız. Lütfen tekrar deneyin.",
    uniq: "Bu e-posta ile bir hesap zaten var.",
    success: "Satıcı kaydı başarılı. Hesabınız onay bekliyor.",
    fail: "Kayıt başarısız. Lütfen tekrar deneyin.",
  },
};

function t(req) {
  const raw = (req.headers.get("accept-language") || "").split(",")[0] || "en";
  return raw.toLowerCase().startsWith("tr") ? MSG.tr : MSG.en;
}

function withStd(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

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
    captcha: z.string().optional(),
  })
  .strict();

const normalize = (s) => s.replace(/\s+/g, " ").trim();

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
        { status: 400 },
      ),
    );
  }

  const M = t(req);

  // ---- Rate-limit (IP+UA+scope)
  {
    const rlKey = makeRateLimitKey(req, { scope: RL_SCOPE }); // IP + UA + scope
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
          { status: 429, headers: { "Retry-After": String(retrySec) } },
        ),
      );
    }
  }

  // ---- Body parse
  let raw;
  try {
    raw = await req.json();
  } catch {
    return withStd(
      NextResponse.json(
        { success: false, error: "invalid_request", message: M.required, request_id: requestId },
        { status: 400 },
      ),
    );
  }

  // ---- reCAPTCHA verify (server-side, IP ile)
  const capOk = await verifyRecaptchaFromRequest(req, raw?.captcha || null);
  if (!capOk) {
    audit({ evt: "merchant.register.captcha_fail", requestId });
    return withStd(
      NextResponse.json(
        { success: false, error: "captcha_failed", message: M.captcha, request_id: requestId },
        { status: 400 },
      ),
    );
  }

  // ---- Normalize + validate + sanitize
  const data = {
    name: sanitize.text(normalize(String(raw?.name ?? ""))),
    companyName: sanitize.text(normalize(String(raw?.companyName ?? ""))),
    email: String(raw?.email ?? "").trim().toLowerCase(),
    password: String(raw?.password ?? ""),
    phoneNumber: String(raw?.phoneNumber ?? "").trim(),
    termsAccepted: !!raw?.termsAccepted,
    captcha: String(raw?.captcha ?? ""),
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
        { success: false, error: "invalid_payload", message: fieldMsg, request_id: requestId },
        { status: 400 },
      ),
    );
  }

  const { name, companyName, email, password, phoneNumber } = parsed.data;

  // ---- Uniqueness
  const exists = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (exists) {
    audit({ evt: "merchant.register.conflict", requestId });
    return withStd(
      NextResponse.json(
        { success: false, error: "conflict", message: M.uniq, request_id: requestId },
        { status: 409 },
      ),
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
        phoneNumber,
        role: "merchant",
        status: "pending",
        termsAccepted: true,
        languagePreference: (req.headers.get("accept-language") || "")
          .toLowerCase()
          .startsWith("tr")
          ? "tr"
          : "en",
      },
    });

    audit({ evt: "merchant.register.ok", requestId, email });
    return withStd(
      NextResponse.json(
        { success: true, message: M.success, request_id: requestId },
        { status: 200 },
      ),
    );
  } catch (e) {
    audit({ evt: "merchant.register.db_error", requestId, code: e?.code || "DB_ERR" });
    return withStd(
      NextResponse.json(
        { success: false, error: "server_error", message: M.fail, request_id: requestId },
        { status: 500 },
      ),
    );
  }
}
