import prisma from "@/lib/prisma";

export async function sendWelcomeAffiliateNotification({ userId, name, locale }) {
  if (!userId) return;

  const LINK_KEY = "/wallet?src=welcome_affiliate";
  const lang = String(locale || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
  const safeName =
    String(name || "").trim() || (lang === "en" ? "there" : "orada");

  const messages = {
    tr: `Hoş geldin, ${safeName}! Cüzdan sayfasında IBAN bilgilerini doldurmayı unutma.`,
    en: `Welcome, ${safeName}! Don't forget to fill in your IBAN details on the Wallet page.`,
  };

  // 🔒 DB idempotency: composite unique ([userId, link]) + atomic upsert
  await prisma.notification.upsert({
    where: { userId_link: { userId, link: LINK_KEY } }, // Prisma, @@unique alan adıyla böyle bir "where" oluşturur
    create: {
      userId,
      type: "info",
      message: messages[lang],
      link: LINK_KEY,
      read: false,
      isDeleted: false,
    },
    update: {}, // varsa dokunma
  });
}
