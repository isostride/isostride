/**
 * The page background of each theme for the browser's own chrome (the address bar of a phone),
 * which cannot read a stylesheet token: these mirror --bg of app/globals.css, and a test keeps them
 * equal (tests/unit/styles.test.ts).
 */
export const THEME_COLOR = { light: '#f4f5f7', dark: '#1d1f23' } as const;
