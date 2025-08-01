import { csrf } from '@/lib/csrf'; // Eğer kurulu değilse, kendi CSRF middleware'ini yazabilirim!
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/ratelimit';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nameRegex = /^[a-zA-Z0-9_ ]{3,40}$/;
const phoneRegex = /^\+?\d{10,15}$/; // basit, isteğe göre özelleştir

const messages = {
  en: {
    ratelimit: "Too many requests. Please wait and try again.",
    csrf: "Invalid CSRF token.",
    required: "Please fill in all fields.",
    email: "Invalid email address.",
    username: "Name must be 3-40 chars, only letters, numbers, spaces, and _.",
    password: "Password must be at least 8 chars and contain both letters and numbers.",
    phone: "Invalid phone number.",
    uniq: "A merchant account with this email already exists.",
    terms: "You must accept the Terms and Privacy Policy.",
    success: "Merchant registration successful. Your account is pending approval.",
    fail: "Registration failed. Please try again."
  },
  tr: {
    ratelimit: "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.",
    csrf: "CSRF anahtarı geçersiz.",
    required: "Lütfen tüm alanları doldurun.",
    email: "Geçersiz e-posta adresi.",
    username: "İsim 3-40 karakter, harf/rakam/boşluk/_ içerebilir.",
    password: "Şifre en az 8 karakter ve hem harf hem rakam içermeli.",
    phone: "Geçersiz telefon numarası.",
    uniq: "Bu e-posta ile daha önce satıcı kaydı yapılmış.",
    terms: "Kullanım ve gizlilik şartlarını kabul etmelisiniz.",
    success: "Satıcı kaydınız başarılı. Hesabınız onay bekliyor.",
    fail: "Kayıt başarısız. Lütfen tekrar deneyin."
  }
};

export const POST = csrf(async (req) => {
  try {
    // Dil (locale) tespiti
    const lang = req.headers.get("accept-language")?.split(',')[0] || "en";
    const locale = (lang && lang.startsWith("tr")) ? "tr" : "en";
    const msg = messages[locale];

    // Rate Limit (IP'ye göre)
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(`merchant_register_${ip}`, 5, 60 * 1000)) {
      return Response.json({ success: false, message: msg.ratelimit }, { status: 429 });
    }

    // Inputları al ve kontrol et
    const { name, email, password, phone_number, role, termsAccepted } = await req.json();

    // --- TERMS KONTROLÜ EKLENDİ ---
    if (!termsAccepted) {
      return Response.json({ success: false, message: msg.terms }, { status: 400 });
    }
    // Zorunlu alanlar + merchant rolü
    if (!name || !email || !password || !phone_number || role !== "merchant") {
      return Response.json({ success: false, message: msg.required }, { status: 400 });
    }
    if (!emailRegex.test(email.trim().toLowerCase()))
      return Response.json({ success: false, message: msg.email }, { status: 400 });
    if (!nameRegex.test(name.trim()))
      return Response.json({ success: false, message: msg.username }, { status: 400 });
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password))
      return Response.json({ success: false, message: msg.password }, { status: 400 });
    if (!phoneRegex.test(phone_number.trim()))
      return Response.json({ success: false, message: msg.phone }, { status: 400 });

    // Tekrar kayıt kontrolü
    const existing = await prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), role: "merchant" }
    });
    if (existing)
      return Response.json({ success: false, message: msg.uniq }, { status: 409 });

    // Şifre hashle
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password_hash: hashedPassword,
        phone_number: phone_number.trim(),
        role: "merchant",
        status: "pending",
        termsAccepted: !!termsAccepted
      }
    });

    // Log (isteğe bağlı)
    console.info(`[MERCHANT_REGISTER][${ip}] ${email.trim().toLowerCase()} (${name.trim()})`);

    return Response.json({
      success: true,
      message: msg.success
    }, { status: 200 });

  } catch (error) {
    console.error("Merchant Register Error:", error);
    const msg = messages.tr.fail;
    return Response.json({ success: false, message: msg }, { status: 500 });
  }
});
