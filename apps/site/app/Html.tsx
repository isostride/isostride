import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CONTENT, HREF, SHOTS, type Lang } from './content';

/**
 * The language of a visit (requirement "Site in English and Polish"): / is English, /pl Polish. The
 * first visit to / from a browser whose first language the site has is Polish goes to /pl; a choice made
 * with the switch in the header (?lang=…) is kept in this browser and wins over the browser's language.
 */
const languageScript = `(function(){try{var K='isostride.language',p=location.pathname.replace(/\\/$/,'')||'/',q=new URLSearchParams(location.search).get('lang'),s=null;try{s=localStorage.getItem(K)}catch(e){}
var keep=function(l){try{localStorage.setItem(K,l)}catch(e){}history.replaceState(null,'',(l==='pl'?'/pl':'/')+location.hash)};
if(p==='/pl'){if(q==='pl')keep('pl');return}
if(p!=='/')return;
if(q==='en'){keep('en');return}
var go=function(){location.replace('/pl'+location.hash)};
if(s==='pl')return go();if(s==='en')return;
var b=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language];
for(var i=0;i<b.length;i++){var c=String(b[i]).toLowerCase().split('-')[0];if(c==='en')return;if(c==='pl')return go()}}catch(e){}})()`;

/** The page's title, description and links to its other language. */
export function metadataOf(lang: Lang): Metadata {
  const c = CONTENT[lang];
  return {
    metadataBase: new URL('https://isostride.com'),
    title: c.title,
    description: c.description,
    alternates: { canonical: HREF[lang], languages: { en: HREF.en, pl: HREF.pl, 'x-default': HREF.en } },
    // What a link to the site shows when shared: the title, the description and the Dashboard on demo data.
    openGraph: { type: 'website', url: HREF[lang], siteName: 'IsoStride', locale: lang === 'pl' ? 'pl_PL' : 'en_US', title: c.title, description: c.description, images: [{ url: `${SHOTS[lang]}/dashboard.webp`, width: 2880, height: 1800, alt: c.ogAlt }] },
    twitter: { card: 'summary_large_image', title: c.title, description: c.description, images: [`${SHOTS[lang]}/dashboard.webp`] },
  };
}

/** The document of a page in its language. */
export function Html({ lang, children }: { lang: Lang; children: ReactNode }) {
  return (
    <html lang={lang}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: languageScript }} />
        <link rel="preload" href="/fonts/geist-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {lang === 'pl' && <link rel="preload" href="/fonts/geist-latin-ext.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />}
      </head>
      <body>{children}</body>
    </html>
  );
}
