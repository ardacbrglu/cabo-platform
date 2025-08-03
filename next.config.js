/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Güvenlik başlıkların (aynen bırak)
        ],
      },
    ]
  },
};

module.exports = nextConfig;
