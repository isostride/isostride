import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { Html, metadataOf } from '../Html';
import '../globals.css';

export const metadata = metadataOf('pl');

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Light only, as the page: the browser's bar in its colour.
  colorScheme: 'light',
  themeColor: '#f4f5f7',
};

export default function Layout({ children }: { children: ReactNode }) {
  return <Html lang="pl">{children}</Html>;
}
