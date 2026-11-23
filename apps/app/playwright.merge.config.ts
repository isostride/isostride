/**
 * The configuration the verdict merges the end-to-end shards' blob reports with: the shards ran on
 * GitHub's runner and in Playwright's image (WebKit), whose paths differ, so the merge is told where
 * the tests are.
 */
export default { testDir: 'e2e' };
