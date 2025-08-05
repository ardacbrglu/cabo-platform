// src/lib/validation.js
// SECURITY REVIEW: This file provides input validation and sanitization helpers. See comments below for security notes.

import validator from 'validator';
import sanitizeHtmlLib from 'sanitize-html';

// Kullanım: temizlenmiş ve XSS’ten arındırılmış string döner
export function sanitizeHtml(input) {
  return sanitizeHtmlLib(input, {
    allowedTags: [],           // tüm HTML etiketlerini kaldır
    allowedAttributes: {},     // tüm attribute’ları kaldır
  });
  // NOTE: This removes all HTML tags/attributes. If you allow any HTML, review XSS risks carefully.
}

export function isUsername(name) {
  return /^[a-zA-Z0-9_]{3,32}$/.test(name || "");
  // WARNING: Only checks format, not uniqueness or reserved words. Consider further checks if usernames are used in queries or output.
}

export function isEmail(email) {
  return validator.isEmail(email || '');
  // NOTE: Relies on validator.js. Still consider sending confirmation emails to verify ownership.
}

export function isStrongPassword(password) {
  return validator.isStrongPassword(password || '', {
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1
  });
  // WARNING: Does not check for common/compromised passwords. Consider using a password blacklist or haveibeenpwned API for extra security.
}

export function isIbanTR(iban) {
  return /^TR\d{24}$/.test(iban || '');
  // NOTE: Only checks format, not validity or ownership. Consider further validation for financial operations.
}
