import nodemailer from 'nodemailer';

export const sendActivationEmail = async (to, token) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    secure: false,
  });

  const url = `${process.env.NEXT_PUBLIC_BASE_URL}/activate?token=${token}`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Cabo <no-reply@localhost>',
    to,
    subject: 'Activate your Cabo account!',
    html: `<h2>Welcome to Cabo!</h2>
      <p>To activate your account, click the link below:</p>
      <a href="${url}" target="_blank">${url}</a>
      <p>If you didn't request this, just ignore this email.</p>
      <p>Best regards,<br/>Cabo Team</p>`,
  });
};
