/** @type {import('next').NextConfig} */
if (process.env.APP_ENV === "production") {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_") ||
      !process.env.CLERK_SECRET_KEY?.startsWith("sk_live_")) {
    throw new Error("Production requires matching external Clerk live keys.");
  }
  if (!process.env.STORY_API_URL?.startsWith("https://") || !process.env.APP_ORIGINS) {
    throw new Error("Production requires an HTTPS STORY_API_URL and explicit APP_ORIGINS.");
  }
}
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
