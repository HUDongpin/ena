import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ENA.HK | Epistemic Network Analysis Hub of Knowledge",
    short_name: "ENA.HK",
    description: "A multilingual hub of knowledge for Epistemic Network Analysis.",
    start_url: "/en",
    display: "standalone",
    background_color: "#edf8f7",
    theme_color: "#72c7bd",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
