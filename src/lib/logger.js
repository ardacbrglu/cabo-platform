/**
 * File: src/lib/logger.js
 * Purpose: Yapılandırılmış audit log.
 * Security Notes:
 * - Kişisel veri sızdırma yok; korelasyon için requestId kullan.
 * - Hatalarda stack dışarı verilmez; yalnızca code/message.
 */

export function audit(event) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      ...event,
    };
    // Üretimde burada gerçek bir log altyapısına (ELK/Cloud) gönderilebilir.
    console.log(JSON.stringify(entry));
  } catch {
    // yut
  }
}
