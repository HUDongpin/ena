import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/mission", destination: "/en/mission", permanent: false },
      { source: "/news", destination: "/en/news", permanent: false },
      { source: "/academy", destination: "/en/academy", permanent: false },
      { source: "/academy/:slug*", destination: "/en/academy/:slug*", permanent: false },
      { source: "/about", destination: "/en/about", permanent: false },
      { source: "/research", destination: "/en/news", permanent: false },
      { source: "/research-news", destination: "/en/news", permanent: false },
    ];
  },
};

export default nextConfig;
