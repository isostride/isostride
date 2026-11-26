/** Where the app is: app.isostride.com, or another for a preview (NEXT_PUBLIC_APP_URL at build time). */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.isostride.com';

/** The app opened on the demo: a sample runner's two years, generated in the visitor's browser (the app reads ?demo). */
export const DEMO_URL = `${APP_URL}/?demo`;

/** The app's host as shown in the text, e.g. app.isostride.com. */
export const APP_HOST = new URL(APP_URL).host;

/** The source of the app and the site, under the MIT License. */
export const REPO_URL = 'https://github.com/isostride/isostride';
