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
  output: "standalone",
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
    }, {
      source: "/open-ena-2d-lapack/worker.js",
      headers: [
        // Scope WebAssembly permission to the isolated 2D display worker.
        { key: "Content-Security-Policy", value: "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'" },
      ],
    }, {
      source: "/:locale/plugins/:privatePath(propose|status|operator)/:rest*",
      headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      ],
    }];
  },
  async redirects() {
    return [
      // Preserve the old public URLs when the OPEN-ENA domains move to this app.
      {
        source: "/:path*",
        has: [{ type: "host", value: "open-ena.com" }],
        destination: "https://www.open-ena.com/:path*",
        permanent: true,
      },
      { source: "/team/:path*", destination: "/open-ena-about/team/:path*", permanent: true },
      { source: "/publications/:path*", destination: "/open-ena-about/publications/:path*", permanent: true },
      { source: "/logo-open-ena.svg", destination: "/unified-home/logo-open-ena.svg", permanent: true },
      { source: "/logo-open-ena-compact.svg", destination: "/unified-home/logo-open-ena-compact.svg", permanent: true },
      { source: "/logo-open-ena-mark.svg", destination: "/unified-home/logo-open-ena-mark.svg", permanent: true },
      { source: "/favicon.svg", destination: "/icon.svg", permanent: true },
      { source: "/mission", destination: "/en/mission", permanent: false },
      { source: "/open-ena", destination: "/en/open-ena", permanent: false },
      { source: "/plugins", destination: "/en/plugins", permanent: false },
      { source: "/plugins/:slug*", destination: "/en/plugins/:slug*", permanent: false },
      // Alias legacy Plugin Lab path to the public catalog (#36).
      { source: "/plugin-lab", destination: "/en/plugins", permanent: false },
      { source: "/plugin-lab/:slug*", destination: "/en/plugins/:slug*", permanent: false },
      // Restrict legacy aliases to real locales: :locale must never match `api`.
      { source: "/:locale(en|zh-hant|zh-hans|es|fr|pt|de|ar|ko|ja|hi|ru|id|bn)/plugin-lab", destination: "/:locale/plugins", permanent: false },
      { source: "/:locale(en|zh-hant|zh-hans|es|fr|pt|de|ar|ko|ja|hi|ru|id|bn)/plugin-lab/:slug*", destination: "/:locale/plugins/:slug*", permanent: false },
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
