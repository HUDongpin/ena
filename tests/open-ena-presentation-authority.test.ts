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
  assert.match(workspaceV3Source, /onReset=\{\(\) => \{ setEdgeScale/);
  assert.doesNotMatch(
    workspaceV3Source,
    /onReset=\{\(\) => \{[^}]*setAxes/,
    "Plot Tools Reset must not clear 2D inference axes",
  );
  assert.doesNotMatch(
    workspaceV3Source,
    /setAxes\(\[\.\.\.value\.dimensions\]\)/,
    "Applying a presentation preset must not assign 2D inference axes",
  );
  assert.match(workspaceV3Source, /open-ena-preset-inference-axes-notice/);
});

test("presentation controls keep the consumer key and reviewed AI identity", () => {
  const confirmed = authority();
  const confirmedAi = reviewIdentity();
  const presentation = {
    view: "3d",
    threeDAxes: ["SVD3", "SVD1", "SVD2"],
    selectedAxes: ["SVD3", "SVD1", "SVD2"],
    xDimension: "SVD3",
    yDimension: "SVD1",
    zDimension: "SVD2",
    camera: { eye: { x: 1.4, y: 1.4, z: 1.4 } },
    cameraPreset: "xy",
    aspectRatio: { x: 1, y: 1.5, z: 0.8 },
    plotZoom: 1.6,
    flipX: true,
    flipY: true,
    edgeThreshold: 0.35,
    edgeScale: 2,
    pointScale: 1.4,
    textScale: 1.2,
    unitCircle: true,
    showLabels: false,
    showGroupLabels: false,
    showUnitLabels: true,
    showPoints: false,
    showNetworks: false,
    showVariance: false,
    showTrajectories: true,
    endpointsOnly: true,
    visibleHorizons: ["h2"],
    showGroupCentroidPaths: false,
    hiddenUnitKeys: ["unit-a"],
  };
  assert.equal(authority({ controls: { ...endpointControls(), ...presentation } }), confirmed);
  assert.equal(reviewIdentity(), confirmedAi);
});

test("group, trajectory design, scientific currentness, binding, plan, locale, and analyzedAt still invalidate", () => {
  const confirmed = authority();
  const confirmedAi = reviewIdentity();
  const period = { type: "string" as const, value: "h1" };
  const later = { type: "string" as const, value: "h2" };
  const independent = {
    axes: [...fittedAxes] as [string, string],
    identityConfirmed: false,
    request: {
      kind: "trajectory-independent-period" as const,
      period,
      primaryGroup: primary,
      secondaryGroup: secondary,
    },
  };
  const independentKey = authority({ controls: independent });
  assert.notEqual(
    authority({ controls: { ...endpointControls(), primaryGroup: { type: "string", value: "transfer" } } }),
    confirmed,
  );
  assert.notEqual(
    authority({
      controls: {
        ...independent,
        request: {
          kind: "trajectory-paired-periods",
          group: primary,
          earlierPeriod: period,
          laterPeriod: later,
          cohortPolicy: "pairwise-complete",
        },
      },
    }),
    independentKey,
  );
  assert.notEqual(
    authority({
      controls: {
        ...independent,
        request: { ...independent.request, period: later },
      },
    }),
    independentKey,
  );
  assert.notEqual(authority({ controls: { ...independent, identityConfirmed: true } }), independentKey);
  assert.notEqual(authority({ current: false }), confirmed, "a scientific edit that stales the result changes current");
  assert.notEqual(authority({ binding: { ...binding, scientificResultSha256: "d".repeat(64) } }), confirmed);
  assert.notEqual(authority({ plan: "e".repeat(64) }), confirmed);
  assert.notEqual(
    reviewIdentity({
      request: {
        schemaVersion: "open-ena-ai-interpretation-request-v2",
        promptVersion: "open-ena-aggregate-inference-review-v2",
        locale: "zh-hant",
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
      },
    }),
    confirmedAi,
  );
  assert.notEqual(
    reviewIdentity({
      localScientificIdentity: "different-local-identity",
    }),
    confirmedAi,
  );
  assert.notEqual(
    reviewIdentity({
      request: {
        schemaVersion: "open-ena-ai-interpretation-request-v2",
        promptVersion: "open-ena-aggregate-inference-review-v2",
        locale: "en",
        binding: {
          analyzedAt: "2026-09-16T00:00:00.000Z",
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
      },
    }),
    confirmedAi,
    "analyzedAt remains part of the reviewed AI identity",
  );
});
