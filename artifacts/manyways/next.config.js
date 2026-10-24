/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    process.env.REPLIT_DEV_DOMAIN,
    "*.replit.dev",
    "*.replit.app",
    "127.0.0.1",
  ].filter(Boolean),
  poweredByHeader: false,
  devIndicators: false,
};

export default nextConfig;
