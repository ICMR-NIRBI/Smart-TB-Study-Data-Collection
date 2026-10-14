import type { NextConfig } from 'next';

/** Sent with every response. HSTS is added by the HTTPS proxy (Caddy) once a domain is in place. */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera stays available to this site only, for sample photos if the study enables them.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Let phones/tablets on the local network load dev-mode assets (HMR etc.) when opening the app by IP.
  allowedDevOrigins: ['10.*.*.*', '192.168.*.*', '172.16.*.*', '*.local'],
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // Setup links carry a one-time token in the URL; never pass it on in a Referer header.
      { source: '/setup', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
    ];
  },
};

export default nextConfig;
