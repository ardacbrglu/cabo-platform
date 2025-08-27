// File: src/lib/mailer.js
// Purpose: Activation & password-reset emails (production-safe)

import "server-only";
import nodemailer from "nodemailer";

/* ---------------- Base URL (activation/reset links) ---------------- */
function computeOrigin() {
  const base =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.BASE_URL ||
    "http://localhost:3000";
  try {
    return new URL(base).origin;
  } catch {
    return "http://localhost:3000";
  }
}
const ORIGIN = computeOrigin();
const isProd = process.env.NODE_ENV === "production";
const MAILER_DEBUG = process.env.MAILER_DEBUG === "1";

/* ---------------- Env & helpers ---------------- */
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465); // 465=TLS, 587=STARTTLS
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const FROM_EMAIL =
  process.env.FROM_EMAIL ||
  process.env.SMTP_FROM || // backward compat
  "Cabo <no-reply@localhost>";

const SECURE = SMTP_PORT === 465; // nodemailer: secure=true => TLS from start

const maskEmail = (e) => String(e || "").replace(/(.{2}).*(@.*)/, "$1***$2");
const dbg = (...a) => { if (MAILER_DEBUG) console.log("[mailer]", ...a); };

function classifyMailError(err) {
  const msg = String(err?.message || err);
  let kind = "unknown";
  if (/Invalid login|Username and Password not accepted|AUTH|535|534/i.test(msg)) {
    kind = "auth";
  } else if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|timeout/i.test(msg)) {
    kind = "network";
  } else if (/No recipients defined|Missing credentials/i.test(msg)) {
    kind = "config";
  }
  let hint = "";
  if (kind === "auth") hint = "Check SMTP_USER/SMTP_PASS (Gmail App Password required).";
  if (kind === "network") hint = `Check SMTP_HOST/PORT (${SMTP_HOST}:${SMTP_PORT}) and outbound rules.`;
  if (kind === "config") hint = "Check FROM_EMAIL / recipient / mandatory fields.";
  return { kind, message: msg, hint };
}

/* ---------------- Transport (lazy-verified) ---------------- */
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
    // verification failure should not crash import; real send will throw anyway
  }
}

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

/* ---------------- Public API ---------------- */
export async function sendActivationEmail(to, token, locale = "en") {
  await ensureVerified();

  // Do NOT log the URL (token). Only log masked recipient.
  const url = buildUrl("/activate", { token, lang: locale });
  const { subject, text, html } = subjectAndBody("activation", url, locale);

  try {
    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      text,
      html,
    });
    dbg("Activation mail sent →", maskEmail(to), "| id:", info?.messageId || "n/a");
    return { ok: true, messageId: info?.messageId || null };
  } catch (err) {
    const c = classifyMailError(err);
    console.error("❌ Activation email error:", c.kind, "-", c.message);
    if (MAILER_DEBUG) console.error("[mailer] hint:", c.hint);
    throw new Error("mail_send_failed");
  }
}

export async function sendPasswordResetEmail(to, token, locale = "en") {
  await ensureVerified();

  const url = buildUrl("/password_reset", { token, lang: locale });
  const { subject, text, html } = subjectAndBody("reset", url, locale);

  try {
    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      text,
      html,
    });
    dbg("Reset mail sent →", maskEmail(to), "| id:", info?.messageId || "n/a");
    return { ok: true, messageId: info?.messageId || null };
  } catch (err) {
    const c = classifyMailError(err);
    console.error("❌ Password reset email error:", c.kind, "-", c.message);
    if (MAILER_DEBUG) console.error("[mailer] hint:", c.hint);
    throw new Error("mail_send_failed");
  }
}

/* Optional: small status helper for /api/health if you add one later */
export function getMailerStatus() {
  return {
    prod: isProd,
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SECURE,
    user: maskEmail(SMTP_USER),
    from: FROM_EMAIL,
    origin: ORIGIN,
    verified: verifiedOnce,
  };
}
