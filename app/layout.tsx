import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { siteConfig } from "@/lib/site";
import AnalyticsConsent from "@/components/AnalyticsConsent";
import { PluginProposalSessionProvider } from "@/components/plugin-lab/PluginProposalSession";
import "./globals.css";
import "./premium-public.css";
import "./plugin-lab.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.brandName} | ${siteConfig.longName}`,
    template: `%s | ${siteConfig.brandName}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.brandName,
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: siteConfig.brandName,
    title: `${siteConfig.brandName} | ${siteConfig.longName}`,
    description: siteConfig.description,
    url: siteConfig.url,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${siteConfig.brandName}, ${siteConfig.tagline}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.brandName} | ${siteConfig.longName}`,
    description: siteConfig.description,
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const analyticsDisabledForSmoke = process.env.OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS === "1";
  return (
    <html lang="en-HK" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${geist.variable} ${geistMono.variable}`}>
        <PluginProposalSessionProvider>{children}</PluginProposalSessionProvider>
        <AnalyticsConsent disabled={analyticsDisabledForSmoke} />
      </body>
    </html>
  );
}
