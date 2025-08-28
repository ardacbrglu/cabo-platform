// File: src/lib/mailer.js
// Purpose: Activation & password-reset emails (Brevo first, optional Resend)
// Security Docblock (Cabo PROD):
// - Sadece HTTPS 443 çıkışı; SMTP fallback devre dışı (env ile açılabilir).
// - IPv4-first DNS; tokenli URL'ler loglanmaz.
// - Hata sözleşmesi: MailerError { code: MAIL_*, kind, status?, original }.

import "server-only";
import dns from "dns";

// ---- IPv4-first (Node DNS)
try { dns.setDefaultResultOrder?.("ipv4first"); } catch {}

// ---------------- Flags & helpers ----------------
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

// ---------------- Base URL ----------------
function computeOrigin() {
  const base =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.BASE_URL ||
    "http://localhost:3000";
  try { return new URL(base).origin; } catch { return "http://localhost:3000"; }
}
const ORIGIN = computeOrigin();

// ---------------- Content ----------------
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

// ============================================================
// 1) BREVO (Sendinblue) — primary (HTTP/443, domain gerekmez)
// ============================================================
const BREVO_API_KEY = (process.env.BREVO_API_KEY || "").trim();
const BREVO_FROM = (process.env.BREVO_FROM || "").trim(); // "Cabo <caboaffiliates@gmail.com>"
const REPLY_TO = (process.env.REPLY_TO || "").trim() || undefined;

async function brevoSend({ to, subject, text, html }) {
  if (!BREVO_API_KEY) throw new MailerError("config", new Error("BREVO_API_KEY missing"));
  if (!BREVO_FROM)   throw new MailerError("config", new Error("BREVO_FROM missing"));

  // parse "Name <email>"
  const m = BREVO_FROM.match(/^(.*)<([^>]+)>$/);
  const sender = m
    ? { name: m[1].trim().replace(/(^"|"$)/g, ""), email: m[2].trim() }
    : { name: BREVO_FROM, email: BREVO_FROM };

  const payload = {
    sender,
    to: (Array.isArray(to) ? to : [to]).map(e => ({ email: e })),
    subject,
    htmlContent: html,
    textContent: text,
    replyTo: REPLY_TO ? { email: REPLY_TO } : undefined,
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "api-key": BREVO_API_KEY,
        "accept": "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const raw = await res.text().catch(() => "");
    clearTimeout(timer);

    if (res.status === 201) {
      let data; try { data = JSON.parse(raw); } catch {}
      dbg("Brevo mail sent →", maskEmail(to), "| id:", data?.messageId || "n/a");
      return { ok: true, messageId: data?.messageId || null };
    }

    let kind = "unknown";
    if (res.status === 401 || res.status === 403) kind = "auth";
    else if (res.status === 429) kind = "rate";
    else if (res.status >= 400 && res.status < 500) kind = "config";
    else kind = "network";

    const err = new MailerError(kind, new Error(`brevo_${res.status}: ${raw.slice(0,250)}`), res.status);
    const hint =
      kind === "auth" ? "Check BREVO_API_KEY; sender email must be verified in Brevo → Senders."
      : kind === "config" ? "BREVO_FROM must match a verified Sender (you confirmed via email)."
      : kind === "rate" ? "Brevo free plan limit reached (300/day)."
      : "Network to api.brevo.com:443.";
    console.error("[mailer] Brevo send failed:", err.code, "-", err.original);
    if (MAILER_DEBUG) console.error("[mailer] hint:", hint);
    throw err;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new MailerError("network", new Error("timeout"));
    throw e instanceof MailerError ? e : new MailerError("network", e);
  }
}

// ============================================================
// 2) RESEND — optional fallback (HTTP/443; domain gerektirir)
// ============================================================
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const RESEND_FROM = (process.env.RESEND_FROM || "Cabo <onboarding@resend.dev>").trim();

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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
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
    const raw = await res.text().catch(() => "");
    clearTimeout(timer);

    if (res.ok) {
      let data; try { data = JSON.parse(raw); } catch {}
      dbg("Resend mail sent →", maskEmail(to), "| id:", data?.id || "n/a");
      return { ok: true, messageId: data?.id || null };
    }

    let kind = "unknown";
    if (res.status === 401 || res.status === 403) kind = "auth";
    else if (res.status === 429) kind = "rate";
    else if (res.status >= 400 && res.status < 500) kind = "config";
    else kind = "network";

    const err = new MailerError(kind, new Error(`resend_${res.status}: ${raw.slice(0,250)}`), res.status);
    console.error("[mailer] Resend send failed:", err.code, "-", err.original);
    throw err;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new MailerError("network", new Error("timeout"));
    throw e instanceof MailerError ? e : new MailerError("network", e);
  }
}

// ---------------- Public API ----------------
async function sendGeneric(kind, to, url, locale) {
  const { subject, text, html } = subjectAndBody(kind, url, locale);

  // 1) Brevo (sender e-postayı doğruladığın an çalışır)
  if (BREVO_API_KEY) {
    try {
      return await brevoSend({ to, subject, text, html });
    } catch (e) {
      // Resend yedeğine düş (opsiyonel)
      if (!RESEND_API_KEY) throw e;
      try { return await resendSend({ to, subject, text, html }); }
      catch { throw e; } // Brevo hatası daha anlamlı
    }
  }

  // 2) Sadece Resend varsa (domain doğrulaması şart)
  if (RESEND_API_KEY) return resendSend({ to, subject, text, html });

  throw new MailerError("config", new Error("No mail provider configured"));
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
    provider: BREVO_API_KEY ? "brevo" : (RESEND_API_KEY ? "resend" : "none"),
    prod: isProd,
    origin: ORIGIN,
    replyTo: REPLY_TO || null,
    brevo: { from: BREVO_FROM ? BREVO_FROM : null, key: BREVO_API_KEY ? "set" : "missing" },
    resend: { from: RESEND_FROM, key: RESEND_API_KEY ? "set" : "missing" },
  };
}
