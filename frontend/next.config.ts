import type { NextConfig } from "next";

/** Django origin for same-origin `/api` rewrites (browser → Next → web). */
const apiProxyTarget = (process.env.API_PROXY_TARGET || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

const nextConfig: NextConfig = {
  devIndicators: false,
  // Django/DRF routes require trailing slashes; do not 308-strip before rewrite.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      // Prefer exact trailing-slash match, then force slash on destination.
      {
        source: "/api/:path*/",
        destination: `${apiProxyTarget}/api/:path*/`,
      },
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*/`,
      },
    ];
  },
};

export default nextConfig;
