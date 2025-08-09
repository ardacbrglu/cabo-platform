/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async headers() {
    const csp = [
      "default-src 'self'",
      // NextJS dev için 'unsafe-eval' gerekir; prod’da kaldıysa kaldırmayı düşün.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' www.google.com www.gstatic.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      // reCAPTCHA iframe ve OAuth yönlendirmeleri
      "frame-src 'self' www.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // upgrade-insecure-requests // prod’da sadece https ise açabilirsin
    ].join("; ");

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
          // COOP (izolasyon, OAuth’a engel olmaz)
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // COEP/CORP aşırı kısıtlayıcı olduğundan kaldırıldı (Google OAuth, reCAPTCHA vb. kırılabiliyor)
          // { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          // { key: "Cross-Origin-Resource-Policy", value: "same-origin" },

          // Permissions-Policy (yeni sözdizimi)
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },

          // CSP – projen büyüdükçe domain’leri burada açarsın
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
