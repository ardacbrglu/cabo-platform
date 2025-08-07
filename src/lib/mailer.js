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

// ✅ Hesap aktivasyon maili gönderimi
export async function sendActivationEmail(to, token) {
  // Link sadece aktivasyon için → /activate?token=... 
  const url = `${process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL}/activate?token=${token}&lang=${user.languagePreference || 'en'}`;

  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'Cabo <no-reply@localhost>',
      to,
      subject: 'Activate your Cabo account!',
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #111; padding: 20px; border-radius: 10px; color: #fff;">
          <h2 style="color: #81d742;">Welcome to Cabo!</h2>
          <p>To activate your account, click the button below:</p>
          <a href="${url}" target="_blank" style="display:inline-block; padding: 12px 24px; background-color: #81d742; color: #111; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Activate Your Account
          </a>
          <p style="margin-top: 20px; color: #aaa;">If you didn’t request this, you can ignore this email.</p>
          <p style="color: #666;">— Cabo Team</p>
        </div>
      `,
    });
    console.log("✅ Activation email sent to:", to.replace(/(.{2}).*(@.*)/, "$1***$2"));
  } catch (err) {
    console.error("❌ Activation email error:", err);
    throw new Error("Failed to send activation email");
  }
}

// ✅ Şifre sıfırlama maili gönderimi
export async function sendPasswordResetEmail(to, token) {
  // Link sadece password reset için → /password_reset?token=...
  const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL}/password_reset?token=${token}`;

  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'Cabo <no-reply@localhost>',
      to,
      subject: "Reset your Cabo password",
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #111; padding: 20px; border-radius: 10px; color: #fff;">
          <h2 style="color: #f39c12;">Password Reset</h2>
          <p>You requested a password reset. Click the button below to continue:</p>
          <a href="${resetUrl}" target="_blank" style="display:inline-block; padding: 12px 24px; background-color: #f39c12; color: #111; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Reset My Password
          </a>
          <p style="margin-top: 20px; color: #aaa;">This link will expire in 15 minutes. If you didn’t request this, you can ignore this email.</p>
          <p style="color: #666;">— Cabo Security Team</p>
        </div>
      `,
    });
    console.log("✅ Password reset email sent to:", to.replace(/(.{2}).*(@.*)/, "$1***$2"));
  } catch (err) {
    console.error("❌ Password reset email error:", err);
    throw new Error("Failed to send reset email");
  }
}
