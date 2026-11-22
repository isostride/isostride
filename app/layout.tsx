import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Shell } from '@/components';
import { FolderProvider } from '@/lib/client';
import { THEME_COLOR } from './theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'StridePrism',
  description: 'Compare the same segments of your runs within the same context.',
};

// A phone lays the page out at its own width, under its notch and home indicator (the stylesheet
// keeps the bars clear of them), with its address bar in the page's colour.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
  ],
};

// Applies the saved theme before the first paint, so a dark choice does not flash light.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/geist-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <FolderProvider>
          <Shell>{children}</Shell>
        </FolderProvider>
      </body>
    </html>
  );
}
