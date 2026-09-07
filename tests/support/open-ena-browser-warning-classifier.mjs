/**
 * Classify only Chromium's exact Canvas2D readback advisory from an
 * application-owned Next.js JavaScript chunk.
 *
 * The caller supplies the page origin separately so a warning location can
 * never turn an arbitrary external URL into an accepted platform diagnostic.
 * The function is intentionally side-effect free because browser smoke code
 * may also serialize it into a Playwright page context.
 */
export function classifyChromiumCanvasReadbackDiagnostic(input) {
  const chromiumBrowsers = new Set(["chromium", "chrome", "msedge"]);
  const canvasReadbackWarning = "Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute set to true. See: https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-will-read-frequently";

  // Next emits both the current Turbopack `abc-hhhhhhhhh.js` form and the
  // older multi-segment chunk form.  Keep the accepted grammar deliberately
  // narrow: only same-origin JavaScript chunks under `/_next/static/` qualify.
  const nextStaticChunkPath = /^\/_next\/static\/(?:chunks\/(?:[a-z0-9]{3}-[a-z0-9]{9}|[a-z0-9]{2,}-[a-z0-9]{3,}-[a-z0-9]{3,})|immutable\/chunks\/[a-z0-9]{8,})\.js$/u;

  if (!input || typeof input !== "object") return null;
  const { browser, currentOrigin, warning } = input;
  if (!chromiumBrowsers.has(browser)) return null;
  if (typeof currentOrigin !== "string" || !/^https?:\/\/[^/\s?#@]+$/u.test(currentOrigin)) return null;
  if (!warning || typeof warning !== "object" || warning.text !== canvasReadbackWarning) return null;

  const sourceUrl = typeof warning.location?.url === "string" ? warning.location.url : "";
  if (!sourceUrl.startsWith(currentOrigin + "/")) return null;
  const sourcePath = sourceUrl.slice(currentOrigin.length).split(/[?#]/u)[0];
  // Current Turbopack hash names are admitted only with this run's actual
  // successful owned-build response receipt. The caller must still verify the
  // exact source line and compare fetched bytes with this recorded digest.
  const owned = input.ownedServedChunk;
  const currentOwnedChunk = /^\/_next\/static\/chunks\/[a-z0-9_]{13}\.js$/u.test(sourcePath)
    && owned && typeof owned === "object" && owned.path === sourcePath
    && owned.status === 200 && owned.error === undefined
    && typeof owned.sha256 === "string" && /^[a-f0-9]{64}$/u.test(owned.sha256);
  if (!nextStaticChunkPath.test(sourcePath) && !currentOwnedChunk) return null;

  const lineNumber = warning.location?.lineNumber;
  const columnNumber = warning.location?.columnNumber;
  if (!Number.isInteger(lineNumber) || lineNumber < 0) return null;
  if (!Number.isInteger(columnNumber) || columnNumber < 0) return null;

  return {
    normalizedPattern: "Canvas2D exact willReadFrequently advisory",
    sourcePath,
    reportedLineNumber: lineNumber,
    reportedColumnNumber: columnNumber,
    ...(currentOwnedChunk ? { ownedSourceSha256: owned.sha256 } : {}),
  };
}
