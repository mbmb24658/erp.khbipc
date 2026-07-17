import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't use standalone for Vercel (Vercel handles deployment natively)
  // output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Make sure xlsx and other server-side packages work
  serverExternalPackages: ["xlsx"],
};

export default nextConfig;
