import { buildInfo } from '../app/build-info.mjs';

/** @type {import('next').NextConfig} */
// The site of IsoStride (isostride.com): a static export, served from S3 through CloudFront.
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  // The version of the app deployed with it, for the footer.
  env: buildInfo(),
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
export default nextConfig;
