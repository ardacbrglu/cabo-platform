// /src/lib/fileValidator.js
import { fromBuffer as fileTypeFromBuffer } from "file-type";
// import sharp from "sharp"; // görüntü boyutu/animasyon kontrolü istersen aç

/**
 * Güvenli dosya doğrulama
 * @param {Buffer} buffer - Yüklenen dosya içeriği
 * @param {Object} opts
 * @param {number} opts.maxSize - max byte
 * @param {string[]} opts.allowedMime - izinli MIME listesi
 * @param {string[]} [opts.allowedExt] - izinli uzantılar (opsiyonel)
 */
export async function validateFileBuffer(
  buffer,
  {
    maxSize = 2 * 1024 * 1024, // 2MB
    allowedMime = ["image/jpeg", "image/png", "image/webp"],
    allowedExt = ["jpg", "jpeg", "png", "webp"],
  } = {}
) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { ok: false, reason: "Invalid buffer" };
  }
  if (buffer.length > maxSize) {
    return { ok: false, reason: "File too large" };
  }

  const ft = await fileTypeFromBuffer(buffer);
  if (!ft || !allowedMime.includes(ft.mime)) {
    return { ok: false, reason: "Unsupported file type" };
  }
  if (allowedExt && !allowedExt.includes(ft.ext)) {
    return { ok: false, reason: "Unsupported file extension" };
  }

  // OPSİYONEL: Görsel ölçü/çerçeve/animasyon kontrolü
  // try {
  //   const img = sharp(buffer);
  //   const meta = await img.metadata();
  //   if (meta.width > 4000 || meta.height > 4000) {
  //     return { ok: false, reason: "Image dimensions too large" };
  //   }
  //   // GIF/WebP animasyon kontrolü gerekiyorsa meta.pages veya meta.pageHeight kullanılabilir.
  // } catch {
  //   // Görsel değilse (ama allowedMime görsel ise) reddet
  //   return { ok: false, reason: "Invalid image data" };
  // }

  return {
    ok: true,
    mime: ft.mime,
    ext: ft.ext,
  };
}
