import { ImageResponse } from "next/og";

export const alt = "ENA.HK, Epistemic Network Analysis Hub of Knowledge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const nodes = [
  { left: 76, top: 104 },
  { left: 310, top: 52 },
  { left: 510, top: 176 },
  { left: 354, top: 370 },
  { left: 90, top: 338 },
];

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "stretch",
        background: "#f7fbfe",
        color: "#1f293d",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          width: 690,
          padding: "74px 72px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 18,
              border: "2px solid #d5ebf6",
              background: "#edf8fd",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#1f293d",
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            ENA
          </div>
          <div style={{ width: 430, fontSize: 20, lineHeight: 1.2, fontWeight: 700, color: "#6f7c91" }}>
            Epistemic Network Analysis Hub of Knowledge
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 72, lineHeight: 0.98, fontWeight: 800, letterSpacing: -4 }}>
            See how ideas connect.
          </div>
          <div style={{ fontSize: 27, lineHeight: 1.35, color: "#3e4b63", maxWidth: 555 }}>
            A multilingual knowledge site for learning, applying, and discussing ENA.
          </div>
        </div>
        <div style={{ fontSize: 22, color: "#3e4b63", fontWeight: 700 }}>www.ena.hk</div>
      </div>
      <div
        style={{
          width: 510,
          position: "relative",
          background: "#1f293d",
          borderLeft: "8px solid #89cff0",
          display: "flex",
        }}
      >
        <div
          style={{ position: "absolute", left: 48, top: 90, width: 380, height: 6, background: "#89cff0", transform: "rotate(-12deg)", opacity: 0.65 }}
        />
        <div
          style={{ position: "absolute", left: 126, top: 285, width: 350, height: 12, background: "#89cff0", transform: "rotate(20deg)", opacity: 0.9 }}
        />
        <div
          style={{ position: "absolute", left: 178, top: 158, width: 298, height: 5, background: "#73c2e8", transform: "rotate(68deg)", opacity: 0.55 }}
        />
        {nodes.map((node, index) => (
          <div
            key={`${node.left}-${node.top}`}
            style={{
              position: "absolute",
              left: node.left - 40,
              top: node.top - 40,
              width: index === 2 ? 86 : 66,
              height: index === 2 ? 86 : 66,
              borderRadius: 999,
              border: "6px solid #89cff0",
              background: index === 2 ? "#89cff0" : "#1f293d",
              display: "flex",
            }}
          />
        ))}
      </div>
    </div>,
    size
  );
}
