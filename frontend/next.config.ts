import type { NextConfig } from "next";

/** Django origin for same-origin `/api` rewrites (browser → Next → web). */
const apiProxyTarget = (process.env.API_PROXY_TARGET || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
