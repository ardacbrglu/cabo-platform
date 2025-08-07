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
export async function sendActivationEmail(to, token, language = "en") {
  // Link sadece aktivasyon için → /activate?token=...&lang=en
  const url = `${process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL}/activate?token=${token}&lang=${language}`;

  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'Cabo <no-reply@localhost>',
      to,
      subject: language === "tr" ? "Cabo hesabını aktifleştir!" : "Activate your Cabo account!",
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #111; padding: 20px; border-radius: 10px; color: #fff;">
          <h2 style="color: #81d742;">
            ${language === "tr" ? "Cabo'ya Hoş Geldin!" : "Welcome to Cabo!"}
          </h2>
          <p>
            ${language === "tr"
              ? "Hesabını aktifleştirmek için aşağıdaki butona tıklayabilirsin:"
              : "To activate your account, click the button below:"}
          </p>
          <a href="${url}" target="_blank" style="display:inline-block; padding: 12px 24px; background-color: #81d742; color: #111; border-radius: 8px; text-decoration: none; font-weight: bold;">
            ${language === "tr" ? "Hesabımı Aktifleştir" : "Activate Your Account"}
          </a>
          <p style="margin-top: 20px; color: #aaa;">
            ${language === "tr"
              ? "Bu isteği sen yapmadıysan bu e-postayı dikkate alma."
              : "If you didn’t request this, you can ignore this email."}
          </p>
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
export async function sendPasswordResetEmail(to, token, language = "en") {
  // Link → /password_reset?token=...&lang=tr
  const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL}/password_reset?token=${token}&lang=${language}`;

  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'Cabo <no-reply@localhost>',
      to,
      subject: language === "tr" ? "Cabo şifreni sıfırla" : "Reset your Cabo password",
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #111; padding: 20px; border-radius: 10px; color: #fff;">
          <h2 style="color: #f39c12;">
            ${language === "tr" ? "Şifre Sıfırlama" : "Password Reset"}
          </h2>
          <p>
            ${language === "tr"
              ? "Şifreni sıfırlamak için aşağıdaki butona tıkla:"
              : "You requested a password reset. Click the button below to continue:"}
          </p>
          <a href="${resetUrl}" target="_blank" style="display:inline-block; padding: 12px 24px; background-color: #f39c12; color: #111; border-radius: 8px; text-decoration: none; font-weight: bold;">
            ${language === "tr" ? "Şifremi Sıfırla" : "Reset My Password"}
          </a>
          <p style="margin-top: 20px; color: #aaa;">
            ${language === "tr"
              ? "Bu bağlantı 15 dakika içinde geçerliliğini yitirir. Bu isteği sen yapmadıysan, bu e-postayı dikkate alma."
              : "This link will expire in 15 minutes. If you didn’t request this, you can ignore this email."}
          </p>
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
