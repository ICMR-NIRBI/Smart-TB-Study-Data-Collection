import type { Metadata, Viewport } from 'next';
import { Inter, Source_Serif_4 } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const serif = Source_Serif_4({ variable: '--font-serif', subsets: ['latin'], weight: ['400', '500'] });

export const metadata: Metadata = {
  title: 'SMART-TB CRF',
  description: 'Case report form data entry for the SMART-TB pharmacokinetic study',
  authors: [{ name: 'Kalpojyoti Koch' }],
  creator: 'Kalpojyoti Koch',
  robots: { index: false, follow: false },
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
