import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Kayıt sonrası aktivasyon maili gönderir
 */
export async function sendActivationEmail(to, token) {
  const url = `${process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL}/activate?token=${token}`;
  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'Cabo <no-reply@localhost>',
      to,
      subject: 'Activate your Cabo account!',
      html: `
        <h2>Welcome to Cabo!</h2>
        <p>To activate your account, click the link below:</p>
        <a href="${url}" target="_blank">${url}</a>
        <p>If you didn't request this, ignore this email.</p>
        <p>— Cabo Team</p>
      `,
    });
    console.log("✅ Activation email sent to:", to);
  } catch (err) {
    console.error("❌ Activation email error:", err);
    throw new Error("Failed to send activation email");
  }
}

/**
 * Şifre sıfırlama maili gönderir
 */
export async function sendPasswordResetEmail(to, token) {
  const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL}/password_reset?token=${token}`;
  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'Cabo <no-reply@localhost>',
      to,
      subject: "Reset your Cabo password",
      html: `
        <div style="font-family: Arial, sans-serif">
          <h2>Password Reset</h2>
          <p>Click the link below to reset your password:</p>
          <a href="${resetUrl}">${resetUrl}</a>
          <p>This link will expire in 15 minutes.</p>
        </div>
      `
    });
    console.log("✅ Password reset email sent to:", to);
  } catch (err) {
    console.error("❌ Password reset email error:", err);
    throw new Error("Failed to send reset email");
  }
}
