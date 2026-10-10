import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Server-only native/driver packages are loaded from node_modules at runtime, not bundled.
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
  // Migrations are read from disk at runtime; make sure they ship with the server bundle.
  outputFileTracingIncludes: { '/**': ['./migrations/*.sql'] },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The recorder needs the microphone on our own origin only.
          { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
