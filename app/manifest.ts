import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ENA.HK | Epistemic Network Analysis Hub of Knowledge",
    short_name: "ENA.HK",
    description: "A multilingual hub of knowledge for Epistemic Network Analysis.",
    start_url: "/en",
    display: "standalone",
    background_color: "#f1f9fd",
    theme_color: "#89cff0",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
