// /lib/mailer.js
/**
 * PROD-READY Mailer
 * SECURITY NOTES:
 * - Kullanımda BASE_URL (server-side) zorunludur. NEXT_PUBLIC_* ile URL kurma yok.
 * - Gmail yerine alan adı SMTP + SPF/DKIM/DMARC önerilir.
 * - Linklere email parametresi eklemiyoruz (gereksiz PII sızıntısı).
 * - DKIM varsa otomatik ekler (ENV ile).
 */

import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || (SMTP_HOST.includes("gmail") ? 465 : 587));
const SMTP_SECURE = SMTP_PORT === 465; // 465 → TLS
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || "Cabo <no-reply@localhost>";
const BASE_URL = process.env.BASE_URL; // Örn: https://app.cabo.com

if (!SMTP_USER || !SMTP_PASS) {
  throw new Error("SMTP_USER/SMTP_PASS env is missing.");
}
if (!BASE_URL) {
  throw new Error("BASE_URL env is missing (e.g. https://app.cabo.com).");
}

// Opsiyonel DKIM
const dkim =
  process.env.DKIM_DOMAIN &&
  process.env.DKIM_SELECTOR &&
  process.env.DKIM_PRIVATE_KEY
    ? {
        domainName: process.env.DKIM_DOMAIN,
        keySelector: process.env.DKIM_SELECTOR,
        privateKey: process.env.DKIM_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }
    : undefined;

// Havuzlu transporter (daha stabil teslimat)
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  pool: true,
  maxConnections: 3,
  maxMessages: 100,
  connectionTimeout: 15_000,
  socketTimeout: 20_000,
  dkim,
  // tls: { rejectUnauthorized: true }, // self-signed kullanmıyorsan açık kalsın
});

// İlk kullanımda bağlantıyı doğrula (log’da e‑posta sızdırma yok)
let verifiedOnce = false;
async function ensureVerified() {
  if (verifiedOnce) return;
  try {
    await transporter.verify();
    verifiedOnce = true;
  } catch (e) {
    console.error("[mailer] transporter.verify() failed:", e?.message || e);
    // Prod’da bile fail-fast daha iyi: config hatasını erken yakala
    throw e;
  }
}

/** Yardımcı: URL’leri güvenli kur (tek slash, https) */
function urlJoin(base, pathQuery) {
  const baseTrim = base.replace(/\/+$/, "");
  const pathTrim = pathQuery.startsWith("/") ? pathQuery : `/${pathQuery}`;
  return `${baseTrim}${pathTrim}`;
}

/** Ortak gönderim (HTML + text) */
async function sendMail({ to, subject, html, text, headers = {} }) {
  await ensureVerified();
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    html,
    text,
    headers: {
      // Altyapı/abuse ekipleri için faydalı başlıklar (opsiyonel)
      "X-Mailer-Env": process.env.NODE_ENV || "development",
      ...headers,
    },
  });
  // PII’yi loglama: sadece maskele
  console.log("✉️ Mail sent to:", String(to).replace(/(.{2}).*(@.*)/, "$1***$2"));
}

/**
 * Aktivasyon e-postası
 * Frontend linki: /activate?token=...
 * NOT: email parametresi EKLEMİYORUZ (PII sızıntısını azalt).
 */
export async function sendActivationEmail(to, token, language = "en") {
  const activateUrl = urlJoin(BASE_URL, `activate?token=${encodeURIComponent(token)}&lang=${language}`);
  const isTR = language === "tr";

  const subject = isTR ? "Cabo hesabını aktifleştir!" : "Activate your Cabo account!";
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #111; padding: 20px; border-radius: 10px; color: #fff;">
      <h2 style="color: #81d742;">${isTR ? "Cabo'ya Hoş Geldin!" : "Welcome to Cabo!"}</h2>
      <p>${isTR ? "Hesabını aktifleştirmek için aşağıdaki butona tıklayabilirsin:" : "To activate your account, click the button below:"}</p>
      <a href="${activateUrl}" style="display:inline-block; padding: 12px 24px; background-color: #81d742; color: #111; border-radius: 8px; text-decoration: none; font-weight: bold;">
        ${isTR ? "Hesabımı Aktifleştir" : "Activate Your Account"}
      </a>
      <p style="margin-top: 20px; color: #aaa;">${
        isTR ? "Bu isteği sen yapmadıysan bu e-postayı dikkate alma." : "If you didn’t request this, you can ignore this email."
      }</p>
      <p style="color: #666;">— Cabo Team</p>
    </div>
  `;
  const text = isTR
    ? `Cabo'ya Hoş Geldin!\nHesabını aktifleştirmek için bu bağlantıyı aç:\n${activateUrl}\n\nEğer bu talebi sen yapmadıysan, e-postayı yok sayabilirsin.\n— Cabo Team`
    : `Welcome to Cabo!\nTo activate your account, open this link:\n${activateUrl}\n\nIf you didn’t request this, you can ignore this email.\n— Cabo Team`;

  await sendMail({ to, subject, html, text });
}

/**
 * Şifre sıfırlama e-postası
 * Frontend linki: /password_reset?token=...&lang=...
 * NOT: Kısa ömürlü token’lar kullandığından emin ol (ör. 15 dk).
 */
export async function sendPasswordResetEmail(to, token, language = "en") {
  const resetUrl = urlJoin(BASE_URL, `password_reset?token=${encodeURIComponent(token)}&lang=${language}`);
  const isTR = language === "tr";

  const subject = isTR ? "Cabo şifreni sıfırla" : "Reset your Cabo password";
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #111; padding: 20px; border-radius: 10px; color: #fff;">
      <h2 style="color: #f39c12;">${isTR ? "Şifre Sıfırlama" : "Password Reset"}</h2>
      <p>${isTR ? "Şifreni sıfırlamak için aşağıdaki butona tıkla:" : "You requested a password reset. Click the button below to continue:"}</p>
      <a href="${resetUrl}" style="display:inline-block; padding: 12px 24px; background-color: #f39c12; color: #111; border-radius: 8px; text-decoration: none; font-weight: bold;">
        ${isTR ? "Şifremi Sıfırla" : "Reset My Password"}
      </a>
      <p style="margin-top: 20px; color: #aaa;">${
        isTR
          ? "Bu bağlantı kısa süre içinde geçerliliğini yitirir. Bu isteği sen yapmadıysan, bu e-postayı dikkate alma."
          : "This link will expire soon. If you didn’t request this, you can ignore this email."
      }</p>
      <p style="color: #666;">— Cabo Security Team</p>
    </div>
  `;
  const text = isTR
    ? `Şifre Sıfırlama\nŞifreni sıfırlamak için bu bağlantıyı aç:\n${resetUrl}\n\nBağlantı kısa süre içinde geçerliliğini yitirir. Talep etmediysen yok say.\n— Cabo Security Team`
    : `Password Reset\nTo reset your password, open this link:\n${resetUrl}\n\nThis link will expire soon. If you didn’t request this, ignore it.\n— Cabo Security Team`;

  await sendMail({ to, subject, html, text });
}
