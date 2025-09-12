/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

const googleHosts = [
  "www.google.com",
  "www.gstatic.com",
  "accounts.google.com",
  "www.recaptcha.net",        // reCAPTCHA bölgesel fallback
  "www.googleapis.com",       // bazı GSI/kimlik istekleri
];

function cspValue() {
  // NOT: Prod'da 'unsafe-eval' KALDIRILDI. Dev'da HMR/Hydration için gerekli.
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    ...googleHosts,
  ];

  // Dev HMR/WebSocket ve harici kimlik/recaptcha konuşmaları için connect-src
  const connectSrc = [
    "'self'",
    ...(isDev ? ["ws:", "wss:"] : []),
    ...googleHosts,
  ];

  // reCAPTCHA/GSI iframe’leri ve OAuth akışları
  const frameSrc = ["'self'", ...googleHosts];

  // Dış görseller (Google avatar vs.) için https: açıldı
  const imgSrc = ["'self'", "data:", "blob:", "https:"];

  const styleSrc = ["'self'", "'unsafe-inline'"]; // Tailwind/inline style’lar için

  const fontSrc = ["'self'", "data:"];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    `img-src ${imgSrc.join(" ")}`,
    `font-src ${fontSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src ${frameSrc.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Prod tamamen HTTPS ise açılabilir:
    // "upgrade-insecure-requests"
  ].join("; ");
}

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // HSTS
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          // Clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // MIME sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Legacy XSS (modernlerde etkisiz ama zararsız)
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // Referrer
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // OAuth popupları kırılmasın:
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          // COEP/CORP genelde OAuth/GSI/recaptcha’yı kırar, kapalı kalsın
          // { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          // { key: "Cross-Origin-Resource-Policy", value: "same-origin" },

          // Permissions-Policy
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },

          // CSP
          { key: "Content-Security-Policy", value: cspValue() },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
