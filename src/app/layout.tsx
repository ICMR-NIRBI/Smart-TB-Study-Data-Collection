import type { Metadata, Viewport } from 'next';
import { Inter, Source_Serif_4 } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const serif = Source_Serif_4({ variable: '--font-serif', subsets: ['latin'], weight: ['400', '500'] });

const SITE_URL = process.env.APP_BASE_URL || 'https://smarttb-edc.in';
const SHARE_TITLE = 'SMART-TB · Clinical Data Platform';
const SHARE_TEXT = 'Secure data entry for the SMART-TB tuberculosis pharmacokinetic study. Amity Centre for Artificial Intelligence and ICMR–NIRBI. Authorised study staff only.';

export const metadata: Metadata = {
  // Absolute links for the share preview (WhatsApp, Teams, email) and the home-screen icon.
  metadataBase: new URL(SITE_URL),
  title: 'SMART-TB CRF',
  description: 'Case report form data entry for the SMART-TB pharmacokinetic study',
  applicationName: 'SMART-TB',
  authors: [{ name: 'Kalpojyoti Koch' }],
  creator: 'Kalpojyoti Koch',
  // A clinical data system: never in search engines. Link previews do not depend on this.
  robots: { index: false, follow: false },
  // How a shared link looks; the image is src/app/opengraph-image.png (and twitter-image.png).
  openGraph: { type: 'website', siteName: 'SMART-TB', title: SHARE_TITLE, description: SHARE_TEXT, url: '/', locale: 'en_IN' },
  twitter: { card: 'summary_large_image', title: SHARE_TITLE, description: SHARE_TEXT },
  // Added to an iPhone home screen: its name and a full-screen launch (the manifest does the same on Android).
  appleWebApp: { capable: true, title: 'SMART-TB', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  // Google Search Console ownership check (alerts if Google ever flags the site as unsafe; it does not list the site).
  verification: { google: 'o-oAwVtGZ9PC2UBFodxNpFXaCBQsVg7VgaMOfdoshzY' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#022f38',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${serif.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
