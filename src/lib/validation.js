// src/lib/validation.js

import validator from 'validator';
import sanitizeHtmlLib from 'sanitize-html';

// Kullanım: temizlenmiş ve XSS’ten arındırılmış string döner
export function sanitizeHtml(input) {
  return sanitizeHtmlLib(input, {
    allowedTags: [],           // tüm HTML etiketlerini kaldır
    allowedAttributes: {},     // tüm attribute’ları kaldır
  });
}

export function isUsername(name) {
  return /^[a-zA-Z0-9_]{3,32}$/.test(name || "");
}

export function isEmail(email) {
  return validator.isEmail(email || '');
}

export function isStrongPassword(password) {
  return validator.isStrongPassword(password || '', {
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1
  });
}

export function isIbanTR(iban) {
  return /^TR\d{24}$/.test(iban || '');
}
