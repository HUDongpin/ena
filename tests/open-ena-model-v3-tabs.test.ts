import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OpenEnaModelTabsV3,
  type OpenEnaModelScientificSummaryV3,
  type OpenEnaModelTabsV3Copy,
} from "../components/open-ena/model-v3/OpenEnaModelTabsV3";
import {
  modelDiagnosticFieldTargetV3,
  modelDiagnosticTabV3,
  modelFieldIdV3,
  OPEN_ENA_MODEL_FIELD_PATHS_V3,
  type ModelUiDiagnosticV3,
} from "../components/open-ena/model-v3/OpenEnaModelDiagnosticsV3";
import type { ModelScientificContextV3 } from "../components/open-ena/model-v3/model-state";
import { compileOnaDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { validateStandardDraftV3 } from "../lib/open-ena/model-v3/diagnostics";
import type { OrderedNetworkDraftV3, StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";
import type { ParsedDataset } from "../lib/open-ena/types";

const scientificContext: ModelScientificContextV3 = Object.freeze({
  datasetSha256: "a".repeat(64),
  family: "standard",
  scientificRevision: 4,
  draftFingerprint: "model-draft-json-v3:{}",
  executionEpoch: 2,
});

const scientificSummary: OpenEnaModelScientificSummaryV3 = {
  context: scientificContext,
  configuration: {
    family: "standard",
    model: "SeparateTrajectory",
    window: "Conversation",
    weighting: "binary",
    rotation: "means",
  },
  counts: {
    units: { availability: "available", value: 2 },
    horizons: { availability: "available", value: 1 },
    groups: { availability: "unavailable" },
    codes: { availability: "available", value: 4 },
  },
};

const diagnostics = Object.freeze<ModelUiDiagnosticV3[]>([
  {
    id: "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT",
    severity: "warning",
    scope: "units",
    fieldPath: "group.Cohort",
    summary: "compiler text must not render",
    detail: "compiler detail must not render",
    blocks: ["group-inference"],
  },
  {
    id: "STANDARD_UNITS_REQUIRED",
    severity: "error",
    scope: "units",
    fieldPath: "unitColumns",
    summary: "compiler text must not render",
    detail: "compiler detail must not render",
    blocks: ["build-model"],
  },
  {
    id: "STANDARD_MEANS_LEVEL_REQUIRED",
    severity: "warning",
    scope: "rotation",
    fieldPath: "rotation.negativeLevel",
    summary: "compiler text must not render",
    detail: "compiler detail must not render",
    blocks: ["group-inference"],
  },
  {
    id: "STANDARD_DATASET_BINDING_INVALID",
    severity: "error",
    scope: "dataset",
    summary: "compiler text must not render",
    detail: "compiler detail must not render",
    blocks: ["build-model"],
  },
]);

const copy: OpenEnaModelTabsV3Copy = {
  tabListLabel: "Model configuration",
  tabs: { units: "Units", horizons: "Horizons", windows: "Windows", codes: "Codes" },
  tabDiagnosticLabel: ({ label, errors, warnings }) => `${label}, ${errors} error and ${warnings} warning`,
  help: {
    units: { buttonLabel: "About Units settings", heading: "Units help", description: "Choose Unit fields." },
    horizons: { buttonLabel: "About Horizons settings", heading: "Horizons help", description: "Choose Horizon fields." },
    windows: { buttonLabel: "About Windows settings", heading: "Windows help", description: "Choose a Window." },
    codes: { buttonLabel: "About Codes settings", heading: "Codes help", description: "Choose Code fields." },
  },
  status: {
    label: "Model status",
    configuration: { incomplete: "Configuration incomplete", ready: "Configuration ready" },
    result: {
      none: "No result",
      running: "Running",
      current: "Current result",
      stale: "Stale result",
      error: "Run error",
      obsolete: "Obsolete run",
      cancelled: "Cancelled run",
    },
    summary: ({ configuration, result }) => `${configuration}. ${result}.`,
  },
  scientificSummary: {
    label: "Scientific configuration",
    fieldLabels: {
      family: "Family",
      model: "Model",
      window: "Window",
      weighting: "Weighting",
      rotation: "Rotation",
      units: "Units count",
      horizons: "Horizons count",
      groups: "Groups count",
      codes: "Codes count",
    },
    family: { standard: "Standard ENA", ona: "Ordered Network Analysis" },
    model: { EndPoint: "End Point", SeparateTrajectory: "Separate Trajectory", AccumulatedTrajectory: "Accumulated Trajectory" },
    window: { MovingStanzaWindow: "Moving Stanza", Conversation: "Conversation" },
    weighting: { binary: "Binary", frequency: "Frequency", "frequency-sum": "Frequency (sum)" },
    rotation: { svd: "SVD", means: "Means", reference: "Reference" },
    count: (value) => `${value}`,
    unavailable: "Unavailable",
  },
  diagnostics: {
    label: "Model diagnostics",
    globalLabel: "Global diagnostics",
    scopeLabels: {
      dataset: "Dataset",
      units: "Units",
      horizons: "Horizons",
      windows: "Windows",
      codes: "Codes",
      rotation: "Rotation",
      reference: "Reference",
      resources: "Resources",
      migration: "Migration",
      model: "Model",
    },
    severityLabels: { error: "Error", warning: "Warning", information: "Information" },
    localize: (diagnostic) => ({
      summary: diagnostic.id === "STANDARD_UNITS_REQUIRED"
        ? "Select at least one Unit field"
        : diagnostic.id === "STANDARD_MEANS_LEVEL_REQUIRED"
          ? "Select both Means levels"
          : "The dataset binding is invalid",
      detail: "Localized diagnostic detail",
    }),
    evidenceLabel: "Evidence",
    evidenceTotal: (totalCount) => `${totalCount} affected rows`,
    evidenceSample: (_sample, index) => `Evidence sample ${index + 1}`,
    evidenceTruncated: "More evidence is available",
    suggestedAction: (action) => ({ label: `Apply ${action.id}`, confirmation: `Confirm ${action.id}` }),
    confirmationTitle: "Confirm scientific change",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
  },
};

test("Models v3 renders exactly four accessible tabs, scoped counts, localized diagnostics, and safe currentness", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaModelTabsV3, {
    copy,
    diagnostics,
    scientificContext,
    scientificSummary,
    status: { configurationReadiness: "ready", editorBlocked: false, runStatus: "idle", resultStatus: "current" },
    renderPanel: (tab, fields) => createElement("input", { id: fields.id(tab === "units" ? "unitColumns" : tab) }),
    onSuggestedAction: () => undefined,
  }));

  assert.equal((markup.match(/role="tab"/gu) ?? []).length, 4);
  assert.match(markup, /aria-label="Model configuration"/u);
  assert.match(markup, /aria-label="Units, 1 error and 1 warning"/u);
  assert.match(markup, /aria-label="Windows, 0 error and 1 warning"/u);
  assert.match(markup, /role="tabpanel"/u);
  assert.match(markup, /Configuration incomplete\. Stale result\./u);
  assert.match(markup, /Scientific configuration/u);
  assert.match(markup, /Standard ENA/u);
  assert.match(markup, /Separate Trajectory/u);
  assert.match(markup, /Conversation/u);
  assert.match(markup, /Binary/u);
  assert.match(markup, /Means/u);
  assert.match(markup, /Groups count<\/dt><dd>Unavailable/u);
  assert.match(markup, /The dataset binding is invalid/u);
  assert.doesNotMatch(markup, /compiler text must not render|compiler detail must not render/u);
  assert.doesNotMatch(markup, /Transmodal/u);
  assert.equal((markup.match(/<button/gu) ?? []).length >= 5, true);
  assert.doesNotMatch(markup, /<button[^>]*>\s*<button/u);
});

test("an empty diagnostic list cannot grant compiler readiness or make a retained result current", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaModelTabsV3, {
    copy,
    diagnostics: [],
    scientificContext,
    scientificSummary,
    status: {
      configurationReadiness: "incomplete",
      editorBlocked: false,
      runStatus: "idle",
      resultStatus: "current",
    },
    renderPanel: () => null,
    onSuggestedAction: () => undefined,
  }));
  assert.match(markup, /Configuration incomplete\. Stale result\./u);
  assert.doesNotMatch(markup, /Configuration ready\. Current result\./u);
});

test("a summary bound to an older scientific context exposes unavailable values instead of old science", () => {
  const newerContext: ModelScientificContextV3 = {
    ...scientificContext,
    scientificRevision: scientificContext.scientificRevision + 1,
    draftFingerprint: `${scientificContext.draftFingerprint}:edited`,
  };
  const markup = renderToStaticMarkup(createElement(OpenEnaModelTabsV3, {
    copy,
    diagnostics: [],
    scientificContext: newerContext,
    scientificSummary,
    status: { configurationReadiness: "incomplete", editorBlocked: false, runStatus: "idle", resultStatus: "stale" },
    renderPanel: () => null,
    onSuggestedAction: () => undefined,
  }));
  assert.equal((markup.match(/<dd>Unavailable<\/dd>/gu) ?? []).length, 8);
  assert.doesNotMatch(markup, /Separate Trajectory|Conversation|Binary|Means/u);
});

test("the ONA summary contract renders only its fixed scientific family values", () => {
  const onaContext: ModelScientificContextV3 = {
    datasetSha256: "b".repeat(64),
    family: "ona",
    scientificRevision: 1,
    draftFingerprint: "model-draft-json-v3:ona",
    executionEpoch: 0,
  };
  const onaSummary: OpenEnaModelScientificSummaryV3 = {
    context: onaContext,
    configuration: {
      family: "ona",
      model: "EndPoint",
      window: "MovingStanzaWindow",
      weighting: "frequency-sum",
      rotation: "svd",
    },
    counts: {
      units: { availability: "unavailable" },
      horizons: { availability: "unavailable" },
      groups: { availability: "unavailable" },
      codes: { availability: "unavailable" },
    },
  };
  const markup = renderToStaticMarkup(createElement(OpenEnaModelTabsV3, {
    copy,
    diagnostics: [],
    scientificContext: onaContext,
    scientificSummary: onaSummary,
    status: { configurationReadiness: "ready", editorBlocked: false, runStatus: "idle", resultStatus: "none" },
    renderPanel: () => null,
    onSuggestedAction: () => undefined,
  }));
  assert.match(markup, /Ordered Network Analysis/u);
  assert.match(markup, /End Point/u);
  assert.match(markup, /Moving Stanza/u);
  assert.match(markup, /Frequency \(sum\)/u);
  assert.match(markup, /SVD/u);
});

test("field navigation IDs are stable and collision-free while dataset paths stay unlinked", () => {
  const dotted = modelFieldIdV3("codes", "codes.A.B");
  const hyphenated = modelFieldIdV3("codes", "codes.A-B");
  const unicode = modelFieldIdV3("codes", "codes.學習投入");
  assert.equal(dotted, modelFieldIdV3("codes", "codes.A.B"));
  assert.equal(new Set([dotted, hyphenated, unicode]).size, 3);
  assert.match(unicode, /^ena-model-field-codes-[a-f0-9]+$/u);
  assert.deepEqual(modelDiagnosticFieldTargetV3("standard", "rotation.negativeLevel"), {
    tab: "units",
    fieldPath: "rotation.negativeLevel",
    fieldId: modelFieldIdV3("units", "rotation.negativeLevel"),
  });
  assert.equal(modelDiagnosticFieldTargetV3("standard", "dataset.rows"), null);
  assert.deepEqual(modelDiagnosticFieldTargetV3("ona", "resources"), {
    tab: "windows",
    fieldPath: "resources",
    fieldId: modelFieldIdV3("windows", "resources"),
  });
  assert.deepEqual(modelDiagnosticFieldTargetV3("ona", "directionalMask"), {
    tab: "codes",
    fieldPath: "directionalMask",
    fieldId: modelFieldIdV3("codes", "directionalMask"),
  });
  const onaDiagnostic = {
    id: "ONA_DRAFT_INVALID",
    severity: "error",
    scope: "model",
    fieldPath: "model",
    summary: "compiler ONA summary",
    detail: "compiler ONA detail",
    blocks: ["build-model"],
  } satisfies ModelUiDiagnosticV3;
  assert.equal(modelDiagnosticTabV3("ona", onaDiagnostic), "windows");
  assert.deepEqual(modelDiagnosticFieldTargetV3("ona", onaDiagnostic.fieldPath), {
    tab: "windows",
    fieldPath: "model",
    fieldId: modelFieldIdV3("windows", "model"),
  });
});

test("actual missing and identical Means diagnostics navigate to the Units contrast group while retaining Rotation scope", () => {
  const dataset: ParsedDataset = {
    name: "means-navigation.csv",
    headers: ["unit", "horizon", "group", "A", "B", "C"],
    rows: [
      { unit: "u1", horizon: "h1", group: "g1", A: 1, B: 1, C: 0 },
      { unit: "u2", horizon: "h1", group: "g2", A: 0, B: 1, C: 1 },
      { unit: "u3", horizon: "h1", group: "g1", A: 1, B: 0, C: 1 },
    ],
    sizeBytes: 1,
    source: "upload",
  };
  const base: StandardEnaDraftV3 = {
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    weighting: "frequency",
    model: "EndPoint",
    windowType: "Conversation",
    movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    horizonOrder: null,
    rotation: { type: "means", centerAlignToOrigin: true, negativeLevel: null, positiveLevel: null },
  };
  const binding = {
    hashKind: "normalized-utf8-csv-text-sha256" as const,
    normalizedTableSha256: "a".repeat(64),
    rowCount: dataset.rows.length,
    headerSha256: "b".repeat(64),
  };
  const cases = [
    ["STANDARD_MEANS_LEVEL_REQUIRED", base],
    ["STANDARD_MEANS_IDENTICAL", {
      ...base,
      rotation: {
        type: "means" as const,
        centerAlignToOrigin: true,
        negativeLevel: { type: "string" as const, value: "g1" },
        positiveLevel: { type: "string" as const, value: "g1" },
      },
    }],
  ] as const;
  for (const [id, draft] of cases) {
    const diagnostic = validateStandardDraftV3(dataset, binding, draft).find((entry) => entry.id === id);
    assert.ok(diagnostic, id);
    assert.equal(diagnostic.fieldPath, "rotation");
    assert.equal(diagnostic.scope, "rotation");
    assert.equal(modelDiagnosticTabV3("standard", diagnostic), "windows");
    assert.deepEqual(modelDiagnosticFieldTargetV3("standard", diagnostic), {
      tab: "units",
      fieldPath: OPEN_ENA_MODEL_FIELD_PATHS_V3.meansContrast,
      fieldId: modelFieldIdV3("units", OPEN_ENA_MODEL_FIELD_PATHS_V3.meansContrast),
    });
  }
});

const ONA_CODE_COLUMNS = ["source.Code[甲]", "B / 特殊", "C::node"] as const;

async function actualOnaAllZeroDiagnostic(zeroCode: typeof ONA_CODE_COLUMNS[number]) {
  const rows = [1, 2].map((time) => Object.fromEntries([
    ["unit", `u${time}`],
    ["horizon", "h1"],
    ["time", time],
    ...ONA_CODE_COLUMNS.map((code, index) => [code, code === zeroCode ? 0 : time + index + 1]),
  ]));
  const dataset: ParsedDataset = {
    name: "ona-code-identity.csv",
    headers: ["unit", "horizon", "time", ...ONA_CODE_COLUMNS],
    rows,
    sizeBytes: 1,
    source: "upload",
  };
  const draft: OrderedNetworkDraftV3 = {
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    groupColumn: null,
    codes: [...ONA_CODE_COLUMNS],
    backward: { kind: "finite", value: 1 },
    rowOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] },
    directionalMask: {
      schemaVersion: 1,
      codeOrder: [...ONA_CODE_COLUMNS],
      enabled: ONA_CODE_COLUMNS.map((_source, sourceIndex) => ONA_CODE_COLUMNS.map((_target, targetIndex) => sourceIndex !== targetIndex)),
    },
  };
  const compiled = await compileOnaDraftV3(dataset, "c".repeat(64), draft);
  assert.equal(compiled.status, "invalid");
  const diagnostic = compiled.diagnostics.find((entry) => entry.id === "ONA_CODE_ALL_ZERO");
  assert.ok(diagnostic, JSON.stringify(compiled.diagnostics));
  return diagnostic;
}

test("actual ONA all-zero diagnostics expose exact structured Code identities without compiler English", async () => {
  const rendered: Array<{ code: string; samples: unknown[]; markup: string }> = [];
  for (const code of ONA_CODE_COLUMNS.slice(0, 2)) {
    const diagnostic = await actualOnaAllZeroDiagnostic(code);
    const samples: unknown[] = [];
    const fixtureCopy: OpenEnaModelTabsV3Copy["diagnostics"] = {
      ...copy.diagnostics,
      localize: () => ({ summary: "An ONA Code is all zero", detail: "Localized ONA detail" }),
      evidenceSample: (sample) => {
        samples.push(sample);
        return `Code column: ${String(Reflect.get(sample, "codeColumn"))}`;
      },
    };
    const markup = renderToStaticMarkup(createElement(
      (await import("../components/open-ena/model-v3/OpenEnaModelDiagnosticsV3")).OpenEnaModelDiagnosticsV3,
      {
        copy: fixtureCopy,
        diagnostics: [diagnostic],
        scientificContext: { ...scientificContext, family: "ona" },
        onNavigateField: () => undefined,
        onSuggestedAction: () => undefined,
      },
    ));
    rendered.push({ code, samples, markup });
    assert.deepEqual(samples, [{ codeColumn: code }]);
    assert.match(markup, new RegExp(code.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.doesNotMatch(markup, /Code &quot;|is all zero\./u);
  }
  assert.notEqual(rendered[0].markup, rendered[1].markup);
});
