import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ENASet, Row } from "jena-js";
import { directedNodePositions } from "jena-js/rotation";
import { analyzeDataset, buildOpenEnaAnalysisPlan } from "../lib/open-ena/analyze";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { buildOpenEnaOrderedAudit } from "../lib/open-ena/ordered-audit";
import { buildOpenEnaOrderedResponseNodeSummary } from "../lib/open-ena/ordered-node-summary";
import { SAMPLE_CONFIG, type OpenEnaConfig, type ParsedDataset } from "../lib/open-ena/types";
import { buildOnaExecutionPlanV3, runOnaPlanV3, captureOnaJsonV3 } from "../lib/open-ena/model-v3/ona-adapter";
import { canonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import { validateExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { validateBoundOnaResultV3 } from "../lib/open-ena/model-v3/ona-result-binding";
import { decodeCanonicalOnaConfigV3 } from "../lib/open-ena/model-v3/schema";
import { OPEN_ENA_RUNTIME_POLICY_VERSION_V3, OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3 } from "../lib/open-ena/model-v3/types";
import { createOpenEnaWorkerHost, type OpenEnaWorkerRequest, type OpenEnaWorkerResponse } from "../lib/open-ena/jena.worker";

function sha256(bytes: string | Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readBaselineManifest() {
  const bytes = readFileSync(new URL("./fixtures/open-ena/model-v3/baseline-manifest.json", import.meta.url));
  assert.equal(sha256(bytes), "b6db68f8101c510958101d19bdc10ca7a70781b814ad0a65247ce46fb31bfd4c");
  return JSON.parse(bytes.toString("utf8")) as { ona: { publicFixturePath: string; publicFixtureSha256: string } };
}

function readPublicFixture() {
  const manifest = readBaselineManifest();
  const bytes = readFileSync(new URL(`../${manifest.ona.publicFixturePath}`, import.meta.url));
  assert.equal(sha256(bytes), manifest.ona.publicFixtureSha256);
  return JSON.parse(bytes.toString("utf8")) as {
    codes: string[]; rows: Row[]; codeColumns: string[];
    cases: Array<{ tmaWindowSize: number; jenaWindowSizeBack: number; connectionCounts: number[] }>;
  };
}

function fixtureInput(rows: Row[], codes: string[], backward: number, sourceOrder: boolean, masked = false) {
  const headers = Object.keys(rows[0]);
  const csv = `${headers.join(",")}\n${rows.map((row) => headers.map((key) => row[key]).join(",")).join("\n")}\n`;
  const dataset: ParsedDataset = { name: "ona-public-nonregression.csv", headers, rows, sizeBytes: Buffer.byteLength(csv), source: "upload" };
  const datasetSha256 = sha256(csv);
  const directionalMask = createDirectionalMask(codes);
  if (masked) directionalMask.enabled[0][1] = false;
  const groupColumn = headers.includes("group") ? "group" : null;
  const legacyConfig: OpenEnaConfig = {
    ...SAMPLE_CONFIG, analysisKind: "ona", unitColumns: ["unit"], conversationColumns: ["horizon"], groupColumn, codes,
    model: "EndPoint", window: "MovingStanzaWindow", windowSizeBack: backward, windowSizeForward: 0,
    weightBy: "sum", rotation: "svd", centerAlignToOrigin: true, referenceRotationId: null, directionalMask,
    orderPolicy: sourceOrder ? { kind: "source-row", confirmed: true } : { kind: "columns", columns: ["turn"], comparators: { turn: "number" } },
  };
  const configuration = decodeCanonicalOnaConfigV3({
    schemaVersion: 3, analysisFamily: "ona",
    contracts: { validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3, runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3 },
    units: { columns: ["unit"], group: groupColumn === null ? { type: "none" } : { type: "stable-metadata", column: groupColumn } },
    horizons: { columns: ["horizon"] }, codes: codes.map((column) => ({ column, displayLabel: column })),
    model: { type: "EndPoint" }, weighting: { type: "frequency", engineMethod: "sum" },
    window: { type: "MovingStanzaWindow", backward: Number.isFinite(backward) ? { kind: "finite", value: backward } : { kind: "infinity" }, forward: 0,
      rowOrder: sourceOrder ? { kind: "source-order-confirmed", confirmation: {
        kind: "explicit-researcher-confirmation", analysisFamily: "ona", datasetSha256, rowCount: rows.length,
        relevantColumns: ["horizon"], confirmedAt: "2026-09-07T00:00:00.000Z", confirmationVersion: 1,
      } } : { kind: "columns", keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }] } },
    rotation: { type: "svd", centerAlignToOrigin: true }, directionalMask,
  });
  return { dataset, datasetSha256, legacyConfig, configuration };
}

type FixtureInput = ReturnType<typeof fixtureInput>;
type OnaPlan = Awaited<ReturnType<typeof buildOnaExecutionPlanV3>>;

function buildLegacyOnaFixtureResult(input: FixtureInput) {
  const result = analyzeDataset(input.dataset, input.legacyConfig);
  const plan = buildOpenEnaAnalysisPlan(input.dataset, input.legacyConfig);
  return { ...result, orderedAudit: buildOpenEnaOrderedAudit(result.set),
    orderedResponseNodeSummary: buildOpenEnaOrderedResponseNodeSummary(plan.options.rows, input.legacyConfig),
    runtimeSourceRowIndices: plan.executionProvenance.ordering!.responseRowSourceIndices };
}

async function buildV3OnaFixtureResult(input: FixtureInput) {
  const plan = await buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  assert.deepEqual(await validateExecutionPlanV3(structuredClone(plan)), plan);
  // Exercise the production streaming Worker, compact binder and result validator.
  let receive: (event: { data: OpenEnaWorkerRequest }) => void = () => {};
  const terminal = new Promise<OpenEnaWorkerResponse>((resolve) => {
    createOpenEnaWorkerHost({
      addEventListener(_type, listener) { receive = listener; },
      postMessage(message) { if (["result-v3", "error", "cancelled"].includes(message.kind)) resolve(message); },
    });
  });
  receive({ data: { kind: "run-open-ena-plan-v3", id: "ona-nonregression", plan, chunkSize: 2 } });
  const message = await terminal;
  assert.equal(message.kind, "result-v3", message.kind === "error" ? message.message : "Worker must complete");
  assert.ok(message.kind === "result-v3");
  const result = await validateBoundOnaResultV3(message.result, plan);
  assert.equal(result.configuration.analysisFamily, "ona");
  assert.ok(result.orderedAudit && result.orderedResponseNodeSummary);
  // These are deliberately compact native fields, separate from scientific equality.
  for (const field of ["rawRows", "rowConnectionCounts", "rowWindowProvenance", "metaData"] as const) assert.deepEqual(result.set[field], [], field);
  assert.equal(result.executionProvenance.resources.observed.processedRows, input.dataset.rows.length);
  return { result, plan };
}

function exactLookup<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  assert.ok(map.has(key), `unmapped scientific identity: ${String(key)}`);
  return map.get(key)!;
}

// Alias restoration is a source-bound bijection, never a numerical projection.
// This fixture contract uses single string Unit/group identities, so even label
// coercion is unnecessary. Every native field is retained in the compared tables.
type BoundOnaResult = Awaited<ReturnType<typeof validateBoundOnaResultV3>>;
function sourceAliases(set: ENASet | BoundOnaResult["set"], plan: OnaPlan, input: FixtureInput, labels: BoundOnaResult["executionProvenance"]["labels"], bound: boolean) {
  const unitColumn = bound ? labels.unitColumn : plan.adapterParameters.unitTokenColumn;
  const groupColumn = bound ? labels.groupColumn : plan.adapterParameters.groupTokenColumn;
  const roleMap = (role: "units" | "groups", column: string) => {
    const entries = plan.identityDictionary[role];
    const map = new Map(entries.map((entry) => {
      assert.equal(entry.fields.length, 1);
      const field = entry.fields[0];
      assert.equal(field.column, column);
      assert.equal(field.value.type, "string");
      assert.equal(typeof field.value.value, "string");
      return [bound ? entry.displayLabel : entry.token, field.value.value as string] as const;
    }));
    assert.equal(map.size, entries.length);
    assert.equal(new Set(map.values()).size, map.size);
    assert.deepEqual(new Set(map.values()), new Set(input.dataset.rows.map((row) => row[column])));
    return map;
  };
  const units = roleMap("units", "unit");
  const groups = input.legacyConfig.groupColumn ? roleMap("groups", "group") : new Map<string, string>();
  assert.equal(labels.codes.length, plan.codeDictionary.codes.length);
  const codes = new Map(labels.codes.map((entry, index) => {
    const source = plan.codeDictionary.codes[index];
    assert.equal(entry.runtimeToken, source.token);
    assert.equal(entry.sourceColumn, source.sourceColumn);
    assert.deepEqual(entry.canonicalIdentity, source.canonicalIdentity);
    return [bound ? entry.column : entry.runtimeToken, source.sourceColumn] as const;
  }));
  assert.equal(codes.size, input.legacyConfig.codes.length);
  assert.deepEqual([...codes.values()], input.legacyConfig.codes);
  assert.deepEqual(set.codes, [...codes.keys()]);
  assert.equal(set.adjacencyKey.length, codes.size ** 2);
  const edges = new Map(set.adjacencyKey.map((edge, index) => {
    const ground = index % codes.size, response = Math.floor(index / codes.size);
    const declared = plan.codeDictionary.edges[index];
    const boundEdge = labels.edges[index];
    assert.equal(bound ? boundEdge.column : boundEdge.runtimeColumn, edge.name);
    assert.deepEqual(boundEdge.sourceCodeIdentity, labels.codes[ground].canonicalIdentity);
    assert.deepEqual(boundEdge.targetCodeIdentity, labels.codes[response].canonicalIdentity);
    assert.equal(declared.groundIndex, ground);
    assert.equal(declared.responseIndex, response);
    assert.equal(edge.sourceIndex, ground);
    assert.equal(edge.targetIndex, response);
    assert.equal(edge.source, set.codes[ground]);
    assert.equal(edge.target, set.codes[response]);
    assert.equal(edge.name, set.codeColumns[index]);
    return [edge.name, `${exactLookup(codes, edge.source)} & ${exactLookup(codes, edge.target)}`] as const;
  }));
  assert.equal(edges.size, codes.size ** 2);
  assert.equal(new Set(edges.values()).size, edges.size);
  const restoreRow = (row: Row): Row => {
    const output: Row = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === unitColumn || key === "ENA_UNIT" || key === "unit") {
        assert.equal(typeof value, "string");
        output[key === unitColumn ? "unit" : key] = exactLookup(units, value as string);
      } else if (key === groupColumn) {
        assert.equal(typeof value, "string");
        output.group = exactLookup(groups, value as string);
      } else output[edges.get(key) ?? key] = value;
    }
    return output;
  };
  const adjacencyKey = set.adjacencyKey.map((edge) => ({ ...edge, source: exactLookup(codes, edge.source), target: exactLookup(codes, edge.target), name: exactLookup(edges, edge.name) }));
  return {
    set: { ...set, unitLabels: set.unitLabels.map((unit) => exactLookup(units, unit)), codes: set.codes.map((code) => exactLookup(codes, code)), codeColumns: set.codeColumns.map((edge) => exactLookup(edges, edge)), adjacencyKey,
      connectionCounts: set.connectionCounts.map(restoreRow), lineWeights: set.lineWeights.map(restoreRow),
      pointsForProjection: set.pointsForProjection.map(restoreRow), points: set.points.map(restoreRow), centroids: set.centroids?.map(restoreRow),
      rotation: { ...set.rotation, codes: set.rotation.codes.map((code) => exactLookup(codes, code)),
        adjacencyKey: set.rotation.adjacencyKey.map((edge) => ({ ...edge, source: exactLookup(codes, edge.source), target: exactLookup(codes, edge.target), name: exactLookup(edges, edge.name) })),
        nodes: set.rotation.nodes?.map((node): Row => { assert.equal(typeof node.code, "string"); return { ...node, code: exactLookup(codes, node.code as string) }; }) } },
    code: (token: string) => exactLookup(codes, token), group: (token: string) => exactLookup(groups, token),
  };
}

async function assertCompleteParity(input: FixtureInput) {
  const legacy = buildLegacyOnaFixtureResult(input);
  const { result, plan } = await buildV3OnaFixtureResult(input);
  assert.deepEqual(result.executionProvenance.identityDictionary, plan.identityDictionary);
  assert.deepEqual(result.executionProvenance.codeDictionary, plan.codeDictionary);
  const runtime = runOnaPlanV3(plan);
  const boundAliases = sourceAliases(result.set, plan, input, result.executionProvenance.labels, true);
  for (const [current, bound] of [[runtime, false], [result, true]] as const) {
    const aliases = bound ? boundAliases : sourceAliases(current.set, plan, input, result.executionProvenance.labels, false);
    for (const field of ["unitLabels", "codes", "codeColumns", "adjacencyKey", "connectionCounts", "connectionMatrix", "lineWeights", "pointsForProjection", "points", "centroids", "rotation", "variance"] as const) {
      // Runtime equality includes IEEE signed zero. The existing JSON boundary
      // explicitly represents -0 as 0; canonical serialization rejects lossier
      // unsupported values and does not round any finite nonzero number.
      const expected = bound ? JSON.parse(canonicalJsonV3(legacy.set[field])) : legacy.set[field];
      assert.deepEqual(aliases.set[field], expected, `${bound ? "bound JSON" : "runtime exact"} complete ${field}`);
    }
    assert.deepEqual({ ...current.orderedAudit, codeOrder: current.orderedAudit.codeOrder.map(aliases.code) }, legacy.orderedAudit);
    const summary = current.orderedResponseNodeSummary;
    const groups = summary.groups.map((group) => ({ ...group, name: input.legacyConfig.groupColumn ? aliases.group(group.name) : group.name }));
    // The product summary sorts by display name; token sorting uses another order.
    assert.equal(new Set(groups.map((group) => group.name)).size, groups.length);
    groups.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    assert.deepEqual({ ...summary, codeOrder: summary.codeOrder.map(aliases.code), groups }, legacy.orderedResponseNodeSummary);
  }
  assert.deepEqual(plan.runtimeSourceRowIndices, legacy.runtimeSourceRowIndices);
  return { legacy, v3: boundAliases.set };
}

for (const golden of readPublicFixture().cases) {
  test(`v3 ONA preserves frozen public counts and complete legacy geometry: tma=${golden.tmaWindowSize}`, { timeout: 10000 }, async () => {
    const fixture = readPublicFixture();
    assert.equal(golden.jenaWindowSizeBack, golden.tmaWindowSize + 1);
    const { legacy, v3 } = await assertCompleteParity(fixtureInput(fixture.rows, fixture.codes, golden.jenaWindowSizeBack, true));
    // The frozen R/tma artifact is COUNT-ONLY. Both independently executed
    // product paths must equal every count it contains, without refitting it.
    for (const set of [legacy.set, v3]) {
      assert.deepEqual(set.codeColumns, fixture.codeColumns);
      assert.deepEqual(set.connectionMatrix, [golden.connectionCounts]);
    }
  });
}

for (const backward of [2, Infinity]) for (const sourceOrder of [false, true]) {
  test(`nondegenerate ONA full display geometry, mask, audit and group totals: backward=${backward}, source=${sourceOrder}`, { timeout: 10000 }, async () => {
    const rows: Row[] = [
      { unit: "u1", horizon: "z", turn: 2, group: "zeta", A: 2, B: 0, C: 1 },
      { unit: "u3", horizon: "a", turn: 1, group: "zeta", A: 1, B: 1, C: 0 },
      { unit: "u2", horizon: "z", turn: 1, group: "alpha", A: 0, B: 3, C: 1 },
      { unit: "u1", horizon: "a", turn: 2, group: "zeta", A: 0, B: 2, C: 2 },
      { unit: "u4", horizon: "m", turn: 1, group: "alpha", A: 1, B: 0, C: 3 },
      { unit: "u2", horizon: "m", turn: 2, group: "alpha", A: 3, B: 2, C: 1 },
    ];
    const { v3 } = await assertCompleteParity(fixtureInput(rows, ["C", "A", "B"], backward, sourceOrder, true));
    assert.ok(v3.rotation.eigenvalues.filter((value) => value > 1e-10).length >= 2, "geometry must exercise more than the singleton zero fit");
    assert.ok(v3.rotation.nodes!.some((node) => Math.abs(Number(node.SVD1)) > 0.01));
  });
}

test("directed node ridge retains its independent analytical solution after the Standard solver change", () => {
  // Self edges counted once give W = I. For T below the preserved ONA
  // ridge normal equations are (I + 1e-10 I) X = T, so X = T/(1+1e-10).
  // This is an analytical directed-path check, not frozen R geometry evidence.
  const points = [[1, -2], [3, 4]];
  const result = directedNodePositions([[1, 0, 0, 0], [0, 0, 0, 1]], points);
  assert.deepEqual(result.weights, [[1, 0], [0, 1]]);
  const expected = points.map((row) => row.map((value) => value / (1 + 1e-10)));
  assert.deepEqual(result.nodes, expected);
  assert.deepEqual(result.centroids, expected);
  assert.notDeepEqual(result.nodes, points, "switching ONA to the unregularized Standard fit must fail");
});


test("ONA JSON boundary changes only signed zero among finite scientific numbers", () => {
  const values = [-0, 0, Number.MIN_VALUE, -Number.MIN_VALUE, 1e-200, -1e-200, 1 + Number.EPSILON, Number.MAX_VALUE];
  const expected = [0, ...values.slice(1)];
  const options = { byteLimit: 10000, structuralLimit: 10000, scalarKind: (path: string) => path === "$" ? undefined : "number" as const };
  assert.deepEqual(captureOnaJsonV3(values, options), expected);
  assert.deepEqual(JSON.parse(canonicalJsonV3(values)), expected);
  assert.ok(Object.is(values[0], -0), "the unmodified runtime value retains its sign");
  for (const bad of [NaN, Infinity, -Infinity, undefined, "0", null]) {
    assert.throws(() => captureOnaJsonV3([bad], options));
  }
  for (const bad of [NaN, Infinity, undefined]) assert.throws(() => canonicalJsonV3({ scientific: bad }));
});
