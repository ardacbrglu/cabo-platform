// File: src/lib/mailer.js
// Purpose: Activation & password-reset emails (Resend first, optional SMTP)
// Security Docblock (Cabo PROD):
// - HTTPS 443 öncelik; SMTP fallback env ile kapatılabilir.
// - IPv4-first: DNS düzeyinde (Node) IPv6 kaynaklı egress sorunlarını azaltır.
// - Hata sözleşmesi: MailerError { code: MAIL_*, kind, status?, original }.
// - Tokenli URL'ler loglanmaz (yalnız maskeli alıcı).

import "server-only";
import dns from "dns";
import nodemailer from "nodemailer";

// ---- IPv4-first (Node DNS)
try { dns.setDefaultResultOrder?.("ipv4first"); } catch {}

/* -------------------- flags & helpers -------------------- */
const isProd = process.env.NODE_ENV === "production";
const MAILER_DEBUG = process.env.MAILER_DEBUG === "1";
const dbg = (...a) => { if (MAILER_DEBUG) console.log("[mailer]", ...a); };
const maskEmail = (e) => String(e || "").replace(/(.{2}).*(@.*)/, "$1***$2");

class MailerError extends Error {
  constructor(kind = "unknown", original, status) {
    super("mail_send_failed");
    this.name = "MailerError";
    this.kind = kind;                           // "auth" | "config" | "network" | "rate" | "unknown"
    this.code = `MAIL_${String(kind).toUpperCase()}`;
    this.original = original ? String(original?.message || original) : "";
    if (status) this.status = status;
  }
}

/* -------------------- base URL for links -------------------- */
function computeOrigin() {
  const base =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.BASE_URL ||
    "http://localhost:3000";
  try { return new URL(base).origin; } catch { return "http://localhost:3000"; }
}
const ORIGIN = computeOrigin();

/* -------------------- email content -------------------- */
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

/* ============================================================
   1) RESEND (HTTPS) — primary
   ============================================================ */
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const RESEND_FROM = (process.env.RESEND_FROM || "Cabo <onboarding@resend.dev>").trim();
const REPLY_TO = (process.env.REPLY_TO || "").trim() || undefined;
const DISABLE_SMTP_FALLBACK = process.env.MAILER_DISABLE_SMTP_FALLBACK === "1";

// küçük yardımcı
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resendHttpSend(payload, timeoutMs = 10_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => "");
    clearTimeout(timer);
    return { res, text };
  } catch (e) {
    clearTimeout(timer);
    throw new MailerError("network", e);
  }
}

async function resendSend({ to, subject, text, html }) {
  if (!RESEND_API_KEY) throw new MailerError("config", new Error("RESEND_API_KEY missing"));

  const payload = {
    from: RESEND_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    reply_to: REPLY_TO,
  };

  // 1 deneme + network için 1 retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { res, text: rawText } = await resendHttpSend(payload, 10_000);
    if (res.ok) {
      let data; try { data = JSON.parse(rawText); } catch {}
      dbg("Resend mail sent →", maskEmail(to), "| id:", data?.id || "n/a");
      return { ok: true, messageId: data?.id || null };
    }

    let kind = "unknown";
    if (res.status === 401 || res.status === 403) kind = "auth";
    else if (res.status === 429) kind = "rate";
    else if (res.status >= 400 && res.status < 500) kind = "config";
    else kind = "network";

    const err = new MailerError(kind, new Error(`resend_${res.status}: ${rawText.slice(0, 250)}`), res.status);
    const hint =
      kind === "auth"
        ? "Check RESEND_API_KEY (no quotes, no < >, key active)."
        : kind === "config"
        ? "Check RESEND_FROM (use onboarding@resend.dev or verified domain) and recipient."
        : kind === "rate"
        ? "Rate limited; review Resend plan/limits."
        : "Network/SSL to api.resend.com:443.";

    console.error("[mailer] Resend send failed:", err.code, "-", err.original);
    if (MAILER_DEBUG) console.error("[mailer] hint:", hint);

    if (kind !== "network" || attempt === 2) throw err;
    await sleep(600);
  }
}

/* ============================================================
   2) SMTP (optional fallback)
   ============================================================ */
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 0);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM =
  process.env.FROM_EMAIL ||
  process.env.SMTP_FROM ||
  "Cabo <no-reply@localhost>";
const SMTP_SECURE = SMTP_PORT === 465;

function smtpConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && (SMTP_USER || SMTP_PASS));
}

function classifySmtp(err) {
  const msg = String(err?.message || err);
  let kind = "unknown";
  if (/Invalid login|Username and Password not accepted|AUTH|535|534/i.test(msg)) kind = "auth";
  else if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|timeout/i.test(msg)) kind = "network";
  else if (/No recipients defined|Missing credentials|from must be/i.test(msg)) kind = "config";
  return { kind, message: msg };
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST || undefined,
  port: SMTP_PORT || undefined,
  secure: SMTP_SECURE,
  requireTLS: !SMTP_SECURE,
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
  connectionTimeout: 12_000,
  socketTimeout: 15_000,
  tls: { minVersion: "TLSv1.2", rejectUnauthorized: isProd ? true : false },
});

let verifiedOnce = false;
async function ensureSmtpVerified() {
  if (verifiedOnce || !smtpConfigured() || !isProd) return;
  try {
    await transporter.verify();
    verifiedOnce = true;
    dbg(`SMTP verify OK → ${SMTP_HOST}:${SMTP_PORT}, secure=${SMTP_SECURE}`);
  } catch (e) {
    const { kind, message } = classifySmtp(e);
    console.error("[mailer] SMTP verify failed:", kind, "-", message);
  }
}

async function smtpSend({ to, subject, text, html }) {
  if (!smtpConfigured()) throw new MailerError("config", new Error("SMTP not configured"));
  await ensureSmtpVerified();
  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text,
      html,
      replyTo: REPLY_TO,
    });
    dbg("SMTP mail sent →", maskEmail(to), "| id:", info?.messageId || "n/a");
    return { ok: true, messageId: info?.messageId || null };
  } catch (e) {
    const { kind, message } = classifySmtp(e);
    console.error("✖ SMTP email error:", kind, "-", message);
    if (MAILER_DEBUG) {
      const hint =
        kind === "auth"
          ? "Check SMTP_USER/SMTP_PASS (Gmail needs App Password)."
          : kind === "network"
          ? `Check SMTP_HOST/PORT (${SMTP_HOST}:${SMTP_PORT}) and outbound rules.`
          : "Check FROM/recipient/config.";
      console.error("[mailer] hint:", hint);
    }
    throw new MailerError(kind, e);
  }
}

/* -------------------- public API -------------------- */
async function sendGeneric(kind, to, url, locale) {
  const { subject, text, html } = subjectAndBody(kind, url, locale);

  // 1) Resend (primary)
  if (RESEND_API_KEY) {
    try {
      return await resendSend({ to, subject, text, html });
    } catch (e) {
      if (DISABLE_SMTP_FALLBACK || !smtpConfigured()) throw e;
      // aksi halde SMTP'ye düş
    }
  }

  // 2) SMTP (optional)
  return smtpSend({ to, subject, text, html });
}

export async function sendActivationEmail(to, token, locale = "en") {
  const url = buildUrl("/activate", { token, lang: locale });
  return await sendGeneric("activation", to, url, locale);
}

export async function sendPasswordResetEmail(to, token, locale = "en") {
  const url = buildUrl("/password_reset", { token, lang: locale });
  return await sendGeneric("reset", to, url, locale);
}

export function getMailerStatus() {
  return {
    provider: RESEND_API_KEY ? "resend" : smtpConfigured() ? "smtp" : "none",
    prod: isProd,
    origin: ORIGIN,
    replyTo: REPLY_TO || null,
    resend: { from: RESEND_FROM, key: RESEND_API_KEY ? "set" : "missing" },
    smtp: {
      host: SMTP_HOST || null,
      port: SMTP_PORT || null,
      secure: SMTP_SECURE || null,
      user: maskEmail(SMTP_USER) || null,
      from: SMTP_FROM || null,
      verified: verifiedOnce,
      configured: smtpConfigured(),
    },
  };
}
