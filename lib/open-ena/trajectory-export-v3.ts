import { assertOpenEnaTrajectoryPathInferenceConsumerV3, captureOpenEnaTrajectoryPathControlsV3, type OpenEnaTrajectoryPathControlsV3, type OpenEnaTrajectoryPathInferenceResultV3 } from "./trajectory-path-inference-v3";
import { assertOpenEnaTrajectoryInferenceConsumerV3, type OpenEnaTrajectoryInferenceResultV3 } from "./inference-v2";
import { captureControlArrayV3 } from "./inference-consumers-v3";
import { buildLongitudinalViewV3, type OpenEnaTrajectoryControlsV3 } from "./longitudinal-bound-v3";
import { canonicalJsonV3, deepFreezeV3, snapshotPlainJsonRecordV3 } from "./model-v3/canonical-json";
import { canonicalJsonByteLengthV3 } from "./model-v3/standard-closure-resource-budget";

export interface OpenEnaTrajectoryExportOptionsV3 {
  path: { value: unknown; controls: OpenEnaTrajectoryPathControlsV3 };
  /** Independently collected genuine native rank computations under this same result/plan. */
  ranks?: readonly { value: unknown; controls: OpenEnaTrajectoryControlsV3 }[];
  /** Omission means aggregate only. An explicit user choice is required for each export. */
  participantConsent?: { includeParticipants: true };
}
const MAX_FILE_BYTES = 16 * 1024 * 1024, MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const encoder = new TextEncoder();
function exact(r: Record<string, unknown>, allowed: readonly string[], label: string) { if (Object.keys(r).some(k => !allowed.includes(k))) throw new TypeError(`Unknown ${label} fields`); }
function pair(input: unknown) { const r = snapshotPlainJsonRecordV3(input, "inference export selection"); exact(r, ["value", "controls"], "inference selection"); if (!Object.hasOwn(r, "value") || !Object.hasOwn(r, "controls")) throw new TypeError("Export requires a producer envelope with its controls"); return r; }
async function admit(result: unknown, plan: unknown, input: OpenEnaTrajectoryExportOptionsV3) {
  const o = snapshotPlainJsonRecordV3(input, "trajectory export options"); exact(o, ["path", "ranks", "participantConsent"], "export options");
  let participants = false;
  if (o.participantConsent !== undefined) { const c = snapshotPlainJsonRecordV3(o.participantConsent, "participant consent"); exact(c, ["includeParticipants"], "participant consent"); if (c.includeParticipants !== true) throw new TypeError("Participant consent must explicitly includeParticipants:true or be omitted"); participants = true; }
  const p = pair(o.path), controls = captureOpenEnaTrajectoryPathControlsV3(p.controls as OpenEnaTrajectoryPathControlsV3);
  const ranks = o.ranks === undefined ? [] : captureControlArrayV3(o.ranks, "export rank collection", undefined, 3).map(pair);
  // Every consumer synchronously captures its controls/result/plan before its
  // first await. Caller mutation cannot broaden consent, select another rank
  // envelope or silently replace any computation while export hashes await.
  const pathPromise = assertOpenEnaTrajectoryPathInferenceConsumerV3(p.value, result, plan, controls);
  const rankPromises = ranks.map(r => assertOpenEnaTrajectoryInferenceConsumerV3(r.value, result, plan, r.controls as OpenEnaTrajectoryControlsV3));
  const [path, admittedRanks] = await Promise.all([pathPromise, Promise.all(rankPromises)]);
  if (new Set(admittedRanks.map(r => r.inference.kind)).size !== admittedRanks.length) throw new TypeError("Export rank collection requires at most one genuinely computed request per design");
  return { path, ranks: admittedRanks, participants };
}
function pick(input: object, keys: readonly string[]): Record<string, unknown> { const r = input as Record<string, unknown>; return Object.fromEntries(keys.filter(k => Object.hasOwn(r, k)).map(k => [k, r[k]])); }
const rowFields = ["axisIndex", "axis", "status", "reason", "familyId", "memberId", "familySizePlanned", "pRaw", "pHolm", "holmRank", "holmMultiplier", "resolvedPMethod", "continuityCorrectionApplied", "tieGroupCount", "tiedObservationCount", "tieCorrectionSum", "warnings", "test", "effectDirection", "nPrimary", "nSecondary", "medianPrimary", "medianSecondary", "uPrimary", "uSecondary", "z", "rankBiserialPrimaryVsSecondary", "earlierPeriodIndex", "laterPeriodIndex", "differenceDirection", "nMatched", "nMissing", "nPositive", "nNegative", "nZero", "nNonzero", "nRanked", "medianDifference", "q1Difference", "q3Difference", "iqrDifference", "wPositive", "wNegative", "t", "rankBiserialLaterVsEarlier", "nComplete", "nMissingCompleteBlocks", "nPeriods", "q", "degreesFreedom", "kendallsW"];
const ledgerFields = ["candidateEntityCount", "primaryAvailableCount", "secondaryAvailableCount", "includedEntityCount", "includedCompactPointCount", "includedSourcePointCount", "earlierAvailableCount", "laterAvailableCount", "matchedEntityCount", "earlierOnlyCount", "laterOnlyCount", "missingPairCount", "earlierAvailableCompactPointCount", "laterAvailableCompactPointCount", "earlierAvailableSourcePointCount", "laterAvailableSourcePointCount", "matchedCompactPointCount", "matchedSourcePointCount", "completeBlockCount", "completeBlockCompactPointCount", "completeBlockSourcePointCount", "missingAnySelectedPeriodCount"];
function rankAggregate(envelope: OpenEnaTrajectoryInferenceResultV3) {
  const i = envelope.inference, ledger = i.ledger;
  const frame = envelope.context.frameIndexHorizons;
  const r = envelope.context.request;
  const index = (h: unknown) => frame.findIndex(f => canonicalJsonV3(f) === canonicalJsonV3(h));
  const selectedPeriodGlobalIndexes = r.kind === "trajectory-independent-period" ? [index(r.period)] : r.kind === "trajectory-paired-periods" ? [index(r.earlierPeriod), index(r.laterPeriod)] : r.periods.map(index);
  return { kind: i.kind, status: i.status, reason: i.reason, method: i.method, coordinateSystem: i.coordinateSystem, scientificContextSha256: envelope.scientificContextSha256,
    selectedPeriodGlobalIndexes, followupPeriodIndexNamespace: "selected-request", pairedAndLedgerPeriodIndexNamespace: "global-frame",
    axes: [...envelope.controls.axes], identityConfirmed: envelope.controls.identityConfirmed,
    families: i.families.map(f => pick(f, ["role", "familyId", "familySizePlanned", "memberIds"])), warnings: [...i.warnings],
    ledger: ledger === null ? null : { ...pick(ledger, ledgerFields), ...("availableByPeriod" in ledger ? { availableByPeriod: ledger.availableByPeriod.map(p => pick(p, ["periodIndex", "availableEntityCount", "availableCompactPointCount", "availableSourcePointCount"])) } : {}), ...("axes" in ledger ? { axes: ledger.axes.map(a => pick(a, ["axisIndex", "zeroDifferenceCount", "nonzeroDifferenceCount", "rankedCount"])) } : {}) },
    rows: "rows" in i ? i.rows.map(row => pick(row, rowFields)) : [], omnibusRows: "omnibusRows" in i ? i.omnibusRows.map(row => pick(row, rowFields)) : [], followupRows: "followupRows" in i ? i.followupRows.map(row => pick(row, rowFields)) : [],
  };
}
function pathAggregate(path: OpenEnaTrajectoryPathInferenceResultV3) {
  const i = path.inference;
  const periodFields = ["index", "selectedCentroidA", "selectedCentroidB", "selectedDifference", "fullCentroidA", "fullCentroidB", "fullDifference", "selectedCentroidSeparation", "fullCentroidSeparation", "selectedStepDistanceA", "selectedStepDistanceB", "selectedStepDistanceDifference", "selectedCumulativeDistanceA", "selectedCumulativeDistanceB", "selectedCumulativeDistanceDifference", "fullStepDistanceA", "fullStepDistanceB", "fullStepDistanceDifference", "fullCumulativeDistanceA", "fullCumulativeDistanceB", "fullCumulativeDistanceDifference", "nAUsed", "nBUsed", "nMatched"];
  return { kind: "path-comparison", design: i.design, direction: i.direction, repetitions: path.controls.repetitions, seed: path.controls.seed, cohortPolicy: path.controls.cohortPolicy,
    identityConfirmed: path.controls.identityConfirmed, independentGroupsConfirmed: path.controls.independentGroupsConfirmed,
    axes: [...path.controls.axes], fullDimensions: [...path.context.dimensions], cohort: path.cohort,
    scientificContextSha256: path.scientificContextSha256, permutationPlanSha256: path.permutationPlanSha256,
    periods: i.periods.map(p => pick(p, periodFields)), tests: i.tests.map(t => pick(t, ["id", "timeIndex", "metric", "distanceSpace", "tail", "observed", "pValue", "holmAdjustedPValue", "permutationCount"])),
    diagnostics: i.diagnostics.map(d => ({ code: d.code, severity: d.severity })),
    distanceSemantics: { selected: "euclidean-selected-three-dimensions", full: "euclidean-complete-retained-basis", fullCoordinates: "admitted-centered-projection-inputs-times-unchanged-fitted-rotation" },
  };
}
async function hashBytes(bytes: Uint8Array): Promise<string> { const copy = new Uint8Array(bytes); const digest = await globalThis.crypto.subtle.digest("SHA-256", copy); return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join(""); }
function json(value: unknown): string { if (canonicalJsonByteLengthV3(value) > MAX_FILE_BYTES) throw new TypeError("Native export file byte budget exceeded"); return canonicalJsonV3(value) + "\n"; }
function csvCell(value: unknown) { if (value === null || value === undefined) return ""; let text = String(value); if (/^[=+\-@\t\r]/u.test(text) && typeof value !== "number") text = `'${text}`; return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function inferenceCsv(path: OpenEnaTrajectoryPathInferenceResultV3, ranks: ReturnType<typeof rankAggregate>[]) {
  const columns = ["family", "test", "axis", "periodIndex", "earlierPeriodIndex", "laterPeriodIndex", "periodIndexNamespace", "direction", "distanceSpace", "observed", "pRaw", "pHolm", "permutationCount", "status"];
  const rows: unknown[][] = path.inference.tests.map(t => ["path-comparison", t.metric, null, t.timeIndex, null, null, "selected-request", "B-minus-A", t.distanceSpace, t.observed, t.pValue, t.holmAdjustedPValue, t.permutationCount, "available"]);
  for (const rank of ranks) for (const [entries, namespace] of [[rank.rows, "global-frame"], [rank.omnibusRows, "selected-request"], [rank.followupRows, "selected-request"]] as const) for (const row of entries) rows.push([rank.kind, row.test, row.axis, null, row.earlierPeriodIndex, row.laterPeriodIndex, namespace, row.effectDirection, null, row.uPrimary ?? row.t ?? row.q ?? null, row.pRaw, row.pHolm, null, row.status]);
  return [columns, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
/** Small browser-safe stored ZIP32 encoder. No compression, file-system access,
 * dependency, dynamic code or opaque archive payload; fixed DOS epoch 1980-01-01.
 * Every allocation is bounded before construction; tests use an independent decoder. */
function storedZip(files: readonly { filename: string; data: Uint8Array }[]) {
  const names = files.map(f => encoder.encode(f.filename));
  const total = files.reduce((n, f, i) => n + 30 + names[i].length + f.data.length + 46 + names[i].length, 22);
  if (files.length > 16 || total > MAX_TOTAL_BYTES || files.some(f => f.data.length > MAX_FILE_BYTES || !/^[a-z0-9.-]+$/u.test(f.filename))) throw new TypeError("Native ZIP resource/path budget exceeded");
  const bytes = new Uint8Array(total), view = new DataView(bytes.buffer), table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; table[i] = c; }
  const crc = (data: Uint8Array) => { let c = 0xffffffff; for (const b of data) c = table[(c ^ b) & 255] ^ c >>> 8; return (c ^ 0xffffffff) >>> 0; };
  let offset = 0; const offsets: number[] = [], checksums = files.map(f => crc(f.data));
  const u16 = (o: number, n: number) => view.setUint16(o, n, true), u32 = (o: number, n: number) => view.setUint32(o, n, true);
  files.forEach((f, i) => { offsets.push(offset); u32(offset, 0x04034b50); u16(offset + 4, 20); u16(offset + 6, 0x800); u16(offset + 12, 33); u32(offset + 14, checksums[i]); u32(offset + 18, f.data.length); u32(offset + 22, f.data.length); u16(offset + 26, names[i].length); bytes.set(names[i], offset + 30); bytes.set(f.data, offset + 30 + names[i].length); offset += 30 + names[i].length + f.data.length; });
  const centralOffset = offset;
  files.forEach((f, i) => { u32(offset, 0x02014b50); u16(offset + 4, 20); u16(offset + 6, 20); u16(offset + 8, 0x800); u16(offset + 14, 33); u32(offset + 16, checksums[i]); u32(offset + 20, f.data.length); u32(offset + 24, f.data.length); u16(offset + 28, names[i].length); u32(offset + 42, offsets[i]); bytes.set(names[i], offset + 46); offset += 46 + names[i].length; });
  u32(offset, 0x06054b50); u16(offset + 8, files.length); u16(offset + 10, files.length); u32(offset + 12, offset - centralOffset); u32(offset + 16, centralOffset);
  return bytes;
}
const exportReceipts = new WeakMap<object, { selection: string; sha256: string }>();
function selection(a: Awaited<ReturnType<typeof admit>>) { return canonicalJsonV3({ path: a.path.scientificContextSha256, ranks: a.ranks.map(r => r.scientificContextSha256), binding: a.path.binding, participants: a.participants }); }
export async function buildOpenEnaTrajectoryExportV3(result: unknown, independentPlan: unknown, options: OpenEnaTrajectoryExportOptionsV3) {
  const admitted = await admit(result, independentPlan, options), { path, ranks, participants } = admitted, p = path.result.executionProvenance;
  const aggregateRanks = ranks.map(rankAggregate), aggregatePath = pathAggregate(path);
  const common = { schemaVersion: 3, executable: false, binding: path.binding };
  const analysis = { ...common, kind: "open-ena-native-trajectory-analysis", projection: { authority: path.provenance.projectionAuthority, varianceMeaning: path.provenance.varianceMeaning, fullAxes: [...p.projection.fullAxes], targetVariance: [...p.projection.variance], targetRank: p.projection.rank, sourceFitRank: p.populations.sourceFit?.rank ?? null, sourceFitVariance: p.populations.sourceFit?.variance ?? null }, pathComparison: aggregatePath, ranks: aggregateRanks,
    meaning: "Aggregate post-model statistics only. Unit identities, fitted participant traces, source records and source metadata are omitted. Native statistics remain outside the unchanged model-bundle statistics grammar. Imported files grant no live computation authority." };
  const plot = { ...common, kind: "open-ena-native-trajectory-plot-specification", purpose: "aggregate-path-comparison-complete-cohort", cohortPolicy: path.controls.cohortPolicy, cohort: path.cohort, axes: [...path.controls.axes], coordinateSystem: "unflipped-model-coordinates", nodes: path.result.set.rotation.nodes!.map((node, codeIndex) => ({ codeIndex, coordinates: path.controls.axes.map(axis => node[axis]) })), centroidPaths: path.inference.periods.map(period => ({ periodIndex: period.index, primary: period.selectedCentroidA, secondary: period.selectedCentroidB, nPrimary: period.nAUsed, nSecondary: period.nBUsed })), glyph: { symbol: "square", size: 7 }, connectors: { color: "black", direction: "fitted-request-order", arrows: true }, meanNetworkEdges: [], uncertaintyGeometry: [], participantTracesIncluded: false };
  const drafts = [{ filename: "analysis.json", mimeType: "application/json", contents: json(analysis) }, { filename: "plot-specification.json", mimeType: "application/json", contents: json(plot) }, { filename: "trajectory-inference.csv", mimeType: "text/csv", contents: inferenceCsv(path, aggregateRanks) }];
  if (participants) {
    // Consent adds one explicitly marked file; aggregate artifacts stay byte-identical.
    const view = buildLongitudinalViewV3(path.result);
    drafts.push({ filename: "participants.json", mimeType: "application/json", contents: json({ ...common, kind: "open-ena-native-trajectory-participants", disclosure: "participant-opt-in", axes: [...path.controls.axes], entities: view.entities.map(e => ({ identity: e.identity, group: e.group?.identity ?? null, steps: e.steps.map(s => ({ horizon: s.horizon.identity, trajectoryOrdinal: s.trajectoryOrdinal, coordinates: path.controls.axes.map(axis => s.point[axis]) })) })) }) });
  }
  let total = 0;
  const files = [];
  for (const d of drafts) { const data = encoder.encode(d.contents); total += data.byteLength; if (data.byteLength > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES) throw new TypeError("Native export byte budget exceeded"); files.push({ ...d, byteLength: data.byteLength, sha256: await hashBytes(data) }); }
  const manifest = deepFreezeV3({ ...common, kind: "open-ena-native-trajectory-export-manifest", disclosure: participants ? "participant-opt-in" as const : "aggregate" as const, requestFamilies: [...ranks.map(r => r.inference.kind), "path-comparison"], files: files.map(f => ({ filename: f.filename, mimeType: f.mimeType, byteLength: f.byteLength, sha256: f.sha256 })), integrityMeaning: "Each listed standalone file is bound by SHA-256. The archive hash covers manifest and ZIP records; this manifest does not self-hash." });
  const manifestContents = json(manifest), manifestData = encoder.encode(manifestContents);
  files.push({ filename: "manifest.json", mimeType: "application/json", contents: manifestContents, byteLength: manifestData.byteLength, sha256: await hashBytes(manifestData) });
  const bytes = storedZip(files.map(f => ({ filename: f.filename, data: encoder.encode(f.contents) }))), sha256 = await hashBytes(bytes);
  const envelope = Object.freeze({ schemaVersion: 3 as const, kind: "open-ena-native-trajectory-export" as const, filename: "open-ena-native-trajectory.zip", mimeType: "application/zip", bytes, sha256, manifest, files: deepFreezeV3(files) });
  exportReceipts.set(envelope, { selection: selection(admitted), sha256 });
  return envelope;
}
export type OpenEnaTrajectoryExportV3 = Awaited<ReturnType<typeof buildOpenEnaTrajectoryExportV3>>;
/** Recheck against the caller's CURRENT selection before adopting/downloading an
 * async export. The mutable Uint8Array is hashed again; clones have no receipt. */
export async function assertOpenEnaTrajectoryExportConsumerV3(value: unknown, result: unknown, independentPlan: unknown, options: OpenEnaTrajectoryExportOptionsV3): Promise<OpenEnaTrajectoryExportV3> {
  const receipt = value !== null && typeof value === "object" ? exportReceipts.get(value) : undefined;
  if (!receipt) throw new TypeError("Native trajectory export consumer authority mismatch");
  const admitted = await admit(result, independentPlan, options);
  if (selection(admitted) !== receipt.selection) throw new TypeError("Native export current selection/context mismatch");
  const envelope = value as OpenEnaTrajectoryExportV3;
  const capturedBytes = new Uint8Array(envelope.bytes);
  if (await hashBytes(capturedBytes) !== receipt.sha256 || envelope.bytes.length !== capturedBytes.length || envelope.bytes.some((byte, index) => byte !== capturedBytes[index])) throw new TypeError("Native ZIP integrity mismatch");
  return envelope;
}
