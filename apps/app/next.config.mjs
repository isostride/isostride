import { buildInfo } from './build-info.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  // The version, commit and date of the build, for the app and the files it writes.
  env: buildInfo(),
  // Production builds use their own folder so they never disturb a running dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The dev server opened from another device of the network (a phone): its address, e.g. NEXT_DEV_ORIGINS=192.168.1.55.
  allowedDevOrigins: (process.env.NEXT_DEV_ORIGINS ?? '').split(',').filter(Boolean),
};
export default nextConfig;
