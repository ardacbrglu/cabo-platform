import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  secure: false, // Mailtrap ve çoğu smtp için sorun olmaz
});

export async function sendActivationEmail(to, token) {
  const url = `${process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL}/activate?token=${token}`;
  await transporter.sendMail({
    from: process.env.FROM_EMAIL || 'Cabo <no-reply@localhost>',
    to,
    subject: 'Activate your Cabo account!',
    html: `<h2>Welcome to Cabo!</h2>
      <p>To activate your account, click the link below:</p>
      <a href="${url}" target="_blank">${url}</a>
      <p>If you didn't request this, just ignore this email.</p>
      <p>Best regards,<br/>Cabo Team</p>`,
  });
}

export async function sendPasswordResetEmail(to, token) {
  const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL}/password_reset?token=${token}`;
  await transporter.sendMail({
    from: process.env.FROM_EMAIL || 'Cabo <no-reply@localhost>',
    to,
    subject: "Cabo - Password Reset",
    html: `
      <div style="font-family: Arial, sans-serif">
        <h2>Password Reset</h2>
        <p>To reset your password, click the link below:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link will expire in 15 minutes.</p>
      </div>
    `
  });
}
