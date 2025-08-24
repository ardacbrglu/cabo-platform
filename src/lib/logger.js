/**
 * File: src/lib/logger.js
 * Purpose: Yapılandırılmış audit log (JSON line).
 * Security Notes:
 * - Kişisel veri sızdırma yok; korelasyon için requestId kullan.
 * - Hatalarda stack dışarı verilmez; yalnızca code/message.
 */

export function audit(event) {
  try {
    const e = event || {};
    const { requestId, ...rest } = e;

    // undefined alanları dışarı atmak için sadeleştir
    const compact = Object.entries(rest).reduce((acc, [k, v]) => {
      if (v !== undefined) acc[k] = v;
      return acc;
    }, {});

    const entry = {
      ts: new Date().toISOString(),
      requestId: requestId ?? null,
      ...compact,
    };

    // Üretimde gerçek bir log altyapısına (ELK/Cloud) gömebilirsin.
    console.log(JSON.stringify(entry));
  } catch {
    // yut
  }
}
