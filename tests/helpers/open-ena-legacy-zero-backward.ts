import { analyzeDataset } from "../../lib/open-ena/analyze";
import { buildAnalysisBundle } from "../../lib/open-ena/export";
import type { OpenEnaConfig, ParsedDataset } from "../../lib/open-ena/types";

/** Synthetic multirow Horizons include both same-row and cross-row Code pairs. */
export function legacyZeroBackwardFixture(window: OpenEnaConfig["window"] = "MovingStanzaWindow") {
  const data: ParsedDataset = {
    name: "legacy-zero-synthetic.xlsx", source: "upload", sizeBytes: 1024,
    headers: ["unit", "horizon", "turn", "A", "B", "C"],
    rows: [
      { unit: "u1", horizon: "h1", turn: 1, A: 1, B: 0, C: 0 },
      { unit: "u2", horizon: "h1", turn: 2, A: 0, B: 1, C: 0 },
      { unit: "u1", horizon: "h1", turn: 3, A: 1, B: 0, C: 1 },
      { unit: "u2", horizon: "h1", turn: 4, A: 1, B: 1, C: 0 },
      { unit: "u3", horizon: "h2", turn: 1, A: 0, B: 1, C: 1 },
      { unit: "u4", horizon: "h2", turn: 2, A: 1, B: 0, C: 1 },
      { unit: "u3", horizon: "h2", turn: 3, A: 1, B: 1, C: 0 },
      { unit: "u4", horizon: "h2", turn: 4, A: 0, B: 0, C: 1 },
    ],
  };
  const config: OpenEnaConfig = {
    unitColumns: ["unit"], conversationColumns: ["horizon"], groupColumn: null,
    codes: ["A", "B", "C"], model: "EndPoint", window,
    windowSizeBack: 0, windowSizeForward: 0, weightBy: "binary",
    rotation: "svd", referenceRotationId: null, centerAlignToOrigin: true,
  };
  return { data, config };
}

export function legacyZeroBackwardBundle(window: OpenEnaConfig["window"], version: 1 | 2) {
  const { data, config } = legacyZeroBackwardFixture(window);
  const bundle = buildAnalysisBundle(data, config, analyzeDataset(data, config), "a".repeat(64));
  if (version === 2) return bundle;
  // v1 uses the same Standard scientific payload without the v2 identity and
  // inference envelopes. Do not alter any computed counts or fitted geometry.
  const { inference: _inference, ...historical } = bundle;
  const { analysis: _analysis, ...manifest } = historical.manifest;
  return { ...historical, schemaVersion: 1, manifest: { ...manifest, schemaVersion: 1 } };
}
