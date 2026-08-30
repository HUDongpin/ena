import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(isDevelopment ? ["'unsafe-eval'", "https://va.vercel-scripts.com"] : []),
];
const connectSources = [
  "'self'",
  ...(isDevelopment ? ["ws:", "wss:", "https://va.vercel-scripts.com"] : []),
];
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  `script-src ${scriptSources.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false,
  transpilePackages: ["jena-js"],
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
        },
      ],
    }];
  },
  async redirects() {
    return [
      { source: "/mission", destination: "/en/mission", permanent: false },
      { source: "/open-ena", destination: "/en/open-ena", permanent: false },
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
