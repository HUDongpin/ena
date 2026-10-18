// esbuild fixtures run outside Next's font transform. Production fonts are
// checked separately against the built application; keep fixture focus tests local.
export function Geist() {
  return { className: "", variable: "", style: { fontFamily: "sans-serif" } };
}
