/** Version of the derived-data algorithms. Bump when anything that writes derived/ changes its output. */
export const ALGORITHM_VERSION = 7;
/** Version of the file layout and JSON shapes in .isostride/. */
export const SCHEMA_VERSION = 2;

/**
 * The app's version (the root package.json, the runner's "dodaj wersjonowanie do aplikacji, w tym
 * momencie to 0.1"; ADR "Version from package.json"), the commit and the date of its build, read into
 * the build by next.config.mjs; in tests the package's version, no commit.
 */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
export const APP_COMMIT: string | null = process.env.NEXT_PUBLIC_APP_COMMIT || null;
export const APP_BUILT: string | null = process.env.NEXT_PUBLIC_APP_BUILT || null;

/** A version as shown: a patch of 0 left out (0.1.0 → 0.1, 0.1.2 stays). */
export const versionLabel = (v: string): string => v.replace(/^(\d+\.\d+)\.0$/, '$1');

/** What a file written to .isostride/ records of the app that wrote it. */
export const writtenBy = (): { version: string; commit: string | null } => ({ version: APP_VERSION, commit: APP_COMMIT });
