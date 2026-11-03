import type { MetadataRoute } from 'next';

/** "Add to Home Screen": installs as SMART-TB with the curve icon and opens full screen, like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'SMART-TB Clinical Data Platform',
    short_name: 'SMART-TB',
    description: 'Secure data entry for the SMART-TB tuberculosis pharmacokinetic study. Authorised study staff only.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0B3A40',
    theme_color: '#022f38',
    categories: ['medical', 'health'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
