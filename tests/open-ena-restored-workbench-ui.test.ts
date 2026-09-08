import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { restoredWorkbenchCopy } from "../components/open-ena/workbench-restoration-copy";
import { OpenEnaModelTabsV3, type OpenEnaModelScientificSummaryV3 } from "../components/open-ena/model-v3/OpenEnaModelTabsV3";
import type { ModelScientificContextV3 } from "../components/open-ena/model-v3/model-state";
import { renderWorkspaceShellV3 } from "./helpers/open-ena-workspace-v3-ui";
import { OpenEnaNativeComparisonCardsV3 } from "../components/open-ena/model-v3/OpenEnaNativeStatsPanelV3";

const context: ModelScientificContextV3 = {
  datasetSha256: "a".repeat(64), family: "standard", scientificRevision: 2,
  draftFingerprint: "restoration-fixture", executionEpoch: 1,
};
const summary: OpenEnaModelScientificSummaryV3 = {
  context,
  configuration: { family: "standard", model: "EndPoint", window: "MovingStanzaWindow", weighting: "binary", rotation: "svd" },
  counts: {
    units: { availability: "available", value: 8 }, horizons: { availability: "available", value: 8 },
    groups: { availability: "available", value: 2 }, codes: { availability: "available", value: 5 },
  },
};

for (const locale of ["en", "zh-hant", "zh-hans"] as const) {
  test(`${locale}: Model editing and execution precede closed scientific detail`, () => {
    const copy = getOpenEnaCopy(locale);
    const markup = renderToStaticMarkup(createElement(OpenEnaModelTabsV3, {
      copy: copy.modelV3.tabs, scientificContext: context, scientificSummary: summary,
      status: { configurationReadiness: "ready", editorBlocked: false, resultStatus: "current", runStatus: "idle" },
      readyLabel: copy.model.valid, diagnostics: [], onSuggestedAction() {},
      renderPanel: () => createElement("button", { "data-restoration-editor": true }, "Editor"),
      actions: createElement("button", { "data-restoration-run": true }, copy.model.rerun),
    }));
    const editor = markup.indexOf("data-restoration-editor");
    const status = markup.indexOf('role="status"');
    const run = markup.indexOf("data-restoration-run");
    const scientificDetails = markup.indexOf('<details class="ena-model-summary-v3');
    assert.ok(editor > 0 && editor < status && status < run && run < scientificDetails,
      "primary editing, status and execution must be reachable before the scientific summary");
    assert.doesNotMatch(markup.slice(scientificDetails).match(/^<details[^>]*>/)?.[0] ?? "", /\sopen(?:[\s=>])/,
      "the nine-row summary must not displace primary controls on first render");
    assert.equal((markup.match(/<dt>/g) ?? []).length, 9, "scientific metadata is preserved in the disclosure");
    assert.match(markup, /data-result="current"/);
    assert.equal((markup.match(/role="tab"/g) ?? []).length, 4);
    assert.equal((markup.match(/class="ena-official-icon-button ena-model-help-button"/g) ?? []).length, 1);
    assert.equal((markup.match(/<span><\/span>/g) ?? []).length, 0, "empty count badges must not squeeze the active label");
  });

  test(`${locale}: Data opens with its localized upload and sample flow`, () => {
    const markup = renderWorkspaceShellV3(locale);
    const copy = getOpenEnaCopy(locale);
    assert.ok(markup.includes(restoredWorkbenchCopy(locale).dataKicker));
    assert.ok(markup.includes(copy.data.title));
    assert.match(markup, /ena-restored-file-action/);
    const source = markup.indexOf("ena-source-actions");
    const imports = markup.indexOf("ena-data-import-details");
    const artifacts = markup.indexOf("ena-artifacts-disclosure");
    assert.ok(source > 0 && source < imports && imports < artifacts);
    assert.doesNotMatch(markup, /data-testid="open-ena-run-model"/, "Data must not inherit the Model run toolbar");
  });
}

test("restored presentation never upgrades an incomplete configuration to a current result", () => {
  const copy = getOpenEnaCopy("en");
  const markup = renderToStaticMarkup(createElement(OpenEnaModelTabsV3, {
    copy: copy.modelV3.tabs, scientificContext: context, scientificSummary: summary,
    status: { configurationReadiness: "incomplete", editorBlocked: true, resultStatus: "current", runStatus: "idle" },
    readyLabel: copy.model.valid, diagnostics: [], onSuggestedAction() {}, renderPanel: () => null,
  }));
  assert.match(markup, /data-configuration="incomplete" data-result="stale"/);
  assert.ok(!markup.includes(copy.model.valid));
  assert.ok(markup.includes(copy.modelV3.tabs.status.result.stale));
});

test("comparison cards distinguish raw and adjusted p values and retain exact native values", () => {
  const row = Object.freeze({ axis: "SVD2", test: "mann-whitney-u", status: "available", uPrimary: 0,
    pRaw: 0.02857142857142857, pHolm: 0.05714285714285714, rankBiserialPrimaryVsSecondary: -1,
    nPrimary: 4, nSecondary: 4, medianPrimary: -0.1471940450108, medianSecondary: 0.152573745022 });
  const original = JSON.stringify(row);
  const markup = renderToStaticMarkup(createElement(OpenEnaNativeComparisonCardsV3, {
    rows: [row], copy: restoredWorkbenchCopy("en").comparisonCards,
  }));
  assert.match(markup, /data-native-metric="pRaw"[\s\S]*?p \(raw\)[\s\S]*?title="0\.02857142857142857">0\.02857</);
  assert.match(markup, /data-native-metric="pHolm"[\s\S]*?p \(Holm\)[\s\S]*?title="0\.05714285714285714">0\.05714</);
  assert.match(markup, /data-native-metric="rankBiserialPrimaryVsSecondary"[\s\S]*?title="-1">-1</);
  assert.equal(JSON.stringify(row), original, "formatting cannot mutate scientific output");
});

test("unavailable statistics are presented as unavailable, never as invented zero values", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaNativeComparisonCardsV3, {
    rows: [{ axis: "SVD1", status: "unavailable", reason: "insufficient observations", pRaw: null, pHolm: null }],
    copy: restoredWorkbenchCopy("zh-hans").comparisonCards,
  }));
  assert.match(markup, /role="status">insufficient observations</);
  assert.match(markup, /p（Holm 校正）/);
  assert.equal((markup.match(/<span>—<\/span>/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /<dd><span[^>]*>0<\/span>/);
});
