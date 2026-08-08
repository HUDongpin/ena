import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ENA | Epistemic Network Analysis",
    short_name: "ENA",
    description: "A multilingual knowledge site for Epistemic Network Analysis.",
    start_url: "/en",
    display: "standalone",
    background_color: "#f4f8f7",
    theme_color: "#263431",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
