import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const TITLE = 'IsoStride · an open platform for analysing your runs';
const DESCRIPTION = 'IsoStride is an open platform for analysing your runs: the metrics in the FIT files of your watch and performance models, open source so you can add your own. It runs in your browser: no account, no cloud, your data stays on your computer.';

export const metadata: Metadata = {
  metadataBase: new URL('https://isostride.com'),
  title: TITLE,
  description: DESCRIPTION,
  // What a link to the site shows when shared: the title, the description and the Dashboard on demo data.
  openGraph: { type: 'website', url: '/', siteName: 'IsoStride', title: TITLE, description: DESCRIPTION, images: [{ url: '/shots/dashboard.webp', width: 2880, height: 1800, alt: 'The Dashboard of IsoStride, on demo data' }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/shots/dashboard.webp'] },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#1d1f23' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/geist-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
