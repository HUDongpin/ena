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

test("incomplete order-column edits stay in the draft-safe family transition", () => {
  const handlerStart = workspace.indexOf("function updateOnaOrderPanel");
  const handlerEnd = workspace.indexOf(
    "function openTrajectoryModelConfiguration",
    handlerStart,
  );

  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);

  const handler = workspace.slice(handlerStart, handlerEnd);
  assert.match(handler, /transitionOpenEnaOrderPanelValue/);
  assert.doesNotMatch(handler, /cloneOpenEnaConfig|canonicalizeOpenEnaConfig/);
  assert.match(workspace, /useState<OpenEnaOrderPanelValue>/);
  assert.match(workspace, /setOnaOrderPanelDraft\(transition\.panelValue\)/);
  assert.match(workspace, /value=\{onaOrderPanelDraft\}/);
  assert.doesNotMatch(workspace, /value=\{orderPanelValueFromConfig\(config\)\}/);
  assert.match(
    workspace,
    /const nextFamilyDrafts = createAnalysisFamilyDrafts\(next\);[\s\S]{0,180}setOnaOrderPanelDraft\(orderPanelValueFromConfig\(nextFamilyDrafts\.ona\)\)/,
    "a newly installed dataset/configuration must reset the ordered-form draft from its ONA family draft",
  );
  assert.match(
    workspace,
    /if \(target === "ona"\) \{[\s\S]{0,220}setOnaOrderPanelDraft\(\(current\) => \(\{[\s\S]{0,160}windowSizeBack: transition\.activeConfig\.windowSizeBack/,
    "returning to ONA must preserve its partial form while synchronizing the family-specific window",
  );
});

test("completed result kind, not mutable draft kind, selects the ONA renderer and audited Data View", () => {
  assert.match(workspace, /openEnaAnalysisKindFromResult/);
  assert.match(workspace, /completedResultKind\s*===\s*["']ona["']/);
  assert.match(workspace, /OpenEnaOrderedResultLayout/);
  assert.match(workspace, /buildOpenEnaOnaDataView/);
  assert.match(workspace, /result\.orderedResponseNodeSummary/);
  assert.match(workspace, /OpenEnaOnaStats/);
});

test("ONA Presenter exposes every completed descriptive group instead of freezing the first two", () => {
  assert.match(workspace, /data-testid="open-ena-ona-descriptive-group-controls"/);
  const controls = workspace.match(
    /<section[\s\S]{0,300}data-testid="open-ena-ona-descriptive-group-controls"[\s\S]*?<\/section>/,
  )?.[0] ?? "";
  assert.ok(controls);
  assert.equal(controls.match(/result\.groups\.map\(/g)?.length, 2);
  assert.match(controls, /setPrimaryGroupName/);
  assert.match(controls, /setSecondaryGroupName/);
  assert.match(controls, /copy\.ona\.layout\.primaryPlot/);
  assert.match(controls, /copy\.ona\.layout\.secondaryPlot/);
  assert.match(controls, /copy\.ona\.layout\.descriptiveBoundary/);
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
