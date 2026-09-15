import assert from "node:assert/strict";
import test from "node:test";
import { selectOpenEnaWorkspacePlotAxis } from "../lib/open-ena/plot3d";
import {
  OPEN_ENA_WORKBENCH_PRESENTATION_CONTROL_KEYS_V3,
  openEnaAiLocalScientificIdentityV3,
  openEnaAiReviewedRequestIdentityV3,
  openEnaConsumerAuthorityKeyV3,
  snapshotOpenEnaConsumerAuthorityControlsV3,
} from "../lib/open-ena/workspace-consumer-authority-v3";
import { workspaceV3Source } from "./helpers/open-ena-workspace-v3-ui";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const aiComponent = readFileSync(
  join(process.cwd(), "components/open-ena/OpenEnaAiInterpretation.tsx"),
  "utf8",
);

const primary = { type: "string" as const, value: "guided" };
const secondary = { type: "string" as const, value: "baseline" };
const binding = { scientificResultSha256: "a".repeat(64), datasetSha256: "b".repeat(64) };
const plan = "c".repeat(64);
const fittedAxes = ["SVD1", "SVD2"] as const;
const displayAxes = ["SVD1", "SVD2", "SVD3"] as const;
const inventory = ["SVD1", "SVD2", "SVD3", "SVD4"] as const;

function endpointControls(axes: readonly [string, string] = [...fittedAxes]) {
  return { primaryGroup: primary, secondaryGroup: secondary, axes };
}

function authority(overrides: {
  binding?: unknown;
  plan?: string | null;
  current?: boolean;
  controls?: unknown;
} = {}) {
  return openEnaConsumerAuthorityKeyV3({
    binding,
    plan,
    current: true,
    controls: endpointControls(),
    ...overrides,
  });
}

function reviewIdentity(overrides: {
  localScientificIdentity?: string | null;
  request?: Parameters<typeof openEnaAiReviewedRequestIdentityV3>[0]["request"];
} = {}) {
  const request = {
    schemaVersion: "open-ena-ai-interpretation-request-v2",
    promptVersion: "open-ena-aggregate-inference-review-v2",
    locale: "en",
    binding: {
      analyzedAt: "2026-09-15T00:00:00.000Z",
      datasetHash: binding.datasetSha256,
      datasetHashKind: "normalized-utf8-csv-text-sha256",
      modelType: "EndPoint",
      axes: [...fittedAxes],
      evidenceKey: "fnv1a32-aaaaaaaa",
    },
    evidence: {
      kind: "endpoint-independent",
      modelType: "EndPoint",
      axes: [{ id: "axis-1", name: "SVD1" }, { id: "axis-2", name: "SVD2" }],
    },
  };
  return openEnaAiReviewedRequestIdentityV3({
    localScientificIdentity: openEnaAiLocalScientificIdentityV3({
      binding,
      context: { axes: [...fittedAxes], primaryGroup: primary, secondaryGroup: secondary },
      configuration: { analysisFamily: "standard", analysis: { model: { type: "EndPoint" } } },
    }),
    request,
    ...overrides,
  });
}

test("presentation-only 3D display axes and 2D zoom keep consumer and AI identity", () => {
  const confirmed = authority();
  const confirmedAi = reviewIdentity();
  const after3d = selectOpenEnaWorkspacePlotAxis(
    { twoD: [...fittedAxes], threeD: [...displayAxes] },
    "3d",
    0,
    "SVD2",
    inventory,
  );
  assert.deepEqual(after3d.twoD, [...fittedAxes]);
  assert.deepEqual(after3d.threeD, ["SVD2", "SVD1", "SVD3"]);
  assert.equal(
    authority({
      controls: {
        ...endpointControls(after3d.twoD as [string, string]),
        threeDAxes: after3d.threeD,
        selectedAxes: after3d.threeD,
        view: "3d",
        plotZoom: 1.4,
        flipX: true,
      },
    }),
    confirmed,
    "3D display axes, zoom, and flips must not change confirmed inference identity",
  );
  assert.equal(
    reviewIdentity({
      request: {
        schemaVersion: "open-ena-ai-interpretation-request-v2",
        promptVersion: "open-ena-aggregate-inference-review-v2",
        locale: "en",
        binding: {
          analyzedAt: "2026-09-15T00:00:00.000Z",
          datasetHash: binding.datasetSha256,
          datasetHashKind: "normalized-utf8-csv-text-sha256",
          modelType: "EndPoint",
          axes: [...(after3d.twoD ?? fittedAxes)],
          evidenceKey: "fnv1a32-aaaaaaaa",
        },
        evidence: {
          kind: "endpoint-independent",
          modelType: "EndPoint",
          axes: [{ id: "axis-1", name: "SVD1" }, { id: "axis-2", name: "SVD2" }],
        },
      },
    }),
    confirmedAi,
    "unchanged reviewed 2D evidence must keep the current AI identity after presentation actions",
  );
});

test("real evidence and authority changes still invalidate inference and AI identity", () => {
  const confirmed = authority();
  const confirmedAi = reviewIdentity();
  const after2d = selectOpenEnaWorkspacePlotAxis(
    { twoD: [...fittedAxes], threeD: [...displayAxes] },
    "2d",
    1,
    "SVD3",
    inventory,
  );
  assert.notEqual(
    authority({ controls: endpointControls(after2d.twoD as [string, string]) }),
    confirmed,
    "changing fitted 2D inference axes must invalidate confirmed inference",
  );
  assert.notEqual(
    authority({ controls: { ...endpointControls(), primaryGroup: { type: "string", value: "transfer" } } }),
    confirmed,
    "changing Inference Design groups must invalidate confirmed inference",
  );
  assert.notEqual(
    authority({ binding: { ...binding, scientificResultSha256: "d".repeat(64) } }),
    confirmed,
    "changing model/provenance binding must invalidate confirmed inference",
  );
  assert.notEqual(authority({ current: false }), confirmed);
  assert.notEqual(authority({ plan: "e".repeat(64) }), confirmed);
  assert.notEqual(
    reviewIdentity({
      request: {
        schemaVersion: "open-ena-ai-interpretation-request-v2",
        promptVersion: "open-ena-aggregate-inference-review-v2",
        locale: "en",
        binding: {
          analyzedAt: "2026-09-15T00:00:00.000Z",
          datasetHash: binding.datasetSha256,
          datasetHashKind: "normalized-utf8-csv-text-sha256",
          modelType: "EndPoint",
          axes: ["SVD1", "SVD3"],
          evidenceKey: "fnv1a32-bbbbbbbb",
        },
        evidence: {
          kind: "endpoint-independent",
          modelType: "EndPoint",
          axes: [{ id: "axis-1", name: "SVD1" }, { id: "axis-2", name: "SVD3" }],
        },
      },
    }),
    confirmedAi,
    "a changed reviewed request must invalidate the current AI identity",
  );
});

test("leaked presentation fields are stripped from the shared official workbench invalidation key", () => {
  const scientific = endpointControls();
  const leaked = Object.fromEntries(
    OPEN_ENA_WORKBENCH_PRESENTATION_CONTROL_KEYS_V3.map((key) => [key, key === "plotZoom" ? 1.8 : true]),
  );
  assert.deepEqual(
    snapshotOpenEnaConsumerAuthorityControlsV3({ ...scientific, ...leaked }),
    snapshotOpenEnaConsumerAuthorityControlsV3(scientific),
  );
  assert.equal(
    authority({ controls: { ...scientific, ...leaked } }),
    authority({ controls: scientific }),
  );
});

test("official workbench wires presentation-safe consumer and AI invalidation", () => {
  assert.match(workspaceV3Source, /openEnaConsumerAuthorityKeyV3/);
  assert.match(workspaceV3Source, /selectOpenEnaWorkspacePlotAxis/);
  assert.match(workspaceV3Source, /applyPlotAxisSelection/);
  assert.match(workspaceV3Source, /openEnaAiLocalScientificIdentityV3\(activeAiReview\)/);
  assert.match(workspaceV3Source, /onPlotZoomChange=\{setPlotZoom\}/);
  assert.doesNotMatch(workspaceV3Source, /view === "3d" \? setThreeDAxes : setAxes/);
  assert.match(aiComponent, /openEnaAiReviewedRequestIdentityV3/);
  assert.match(
    aiComponent,
    /useEffect\(\(\)\s*=>\s*\{[\s\S]*?setAiResponse\(null\)[\s\S]*?setConsentedRequestIdentity\(null\)[\s\S]*?\},\s*\[[^\]]*requestIdentity[^\]]*\]\);/,
  );
});
