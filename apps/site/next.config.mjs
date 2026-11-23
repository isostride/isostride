/** @type {import('next').NextConfig} */
// The site of IsoStride (isostride.com): a static export, served from S3 through CloudFront.
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
export default nextConfig;
