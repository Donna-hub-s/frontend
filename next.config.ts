import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,

  poweredByHeader: true,
  swcMinify: true,
  experimental: {
    scrollRestoration: true,
  },

};

export default nextConfig;
