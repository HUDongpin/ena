import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.brandName} | ${siteConfig.longName}`,
    short_name: siteConfig.brandName,
    description: siteConfig.description,
    start_url: "/en",
    display: "standalone",
    background_color: "#f1f9fd",
    theme_color: "#89cff0",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
