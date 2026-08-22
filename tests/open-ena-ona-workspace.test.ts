import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url),
  "utf8",
);
const dataView = readFileSync(
  new URL("../components/open-ena/OpenEnaDataView.tsx", import.meta.url),
  "utf8",
);
const i18n = readFileSync(new URL("../lib/open-ena-i18n.ts", import.meta.url), "utf8");

test("Workspace integrates ONA as a complete analysis family rather than one switch", () => {
  assert.match(workspace, /OpenEnaAnalysisFamilyControl/);
  assert.match(workspace, /OpenEnaOrderPanel/);
  assert.match(workspace, /OpenEnaDirectionalMaskEditor/);
  assert.match(workspace, /createAnalysisFamilyDrafts/);
  assert.match(workspace, /beginAnalysisFamilyConfiguration/);
  assert.match(workspace, /switchAnalysisFamily/);
  assert.doesNotMatch(workspace, /role=["']switch["'][^\n]*analysisKind/i);
});

test("completed result kind, not mutable draft kind, selects the ONA renderer and audited Data View", () => {
  assert.match(workspace, /openEnaAnalysisKindFromResult/);
  assert.match(workspace, /completedResultKind\s*===\s*["']ona["']/);
  assert.match(workspace, /OpenEnaOrderedResultLayout/);
  assert.match(workspace, /buildOpenEnaOnaDataView/);
  assert.match(workspace, /result\.orderedResponseNodeSummary/);
  assert.match(workspace, /OpenEnaOnaStats/);
});

test("ONA Data View and capability controls are wired before unsupported actions can run", () => {
  assert.match(dataView, /"provenance"/);
  assert.match(dataView, /"directed-edge"/);
  assert.match(workspace, /onaCapabilityDisabled/);
  assert.match(workspace, /disabled=\{[^}]*onaCapabilityDisabled/);
  assert.match(workspace, /disabled=\{[^}]*completedResultKind\s*===\s*["']ona["']/);
  assert.match(workspace, /completedResultKind\s*===\s*["']ona["'][\s\S]*copy\.ona\.unavailable\.sets/);
  assert.match(workspace, /capabilityAnalysisKind\s*===\s*["']ona["']/);
});

test("ONA exports distinguish aggregate, de-identified audit, local identity view, and full bundle", () => {
  assert.match(workspace, /buildOpenEnaOnaAggregateEdgeExport/);
  assert.match(workspace, /buildOpenEnaOnaDeidentifiedAuditExport/);
  assert.match(workspace, /copy\.ona\.exports\.auditWarning/);
  assert.match(workspace, /copy\.ona\.exports\.auditConfirmation/);
  assert.match(workspace, /copy\.ona\.exports\.bundleConfirmation/);
  assert.match(workspace, /local-identity-bearing-view/);
});

test("English, Traditional Chinese, and Simplified Chinese ONA research copy is present", () => {
  assert.match(i18n, /ona:\s*\{/);
  assert.match(i18n, /Ordered Network Analysis/);
  assert.match(i18n, /順序網絡分析/);
  assert.match(i18n, /顺序网络分析/);
  assert.match(i18n, /ground\/source/);
  assert.match(i18n, /來源\/ground|來源碼|源码|source\/ground/);
});
