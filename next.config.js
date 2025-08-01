/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // whitelist your dev origin so Turbopack stops warning
  allowedDevOrigins: ['http://192.168.1.106:3000'],

  // apply security headers to every route (pages + API)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          { key: 'X-Frame-Options',        value: 'DENY'     },
          { key: 'X-Content-Type-Options', value: 'nosniff'  },
          { key: 'Referrer-Policy',        value: 'same-origin' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
