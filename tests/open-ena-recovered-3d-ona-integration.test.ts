import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  OPEN_ENA_CAPABILITIES,
  OpenEnaCapabilityError,
  assertOpenEnaCapabilityForConfig,
  openEnaDataViewAvailability,
} from "../lib/open-ena/capabilities";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { SAMPLE_CONFIG, type OpenEnaConfig } from "../lib/open-ena/types";

const projectRoot = process.cwd();
const codes = ["A", "B", "C"];
const orderedConfig: OpenEnaConfig = {
  ...SAMPLE_CONFIG,
  analysisKind: "ona",
  unitColumns: ["unit"],
  conversationColumns: ["horizon"],
  groupColumn: "group",
  codes,
  model: "EndPoint",
  window: "MovingStanzaWindow",
  windowSizeBack: 2,
  windowSizeForward: 0,
  weightBy: "sum",
  rotation: "svd",
  referenceRotationId: null,
  orderPolicy: {
    kind: "columns",
    columns: ["turn"],
    comparators: { turn: "number" },
  },
  directionalMask: createDirectionalMask(codes),
};

test("recovered 3D ONA is one verified capability while unrelated ONA features remain fail-closed", () => {
  assert.equal(OPEN_ENA_CAPABILITIES.ona.threeDimensionalPlot, true);
  assert.doesNotThrow(() => assertOpenEnaCapabilityForConfig(orderedConfig, "3d"));
  assert.throws(
    () => assertOpenEnaCapabilityForConfig(orderedConfig, "inference"),
    (error) => error instanceof OpenEnaCapabilityError
      && error.code === "ona-feature-not-verified"
      && error.feature === "inference",
  );
  assert.deepEqual(openEnaDataViewAvailability({
    view: "3d",
    completedResultKind: "ona",
    hasActiveGroupContrast: false,
  }), { enabled: true, reason: null });
});

test("the recovered 3D ONA evidence lane remains a first-class local gate", () => {
  const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts["test:browser:open-ena-ona-3d"],
    "node tests/open-ena-ona-3d-browser-smoke.mjs",
  );
  for (const relativePath of [
    "tests/open-ena-ona-3d-browser-smoke-contract.test.ts",
    "tests/open-ena-ona-3d-browser-smoke.mjs",
    "tests/open-ena-ona-yu-3d-gate.test.ts",
    "scripts/verify-open-ena-ona-yu-3d-gate.ts",
  ]) {
    assert.equal(existsSync(join(projectRoot, relativePath)), true, `${relativePath} must be restored`);
  }
});

test("user-facing and manifest boundaries no longer contradict the reachable verified 3D ONA route", () => {
  const i18n = readFileSync(join(projectRoot, "lib/open-ena-i18n.ts"), "utf8");
  const analyze = readFileSync(join(projectRoot, "lib/open-ena/analyze.ts"), "utf8");
  const workspace = readFileSync(
    join(projectRoot, "components/open-ena/OpenEnaWorkspace.tsx"),
    "utf8",
  );
  assert.doesNotMatch(i18n, /3D ONA is not verified in this release/u);
  assert.match(analyze, /3D ONA is display-only and consumes the same completed fitted coordinates/u);
  assert.match(
    workspace,
    /const threeDViewLabel = completedResultKind === "ona"[\s\S]*?copy\.ona\.workspace\.threeD[\s\S]*?: copy\.views\.threeD/u,
  );
  assert.match(workspace, /aria-label=\{!genericThreeDAvailable[\s\S]*?threeDViewLabel/u);
});

test("the current 3D ONA layout preserves side plots while Data View replaces only Overall", () => {
  const workspace = readFileSync(
    join(projectRoot, "components/open-ena/OpenEnaWorkspace.tsx"),
    "utf8",
  );
  const layout = readFileSync(
    join(projectRoot, "components/open-ena/OpenEna3DOrderedResultLayout.tsx"),
    "utf8",
  );
  assert.match(layout, /centerMode:\s*"plot"\s*\|\s*"data"/u);
  assert.match(layout, /dataView\?:\s*ReactNode/u);
  assert.match(
    layout,
    /centerMode === "data"[\s\S]*?data-testid="open-ena-ona-3d-data-view"[\s\S]*?:\s*\([\s\S]*?data-testid="open-ena-ona-3d-overall-plot"/u,
  );
  assert.match(
    workspace,
    /<OpenEna3DOrderedResultLayout[\s\S]*?centerMode=\{effectiveCenterSurface\}[\s\S]*?dataView=\{effectiveCenterSurface === "data"/u,
  );
});
