// src/lib/notify.js
import prisma from "@/lib/prisma";

/**
 * Kullanıcıdan dil çıkarımı (gerekirse Accept-Language'tan da türetebilirsin)
 */
export function resolveLocaleFromUser(user, req) {
  const raw =
    user?.languagePreference ||
    user?.language ||
    user?.locale ||
    user?.preferredLocale ||
    (req?.headers?.get?.("accept-language") || "");

  const s = String(raw || "").toLowerCase();
  if (s.startsWith("en")) return "en";
  if (s.startsWith("tr")) return "tr";
  return "tr";
}

/**
 * Tek-seferlik hoş geldin bildirimi.
 * Idempotency: DB’deki @@unique([userId, link]) + uygulama tarafı findFirst kontrolü.
 */
export async function sendWelcomeAffiliateNotification({ userId, name, locale }) {
  if (!userId) return;

  const LINK_KEY = "/wallet?src=welcome_affiliate";

  // Uygulama katmanı idempotency (silinmiş olsa bile aynı link'ten varsa tekrar üretme)
  const already = await prisma.notification.findFirst({
    where: { userId, link: LINK_KEY },
    select: { id: true },
  });
  if (already) return;

  const lang = String(locale || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
  const safeName = String(name || "").trim() || (lang === "en" ? "there" : "orada");

  const messages = {
    tr: `Hoş geldin, ${safeName}! Cüzdan sayfasında IBAN bilgilerini doldurmayı unutma.`,
    en: `Welcome, ${safeName}! Don't forget to fill in your IBAN details on the Wallet page.`,
  };

  // DB idempotency: @@unique([userId, link]) — ikinci çağrıyı engeller
  await prisma.notification.create({
    data: {
      userId,
      message: messages[lang],
      type: "info",
      link: LINK_KEY,
      read: false,
      isDeleted: false,
    },
  });
}
