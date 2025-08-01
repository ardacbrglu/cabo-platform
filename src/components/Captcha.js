'use client';
import React from 'react';
import ReCAPTCHA from "react-google-recaptcha";

// Çevre değişkenine anahtarını ekle: NEXT_PUBLIC_RECAPTCHA_SITE_KEY
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export default function Captcha({ onChange, lang = "en" }) {
  return (
    <div className="flex justify-center my-2">
      <ReCAPTCHA
        sitekey={RECAPTCHA_SITE_KEY}
        onChange={onChange}
        hl={lang}
        theme="dark"
        className="w-full"
      />
    </div>
  );
}
//kullanim: <Captcha onChange={handleCaptcha} lang={user?.language_preference || "en"} />
