/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  // Production builds use their own folder so they never disturb a running dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
export default nextConfig;
