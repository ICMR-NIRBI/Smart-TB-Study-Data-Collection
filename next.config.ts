import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Let phones/tablets on the local network load dev-mode assets (HMR etc.) when opening the app by IP.
  allowedDevOrigins: ['10.*.*.*', '192.168.*.*', '172.16.*.*', '*.local'],
};

export default nextConfig;
