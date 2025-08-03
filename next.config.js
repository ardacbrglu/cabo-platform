/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Security headers for all routes
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // HSTS: HTTPS zorunlu (1 yıl), preload ve subdomain desteği
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          // Clickjacking koruması
          { key: 'X-Frame-Options', value: 'DENY' },
          // XSS/MIME sniffing koruması
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Tarayıcı XSS koruması (modern tarayıcılar için artık devre dışı, ama legacy için eklenir)
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Referrer sadece aynı origin
          { key: 'Referrer-Policy', value: 'same-origin' },
          // Özellik (kamera, mikrofon vb) kısıtlaması
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
          // Cross-origin tab/resource policy’leri
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          // Content-Security-Policy: En güçlü ama en zahmetli, projen özelinde ayarla!
          // { key: 'Content-Security-Policy', value: "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self';" },
        ],
      },
    ]
  },
};

module.exports = nextConfig;
