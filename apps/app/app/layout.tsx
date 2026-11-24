import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Shell } from '@/components';
import { FolderProvider } from '@/lib/client';
import { msg } from '@/lib/i18n';
import { THEME_COLOR } from './theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'IsoStride',
  // The pages are built in English; the description stays so (a crawler reads it before any script).
  description: msg('Compare the same segments of your runs within the same context.'),
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
// The language (requirement "Language chosen"): the one chosen in this browser, else the first of the
// browser's languages the app has. The pages are built in English: in another language the page stays
// hidden until the app has put it in that language (at most 1.5 s, by the stylesheet), and the font's
// latin-ext part (ą, ę, ł…) loads at once.
const languageScript = `try{var d=document.documentElement,l=null;try{l=localStorage.getItem('isostride.language')}catch(e){}if(l!=='en'&&l!=='pl'){l='en';var b=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language];for(var i=0;i<b.length;i++){var c=String(b[i]).toLowerCase().split('-')[0];if(c==='en'||c==='pl'){l=c;break}}}d.lang=l;if(l!=='en'){d.setAttribute('data-lang-pending','');['geist-latin-ext','geist-mono-latin-ext'].forEach(function(f){var k=document.createElement('link');k.rel='preload';k.as='font';k.type='font/woff2';k.crossOrigin='anonymous';k.href='/fonts/'+f+'.woff2';document.head.appendChild(k)})}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/geist-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: languageScript }} />
      </head>
      <body>
        <FolderProvider>
          <Shell>{children}</Shell>
        </FolderProvider>
      </body>
    </html>
  );
}
