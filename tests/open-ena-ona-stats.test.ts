import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Row } from "jena-js";
import {
  analyzeDataset,
  compactOpenEnaSet,
} from "../lib/open-ena/analyze";
import OpenEnaOnaStats from "../components/open-ena/OpenEnaOnaStats";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { buildOpenEnaOrderedAudit } from "../lib/open-ena/ordered-audit";
import type { OpenEnaConfig, OpenEnaResult, ParsedDataset } from "../lib/open-ena/types";

function orderedFixture() {
  const codes = ["A", "B", "C"];
  const directionalMask = createDirectionalMask(codes);
  directionalMask.enabled[1][0] = false;
  const config: OpenEnaConfig = {
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
    centerAlignToOrigin: true,
    orderPolicy: { kind: "columns", columns: ["turn"], comparators: { turn: "number" } },
    directionalMask,
  };
  const dataset: ParsedDataset = {
    name: "stats.csv",
    headers: ["unit", "horizon", "turn", "group", "A", "B", "C"],
    rows: [
      { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 2, B: 0, C: 0 },
      { unit: "u1", horizon: "h1", turn: 2, group: "g1", A: 0, B: 3, C: 0 },
      { unit: "u2", horizon: "h2", turn: 1, group: "g2", A: 1, B: 1, C: 0 },
      { unit: "u2", horizon: "h2", turn: 2, group: "g2", A: 0, B: 2, C: 1 },
    ] as Row[],
    sizeBytes: 1,
    source: "upload",
  };
  const full = analyzeDataset(dataset, config);
  const orderedAudit = buildOpenEnaOrderedAudit(full.set);
  assert.ok(orderedAudit);
  const result = {
    ...full,
    set: compactOpenEnaSet(full.set),
    orderedAudit,
  } as OpenEnaResult;
  return { config, result };
}

test("ONA Stats renders an accessible descriptive dashboard without inferential or causal language", () => {
  const { config, result } = orderedFixture();
  const markup = renderToStaticMarkup(createElement(OpenEnaOnaStats, { result, config }));
  const text = markup.replace(/<[^>]+>/gu, "");

  assert.match(markup, /data-testid="open-ena-ona-stats"/);
  assert.match(markup, /data-ona-boundary="descriptive-only"/);
  assert.match(text, /Descriptive only/i);
  assert.match(text, /2 analytic units/i);
  assert.match(text, /4 ordered response rows/i);
  assert.match(text, /2 opaque horizons/i);
  assert.match(text, /9 directed cells/i);
  assert.match(text, /1 masked/i);
  assert.match(text, /Zero networks/i);
  assert.match(text, /Incoming raw mass/i);
  assert.match(text, /Outgoing raw mass/i);
  assert.match(text, /Top directed cells/i);
  assert.match(text, /Pair asymmetry/i);
  assert.match(text, /Variance diagnostics/i);
  assert.match(text, /Group unit counts/i);
  assert.doesNotMatch(text, /p[- ]?value|effect size|confidence interval|caus(?:al|ation)/i);
});

test("ONA Stats labels group views as descriptive means rather than differences", () => {
  const { config, result } = orderedFixture();
  const markup = renderToStaticMarkup(createElement(OpenEnaOnaStats, {
    result,
    config,
    scope: { kind: "group", name: "g1" },
  }));

  assert.match(markup, /g1 ordered mean network/i);
  assert.match(markup, /No subtraction or inferential comparison is computed/i);
  assert.doesNotMatch(markup, /difference network/i);
});

test("ONA Stats exposes every explanatory result phrase through structured copy", () => {
  const { config, result } = orderedFixture();
  const markup = renderToStaticMarkup(createElement(OpenEnaOnaStats, {
    result,
    config,
    scope: { kind: "group", name: "g1" },
    copy: {
      groupScopeLabel: "LOC scope {group}",
      modelCoverage: "LOC coverage",
      normalizedMean: "LOC normalized",
      raw: "LOC raw",
      nonzeroUnits: "LOC nonzero",
      absoluteNormalizedAsymmetry: "LOC asymmetry",
      tie: "LOC tie",
    },
  }));

  assert.match(markup, /LOC scope g1/);
  assert.match(markup, /aria-label="LOC coverage"/);
  assert.match(markup, /LOC normalized/);
  assert.match(markup, /LOC raw/);
  assert.match(markup, /LOC nonzero/);
  assert.match(markup, /LOC asymmetry/);
  assert.doesNotMatch(markup, />normalized mean<|>absolute normalized asymmetry</i);
});
