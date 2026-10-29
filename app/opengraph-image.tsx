import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

export const alt = `${siteConfig.brandName}, ${siteConfig.longName}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function OpenGraphImage() {
  const [regular, italic, sans, logo] = await Promise.all([
    // Instrument Serif is distributed with its SIL Open Font License.
    readFile(join(process.cwd(), "public/fonts/instrument-serif/InstrumentSerif-Regular.ttf")),
    readFile(join(process.cwd(), "public/fonts/instrument-serif/InstrumentSerif-Italic.ttf")),
    readFile(join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf")),
    // Exact rasterization of public/unified-home/logo-open-ena-compact.svg.
    // Embedding it avoids remote fetches and server-dependent SVG text rendering.
    readFile(join(process.cwd(), "public/social/open-ena-logo.png")),
  ]);

  return new ImageResponse(
    <div style={{
      width: "100%", height: "100%", display: "flex", position: "relative",
      overflow: "hidden", background: "#F7FBFE", color: "#0F172A", fontFamily: "Geist",
    }}>
      <div style={{
        display: "flex", position: "absolute", left: 650, top: -200,
        width: 960, height: 1030, borderRadius: "50%", background: "#E5F4FC",
      }} />
      <div style={{
        display: "flex", position: "absolute", left: 68, top: 93,
        fontSize: 15, letterSpacing: 3.1, color: "#526477",
      }}>
        EPISTEMIC NETWORK ANALYSIS
      </div>
      <div style={{
        display: "flex", position: "absolute", left: 63, top: 143,
        width: 600, flexDirection: "column", fontFamily: "Instrument Serif",
        fontSize: 108, fontWeight: 400, lineHeight: 0.97, letterSpacing: -1.6,
      }}>
        <div style={{ display: "flex" }}>See how</div>
        <div style={{ display: "flex", fontStyle: "italic" }}>ideas connect.</div>
      </div>
      <div style={{
        display: "flex", position: "absolute", left: 68, top: 387,
        flexDirection: "column", fontSize: 22, lineHeight: 1.5, color: "#526477",
      }}>
        <div style={{ display: "flex" }}>Explore patterns in coded data.</div>
        <div style={{ display: "flex" }}>Build, compare, and interpret networks.</div>
      </div>
      <div style={{ display: "flex", position: "absolute", left: 68, top: 515, width: 520, height: 1, background: "#D5EBF6" }} />
      <div style={{ display: "flex", position: "absolute", left: 68, top: 514, width: 56, height: 3, background: "#89CFF0" }} />
      <div style={{ display: "flex", position: "absolute", left: 68, top: 539, fontSize: 20, letterSpacing: 0.3, color: "#33465C" }}>
        {new URL(siteConfig.url).hostname}
      </div>
      <img
        src={`data:image/png;base64,${logo.toString("base64")}`}
        alt={siteConfig.brandName}
        width={440}
        height={440 * 80 / 165}
        style={{ position: "absolute", left: 718, top: 222 }}
      />
    </div>,
    {
      ...size,
      fonts: [
        { name: "Geist", data: sans, weight: 400, style: "normal" },
        { name: "Instrument Serif", data: regular, weight: 400, style: "normal" },
        { name: "Instrument Serif", data: italic, weight: 400, style: "italic" },
      ],
    },
  );
}
