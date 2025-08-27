/**
 * File: src/lib/mailer.js
 * Purpose: Aktivasyon ve şifre sıfırlama e-postaları (detaylı debug’lu).
 *
 * ENV (önerilen):
 *   NEXTAUTH_URL=https://<senin-domainin>
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=465            # 465 -> secure TLS
 *   SMTP_USER=caboaffiliates@gmail.com
 *   SMTP_PASS=<Google App Password>   # 2FA + App Password şart
 *   FROM_EMAIL=Cabo <caboaffiliates@gmail.com>
 *   MAILER_DEBUG=1           # prod’da ayrıntılı log için
 */

import "server-only";
import nodemailer from "nodemailer";

/* -------------------- small logger -------------------- */
const isProd = process.env.NODE_ENV === "production";
const DEBUG = (process.env.MAILER_DEBUG || "").trim() === "1" || !isProd;

const log = {
  info: (...a) => console.log("[mailer]", ...a),
  warn: (...a) => console.warn("[mailer]", ...a),
  error: (...a) => console.error("[mailer]", ...a),
};

/* -------------------- ORIGIN -------------------- */
function computeOrigin() {
  const base =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_RECAPTCHA_BASE_URL || // typo’lara karşı tolerans
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

/* -------------------- ENV -------------------- */
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || "Cabo <no-reply@localhost>";

/* -------------------- prod korumaları -------------------- */
if (isProd) {
  const originUrl = new URL(ORIGIN);
  const onHttps = originUrl.protocol === "https:";
  const localhostLike =
    /^localhost$/i.test(originUrl.hostname) ||
    /^127\.0\.0\.1$/i.test(originUrl.hostname) ||
    /\.local$/i.test(originUrl.hostname);

  if (!onHttps || localhostLike) {
    throw new Error(
      "[mailer] In production, ORIGIN must be HTTPS and non-localhost. Check NEXTAUTH_URL / BASE_URL."
    );
  }
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !FROM_EMAIL) {
    throw new Error(
      "[mailer] Missing SMTP config. Require SMTP_HOST, SMTP_USER, SMTP_PASS, FROM_EMAIL in production."
    );
  }
}

/* -------------------- helpers -------------------- */
function mask(s, keep = 3) {
  if (!s) return "";
  const str = String(s);
  if (str.length <= keep) return "*".repeat(str.length);
  return str.slice(0, keep) + "*".repeat(Math.max(0, str.length - keep));
}
function maskEmail(e) {
  return String(e || "").replace(/(.{2}).*(@.*)/, "$1***$2");
}
function emailDomain(e) {
  const m = String(e || "").match(/@([^>]+)>?$|@(.+)$/);
  return m ? (m[1] || m[2] || "").toLowerCase() : "";
}
function buildUrl(pathname, params = {}) {
  const url = new URL(pathname, ORIGIN);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  return url.toString();
}

function subjectAndBody(kind, url, locale = "en") {
  const tr = locale === "tr";

  if (kind === "activation") {
    const subject = tr ? "Cabo hesabını aktifleştir!" : "Activate your Cabo account!";
    const btn = tr ? "Hesabımı Aktifleştir" : "Activate Your Account";
    const h2 = tr ? "Cabo'ya hoş geldin!" : "Welcome to Cabo!";
    const p = tr
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
  const p = tr
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

/* -------------------- transporter -------------------- */
const secureFlag = SMTP_PORT === 465;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST || "smtp.gmail.com",
  port: SMTP_PORT,
  secure: secureFlag,
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

/* log sanitized config once (when MAILER_DEBUG=1 or dev) */
(function logConfigOnce() {
  if (!DEBUG) return;
  const fromDom = emailDomain(FROM_EMAIL);
  const userDom = emailDomain(SMTP_USER);
  log.info("config:", {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: secureFlag,
    user: maskEmail(SMTP_USER),
    pass_set: !!SMTP_PASS,
    from: FROM_EMAIL,
    from_domain: fromDom,
    user_domain: userDom,
    domain_match: fromDom && userDom ? fromDom === userDom : "n/a",
    dkim: !!(process.env.DKIM_DOMAIN && process.env.DKIM_SELECTOR && process.env.DKIM_PRIVATE_KEY),
    origin: ORIGIN,
    env: process.env.NODE_ENV,
  });
})();

/* -------------------- verify (once) -------------------- */
let verifiedOnce = false;
async function smtpVerifyOnce() {
  if (verifiedOnce) return;
  try {
    await transporter.verify();
    verifiedOnce = true;
    if (DEBUG) log.info("SMTP verify: OK");
  } catch (e) {
    // verify başarısız olsa bile göndermeyi deneyebiliriz; ama loglayalım
    log.warn("SMTP verify failed (devam edilmeye çalışılacak):", {
      code: e?.code,
      responseCode: e?.responseCode,
      command: e?.command,
      message: e?.message,
    });
  }
}

/* dışarıdan çağırıp tek başına test etmek için */
export async function verifySMTP() {
  try {
    await transporter.verify();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      code: e?.code || null,
      responseCode: e?.responseCode || null,
      command: e?.command || null,
      message: e?.message || String(e),
    };
  }
}

/* -------------------- error mapping -------------------- */
function mapSmtpError(err) {
  const code = err?.code || "";
  const resp = err?.response || "";
  const rCode = err?.responseCode;

  // Gmail tipik durumlar
  if (code === "EAUTH" || rCode === 534 || rCode === 535) {
    return {
      kind: "smtp_auth",
      hint:
        "Auth failed. Gmail için 2FA + Uygulama Şifresi kullanın. SMTP_USER/FROM_EMAIL aynı domain/hesap olmalı.",
    };
  }
  if (code === "ECONNECTION" || code === "ETIMEDOUT") {
    return { kind: "smtp_conn", hint: "SMTP bağlantısı kurulamadı. Port/host/firewall kontrol." };
  }
  if (code === "EENVELOPE") {
    return { kind: "smtp_from", hint: "FROM_EMAIL geçersiz görünüyor." };
  }
  if (code === "EPROTOCOL" || /Must issue a STARTTLS/i.test(resp)) {
    return { kind: "smtp_tls", hint: "TLS/StartTLS sorunu. 465 kullanıyorsanız secure:true olmalı." };
  }
  if (/Rate limit/i.test(resp) || rCode === 421) {
    return { kind: "smtp_rate", hint: "SMTP rate limit. Bir süre bekleyip tekrar deneyin." };
  }
  return { kind: "smtp_unknown", hint: "Bilinmeyen SMTP hatası. Logları inceleyin." };
}

/* -------------------- public API -------------------- */
export async function sendActivationEmail(to, token, locale = "en") {
  await smtpVerifyOnce();

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
    if (DEBUG) log.info("sent activation", { to: maskEmail(to), id: info?.messageId || null });
    return { ok: true, messageId: info?.messageId || null };
  } catch (err) {
    const mapped = mapSmtpError(err);
    log.error("Activation email error:", {
      kind: mapped.kind,
      hint: mapped.hint,
      code: err?.code,
      responseCode: err?.responseCode,
      command: err?.command,
      message: err?.message || String(err),
    });
    // Route katmanı geriye sadece 500 döndürse bile ayrıntı loglarda.
    throw new Error("mail_send_failed");
  }
}

export async function sendPasswordResetEmail(to, token, locale = "en") {
  await smtpVerifyOnce();

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
    if (DEBUG) log.info("sent reset", { to: maskEmail(to), id: info?.messageId || null });
    return { ok: true, messageId: info?.messageId || null };
  } catch (err) {
    const mapped = mapSmtpError(err);
    log.error("Password reset email error:", {
      kind: mapped.kind,
      hint: mapped.hint,
      code: err?.code,
      responseCode: err?.responseCode,
      command: err?.command,
      message: err?.message || String(err),
    });
    throw new Error("mail_send_failed");
  }
}
