import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Shell } from '@/components';
import { FolderProvider } from '@/lib/client';
import './globals.css';

export const metadata: Metadata = {
  title: 'Strideprism',
  description: 'Compare blocks of runs within the same context.',
};

// Applies the saved theme before the first paint, so a dark choice does not flash light.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
