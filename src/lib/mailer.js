// File: src/lib/mailer.js
// Purpose: Activation & password-reset emails (HTTPS API first, SMTP fallback)
// Security Docblock:
// - Server-only; tokenli URL’ler loglanmaz (yalnız maske’li alıcı).
// - Prod’da TLS 1.2+; DKIM opsiyonel.
// - Hata sözleşmesi: throw MailerError { code: MAIL_* , kind, original }.
// - Öncelik: RESEND (HTTPS 443) → SMTP fallback (465/587).

import "server-only";
import nodemailer from "nodemailer";

/* ---------------- Runtime flags & helpers ---------------- */
const isProd = process.env.NODE_ENV === "production";
const MAILER_DEBUG = process.env.MAILER_DEBUG === "1";
const dbg = (...a) => { if (MAILER_DEBUG) console.log("[mailer]", ...a); };
const maskEmail = (e) => String(e || "").replace(/(.{2}).*(@.*)/, "$1***$2");

class MailerError extends Error {
  constructor(kind = "unknown", original) {
    super("mail_send_failed");
    this.name = "MailerError";
    this.kind = kind;
    this.code = `MAIL_${String(kind).toUpperCase()}`; // MAIL_AUTH / MAIL_NETWORK / MAIL_CONFIG / MAIL_UNKNOWN
    this.original = original ? String(original?.message || original) : "";
  }
}

/* ---------------- Base URL (activation/reset links) ---------------- */
function computeOrigin() {
  const base =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.BASE_URL ||
    "http://localhost:3000";
  try { return new URL(base).origin; } catch { return "http://localhost:3000"; }
}
const ORIGIN = computeOrigin();

/* ---------------- Content ---------------- */
function buildUrl(pathname, params = {}) {
  const url = new URL(pathname, ORIGIN);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function subjectAndBody(kind, url, locale = "en") {
  const tr = locale === "tr";

  if (kind === "activation") {
    const subject = tr ? "Cabo hesabını aktifleştir!" : "Activate your Cabo account!";
    const btn = tr ? "Hesabımı Aktifleştir" : "Activate Your Account";
    const h2 = tr ? "Cabo'ya hoş geldin!" : "Welcome to Cabo!";
    const p  = tr
      ? "Hesabını aktifleştirmek için aşağıdaki butona tıkla:"
      : "To activate your account, click the button below:";
    const ignore = tr
      ? "Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin."
      : "If you didn’t request this, you can ignore this email.";

    const text = [h2, "", p, url, "", ignore, "", "— Cabo Team"].join("\n");
    const html = `
      <div style="font-family:Arial,sans-serif;background:#111;padding:20px;border-radius:10px;color:#fff;">
        <h2 style="color:#81d742">${h2}</h2>
        <p>${p}</p>
        <a href="${url}" target="_blank" rel="noopener noreferrer"
           style="display:inline-block;padding:12px 24px;background:#81d742;color:#111;border-radius:8px;text-decoration:none;font-weight:bold">
          ${btn}
        </a>
        <p style="margin-top:20px;color:#aaa">${ignore}</p>
        <p style="color:#666">— Cabo Team</p>
      </div>
    `;
    return { subject, text, html };
  }

  const subject = tr ? "Cabo şifreni sıfırla" : "Reset your Cabo password";
  const btn = tr ? "Şifremi Sıfırla" : "Reset My Password";
  const h2 = tr ? "Şifre Sıfırlama" : "Password Reset";
  const p  = tr
    ? "Şifreni sıfırlamak için aşağıdaki butona tıkla:"
    : "You requested a password reset. Click the button below to continue:";
  const exp = tr
    ? "Bu bağlantı 15 dakika sonra geçersiz olacaktır. İsteği sen yapmadıysan bu e-postayı yok sayabilirsin."
    : "This link will expire in 15 minutes. If you didn’t request this, you can ignore this email.";

  const text = [h2, "", p, url, "", exp, "", "— Cabo Security Team"].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;background:#111;padding:20px;border-radius:10px;color:#fff;">
      <h2 style="color:#f39c12">${h2}</h2>
      <p>${p}</p>
      <a href="${url}" target="_blank" rel="noopener noreferrer"
         style="display:inline-block;padding:12px 24px;background:#f39c12;color:#111;border-radius:8px;text-decoration:none;font-weight:bold">
        ${btn}
      </a>
      <p style="margin-top:20px;color:#aaa">${exp}</p>
      <p style="color:#666">— Cabo Security Team</p>
    </div>
  `;
  return { subject, text, html };
}

/* ===================================================================
   1) RESEND (HTTPS 443) — birinci tercih
   =================================================================== */
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || process.env.FROM_EMAIL || "Cabo <no-reply@example.com>";

async function resendSend({ to, subject, text, html }) {
  // Bağımlılık yok: direkt HTTPS çağrısı
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`resend_${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json().catch(() => ({}));
    dbg("Resend mail sent →", maskEmail(to), "| id:", data?.id || "n/a");
    return { ok: true, messageId: data?.id || null };
  } catch (e) {
    clearTimeout(timer);
    // Resend hata kodlarını network kategorisine düşürmek en doğrusu
    throw new MailerError("network", e);
  }
}

/* ===================================================================
   2) SMTP (465/587) — fallback
   =================================================================== */
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465); // 465 TLS, 587 STARTTLS
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM =
  process.env.FROM_EMAIL ||
  process.env.SMTP_FROM ||
  "Cabo <no-reply@localhost>";

const SECURE = SMTP_PORT === 465;

function classifyMailError(err) {
  const msg = String(err?.message || err);
  let kind = "unknown";
  if (/Invalid login|Username and Password not accepted|AUTH|535|534/i.test(msg)) kind = "auth";
  else if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|timeout/i.test(msg)) kind = "network";
  else if (/No recipients defined|Missing credentials/i.test(msg)) kind = "config";
  let hint = "";
  if (kind === "auth") hint = "Check SMTP_USER/SMTP_PASS (Gmail App Password required).";
  if (kind === "network") hint = `Check SMTP_HOST/PORT (${SMTP_HOST}:${SMTP_PORT}) and outbound rules.`;
  if (kind === "config") hint = "Check FROM_EMAIL / recipient / mandatory fields.";
  return { kind, message: msg, hint };
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SECURE,              // 465 TLS
  requireTLS: !SECURE,         // 587 STARTTLS
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
  connectionTimeout: 15_000,
  socketTimeout: 20_000,
  tls: { minVersion: "TLSv1.2", rejectUnauthorized: isProd ? true : false },
  dkim:
    process.env.DKIM_DOMAIN &&
    process.env.DKIM_SELECTOR &&
    process.env.DKIM_PRIVATE_KEY
      ? {
          domainName: process.env.DKIM_DOMAIN,
          keySelector: process.env.DKIM_SELECTOR,
          privateKey: process.env.DKIM_PRIVATE_KEY,
        }
      : undefined,
});

let verifiedOnce = false;
async function ensureVerified() {
  if (verifiedOnce || !isProd) return;
  try {
    await transporter.verify();
    verifiedOnce = true;
    dbg(`SMTP verify OK → ${SMTP_HOST}:${SMTP_PORT}, secure=${SECURE}`);
  } catch (e) {
    const c = classifyMailError(e);
    console.error("[mailer] SMTP verify failed:", c.kind, "-", c.message);
    if (MAILER_DEBUG) console.error("[mailer] hint:", c.hint);
    // verify başarısız olsa da gerçek gönderimde tekrar deneyeceğiz
  }
}

async function smtpSend({ to, subject, text, html }) {
  await ensureVerified();
  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text,
      html,
    });
    dbg("SMTP mail sent →", maskEmail(to), "| id:", info?.messageId || "n/a");
    return { ok: true, messageId: info?.messageId || null };
  } catch (err) {
    const c = classifyMailError(err);
    console.error("❌ SMTP email error:", c.kind, "-", c.message);
    if (MAILER_DEBUG) console.error("[mailer] hint:", c.hint);
    throw new MailerError(c.kind, err);
  }
}

/* ---------------- Public API ---------------- */
async function sendGeneric(kind, to, url, locale) {
  const { subject, text, html } = subjectAndBody(kind, url, locale);

  // 1) RESEND var ise onu kullan
  if (RESEND_API_KEY) {
    try {
      return await resendSend({ to, subject, text, html });
    } catch (e) {
      // Fallback’e inmeden önce logla
      console.error("[mailer] Resend send failed:", e?.code || e?.kind || e);
      // devam → SMTP
    }
  }

  // 2) SMTP fallback
  return smtpSend({ to, subject, text, html });
}

export async function sendActivationEmail(to, token, locale = "en") {
  const url = buildUrl("/activate", { token, lang: locale });
  const res = await sendGeneric("activation", to, url, locale);
  return res;
}

export async function sendPasswordResetEmail(to, token, locale = "en") {
  const url = buildUrl("/password_reset", { token, lang: locale });
  const res = await sendGeneric("reset", to, url, locale);
  return res;
}

export function getMailerStatus() {
  return {
    prod: isProd,
    origin: ORIGIN,
    provider: RESEND_API_KEY ? "resend" : "smtp",
    smtp: {
      host: SMTP_HOST, port: SMTP_PORT, secure: SECURE,
      user: maskEmail(SMTP_USER), from: SMTP_FROM, verified: verifiedOnce
    },
    resend: { from: RESEND_FROM, key: RESEND_API_KEY ? "set" : "missing" },
  };
}
