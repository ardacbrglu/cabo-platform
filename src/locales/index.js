// Tek merkez: yeni düzende en.json / tr.json kullanıyoruz.
// Bu dosya hem messages'ı hem DEFAULT_LOCALE'i dışa aktarır.

import en from "./en.json";
import tr from "./tr.json";

export const DEFAULT_LOCALE = "en";
export const SUPPORTED_LOCALES = ["en", "tr"];

// DİKKAT: Eski `locales/en/common.json` yapısını artık burada MERGE etmiyoruz.
// Eğer projede hala o dosyalar duruyorsa, içeriğini en.json/tr.json içine taşı.
export const messages = { en, tr };

export default messages;
