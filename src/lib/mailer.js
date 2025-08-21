/**
 * File: src/lib/mailer.js
 * Purpose: Aktivasyon ve şifre sıfırlama e-postaları.
 * Security Docblock:
 * - Linkler yalnız gerekli parametreleri içerir (token).
 * - Base URL öncelik: NEXTAUTH_URL > NEXT_PUBLIC_BASE_URL > BASE_URL.
 * - Üretimde secure SMTP ve from adresi zorunlu.
 */

import nodemailer from "nodemailer";

const ORIGIN =
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.BASE_URL ||
  "http://localhost:3000";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 465),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
});

function maskEmail(e) {
  return String(e || "").replace(/(.{2}).*(@.*)/, "$1***$2");
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
    return {
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;background:#111;padding:20px;border-radius:10px;color:#fff;">
          <h2 style="color:#81d742">${h2}</h2>
          <p>${p}</p>
          <a href="${url}" target="_blank" style="display:inline-block;padding:12px 24px;background:#81d742;color:#111;border-radius:8px;text-decoration:none;font-weight:bold">
            ${btn}
          </a>
          <p style="margin-top:20px;color:#aaa">${ignore}</p>
          <p style="color:#666">— Cabo Team</p>
        </div>
      `,
    };
  }

  // password reset
  const subject = tr ? "Cabo şifreni sıfırla" : "Reset your Cabo password";
  const btn = tr ? "Şifremi Sıfırla" : "Reset My Password";
  const h2 = tr ? "Şifre Sıfırlama" : "Password Reset";
  const p = tr
    ? "Şifreni sıfırlamak için aşağıdaki butona tıkla:"
    : "You requested a password reset. Click the button below to continue:";
  const exp = tr
    ? "Bu bağlantı 15 dakika sonra geçersiz olacaktır. İsteği sen yapmadıysan bu e-postayı yok sayabilirsin."
    : "This link will expire in 15 minutes. If you didn’t request this, you can ignore this email.";
  return {
    subject,
    html: `
      <div style="font-family:Arial,sans-serif;background:#111;padding:20px;border-radius:10px;color:#fff;">
        <h2 style="color:#f39c12">${h2}</h2>
        <p>${p}</p>
        <a href="${url}" target="_blank" style="display:inline-block;padding:12px 24px;background:#f39c12;color:#111;border-radius:8px;text-decoration:none;font-weight:bold">
          ${btn}
        </a>
        <p style="margin-top:20px;color:#aaa">${exp}</p>
        <p style="color:#666">— Cabo Security Team</p>
      </div>
    `,
  };
}

export async function sendActivationEmail(to, token, locale = "en") {
  const url = `${ORIGIN}/activate?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(
    locale
  )}`;
  const { subject, html } = subjectAndBody("activation", url, locale);
  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || "Cabo <no-reply@localhost>",
      to,
      subject,
      html,
    });
    console.log("✅ Activation email sent:", maskEmail(to));
  } catch (err) {
    console.error("❌ Activation email error:", err);
    throw new Error("mail_send_failed");
  }
}

export async function sendPasswordResetEmail(to, token, locale = "en") {
  const url = `${ORIGIN}/password_reset?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(
    locale
  )}`;
  const { subject, html } = subjectAndBody("reset", url, locale);
  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || "Cabo <no-reply@localhost>",
      to,
      subject,
      html,
    });
    console.log("✅ Password reset email sent:", maskEmail(to));
  } catch (err) {
    console.error("❌ Password reset email error:", err);
    throw new Error("mail_send_failed");
  }
}
