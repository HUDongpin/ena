#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { buildOpenEnaOrderedAudit } from "../lib/open-ena/ordered-audit";
import { compileOpenEnaOrdered3dPlotSpec } from "../lib/open-ena/ordered-plot3d";
import type { OpenEna3dTrace } from "../lib/open-ena/plot3d";
import { parseXlsx } from "../lib/open-ena/spreadsheet";
import type { OpenEnaConfig, OpenEnaResult, ParsedDataset } from "../lib/open-ena/types";
import {
  buildYuOnaConfig,
  verifyOpenEnaOnaYuGolden,
} from "./verify-open-ena-ona-yu-golden";

const EXPECTED_CANONICAL_WORKSHEET_SHA256 =
  "1bebd33de14571e13c029ba6803f59906394b01ae1d1bdca41c78444fe2ad5ec";
const EXPECTED_REVIEWED_WORKBOOK_SHA256 =
  "f2132f8dc3e147609169472594a2031130be23eab4a2ac0fb9adcb6d9d667042";
const EXPECTED_GOLDEN_SHA256 =
  "b4c0a6921ece7df51d846b3864e239747062da304a212aa0e2402d4a85074253";

export interface YuOna3dGateOptions {
  candidateWorkbookPath: string;
  reviewedWorkbookPath: string;
  goldenPath: string;
}

export interface YuOna3dGateReceipt {
  schemaVersion: 1;
  privacy: {
    aggregateSummaryOnly: true;
    sourceRowsReturned: false;
    unitIdentifiersReturned: false;
  };
  inputs: {
    candidateCanonicalWorksheetSha256: string;
    reviewedCanonicalWorksheetSha256: string;
    reviewedWorkbookSha256: string;
    goldenSha256: string;
  };
  result: {
    sourceRows: number;
    units: number;
    codes: number;
    directedDimensions: number;
    goldenConnectionTotal: number;
    openEnaConnectionTotal: number;
    goldenZeroNetworks: number;
    openEnaZeroNetworks: number;
    mismatchedCells: number;
    maximumAbsoluteDifference: number;
  };
  identity: {
    resultSha256: string;
    connectionCountsSha256: string;
    orderedAuditSha256: string;
    compilerMutationFree: true;
    displayVariantsMutationFree: true;
  };
  display: {
    overallCodeNodes: number;
    primaryCodeNodes: number;
    secondaryCodeNodes: number;
    overallBaseUnitMarkersAreCircles: boolean;
    directedTraceLimitSatisfied: boolean;
    sameCompletedResultConsumed: true;
  };
}

function requireGate(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function arrayBuffer(bytes: Buffer) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function parseWorkbook(bytes: Buffer, name: string) {
  return await parseXlsx(arrayBuffer(bytes), {
    name,
    sizeBytes: bytes.byteLength,
    source: "upload",
  });
}

function resultHashes(result: OpenEnaResult) {
  requireGate(result.orderedAudit, "Yu 3D gate requires the de-identified ordered audit.");
  return {
    resultSha256: sha256(JSON.stringify(result)),
    connectionCountsSha256: sha256(JSON.stringify(result.set.connectionCounts)),
    orderedAuditSha256: sha256(JSON.stringify(result.orderedAudit)),
  };
}

function codeNodeCount(traces: readonly OpenEna3dTrace[]) {
  return traces.find((trace) => trace.meta.role === "code-node")?.x.length ?? 0;
}

function directedTraceCount(traces: readonly OpenEna3dTrace[]) {
  const directedRoles = new Set([
    "ordered-edge-shaft",
    "ordered-edge-arrowhead",
    "ordered-self-loop-shaft",
    "ordered-self-loop-arrowhead",
  ]);
  return traces.filter((trace) => directedRoles.has(trace.meta.role)).length;
}

function compilerInput(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  dataset: ParsedDataset,
  scope: { kind: "overall" } | { kind: "group"; name: string },
  presentationRole?: "primary" | "secondary",
) {
  const [xDimension, yDimension, zDimension] = result.dimensions;
  requireGate(xDimension && yDimension && zDimension, "Yu 3D gate requires three fitted dimensions.");
  return {
    result,
    config,
    scope,
    presentationRole,
    xDimension,
    yDimension,
    zDimension,
    camera: "isometric" as const,
    showPoints: scope.kind === "overall",
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    nodeTotals: result.orderedResponseNodeSummary,
    compact: scope.kind === "group",
    // The dataset is deliberately not passed to the compiler. Referencing its
    // row count here makes that privacy boundary explicit without returning rows.
    sourceRowCountForGateOnly: dataset.rows.length,
  };
}

export async function verifyOpenEnaOnaYu3dGate(
  options: YuOna3dGateOptions,
): Promise<YuOna3dGateReceipt> {
  const [candidateBytes, reviewedBytes, goldenBytes] = await Promise.all([
    readFile(options.candidateWorkbookPath),
    readFile(options.reviewedWorkbookPath),
    readFile(options.goldenPath),
  ]);
  const reviewedWorkbookSha256 = sha256(reviewedBytes);
  const goldenSha256 = sha256(goldenBytes);
  requireGate(
    reviewedWorkbookSha256 === EXPECTED_REVIEWED_WORKBOOK_SHA256,
    "Yu reviewed workbook byte SHA-256 failed the hard gate.",
  );
  requireGate(goldenSha256 === EXPECTED_GOLDEN_SHA256, "Yu golden CSV SHA-256 failed the hard gate.");

  const [candidate, reviewed] = await Promise.all([
    parseWorkbook(candidateBytes, "Yu_ena_coded_data_0712.xlsx"),
    parseWorkbook(reviewedBytes, "Yu_ena_coded_data_0712.xlsx"),
  ]);
  const candidateCanonicalWorksheetSha256 = sha256(candidate.normalizedText);
  const reviewedCanonicalWorksheetSha256 = sha256(reviewed.normalizedText);
  requireGate(
    candidateCanonicalWorksheetSha256 === EXPECTED_CANONICAL_WORKSHEET_SHA256
      && reviewedCanonicalWorksheetSha256 === EXPECTED_CANONICAL_WORKSHEET_SHA256
      && candidate.normalizedText === reviewed.normalizedText,
    "Yu candidate and reviewed canonical first worksheets failed the hard gate.",
  );

  const exact = await verifyOpenEnaOnaYuGolden({
    workbookPath: options.reviewedWorkbookPath,
    goldenPath: options.goldenPath,
  });
  const config = buildYuOnaConfig();
  const analyzed = analyzeDataset(candidate.dataset, config);
  const orderedAudit = buildOpenEnaOrderedAudit(analyzed.set);
  requireGate(orderedAudit, "Yu result did not produce the ordered audit required by Data View.");
  const result: OpenEnaResult = { ...analyzed, orderedAudit };
  requireGate(result.groups[0] && result.groups[1], "Yu 3D gate requires its two completed groups.");
  const before = resultHashes(result);

  const overall = compileOpenEnaOrdered3dPlotSpec(compilerInput(
    result,
    config,
    candidate.dataset,
    { kind: "overall" },
  ));
  const primary = compileOpenEnaOrdered3dPlotSpec(compilerInput(
    result,
    config,
    candidate.dataset,
    { kind: "group", name: result.groups[0].name },
    "primary",
  ));
  const secondary = compileOpenEnaOrdered3dPlotSpec(compilerInput(
    result,
    config,
    candidate.dataset,
    { kind: "group", name: result.groups[1].name },
    "secondary",
  ));
  const afterPrimaryCompilers = resultHashes(result);
  requireGate(
    JSON.stringify(afterPrimaryCompilers) === JSON.stringify(before),
    "Yu 3D compilers mutated result, connection counts, or ordered audit.",
  );

  const [xDimension, yDimension, zDimension] = result.dimensions;
  requireGate(xDimension && yDimension && zDimension, "Yu display variants require three fitted dimensions.");
  compileOpenEnaOrdered3dPlotSpec({
    ...compilerInput(result, config, candidate.dataset, { kind: "overall" }),
    xDimension: zDimension,
    yDimension: xDimension,
    zDimension: yDimension,
    camera: "xy",
    edgeScale: 1.7,
    edgeThreshold: 0.35,
    pointScale: 1.4,
    plotZoom: 1.3,
    flipX: true,
    flipY: true,
  });
  const afterDisplayVariants = resultHashes(result);
  requireGate(
    JSON.stringify(afterDisplayVariants) === JSON.stringify(before),
    "Yu 3D threshold, camera, axes, or point display changed scientific identity.",
  );

  const overallBaseUnitMarkers = overall.data.filter((trace) => trace.meta.role === "unit-points");
  const directedTraceLimitSatisfied = [overall, primary, secondary]
    .every((spec) => directedTraceCount(spec.data) <= 32);
  requireGate(directedTraceLimitSatisfied, "Yu 3D directed trace budget exceeded 32.");

  return {
    schemaVersion: 1,
    privacy: {
      aggregateSummaryOnly: true,
      sourceRowsReturned: false,
      unitIdentifiersReturned: false,
    },
    inputs: {
      candidateCanonicalWorksheetSha256,
      reviewedCanonicalWorksheetSha256,
      reviewedWorkbookSha256,
      goldenSha256,
    },
    result: {
      sourceRows: exact.result.sourceRows,
      units: exact.result.units,
      codes: exact.result.codes.length,
      directedDimensions: exact.result.directedDimensions,
      goldenConnectionTotal: exact.result.goldenConnectionTotal,
      openEnaConnectionTotal: exact.result.openEnaConnectionTotal,
      goldenZeroNetworks: exact.result.goldenZeroNetworks,
      openEnaZeroNetworks: exact.result.openEnaZeroNetworks,
      mismatchedCells: exact.result.mismatchedCells,
      maximumAbsoluteDifference: exact.result.maximumAbsoluteDifference,
    },
    identity: {
      ...before,
      compilerMutationFree: true,
      displayVariantsMutationFree: true,
    },
    display: {
      overallCodeNodes: codeNodeCount(overall.data),
      primaryCodeNodes: codeNodeCount(primary.data),
      secondaryCodeNodes: codeNodeCount(secondary.data),
      overallBaseUnitMarkersAreCircles: overallBaseUnitMarkers.length === result.groups.length
        && overallBaseUnitMarkers.every((trace) => trace.marker?.symbol === "circle"),
      directedTraceLimitSatisfied,
      sameCompletedResultConsumed: true,
    },
  };
}

function cliOptions(argv: readonly string[]): YuOna3dGateOptions | "help" {
  if (argv.includes("--help") || argv.includes("-h")) return "help";
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value || !["--candidate", "--reviewed", "--golden"].includes(key)) {
      throw new Error("Use --candidate, --reviewed, and --golden with local paths.");
    }
    values.set(key, value);
  }
  const candidateWorkbookPath = values.get("--candidate");
  const reviewedWorkbookPath = values.get("--reviewed");
  const goldenPath = values.get("--golden");
  if (!candidateWorkbookPath || !reviewedWorkbookPath || !goldenPath) {
    throw new Error("Yu 3D gate requires --candidate, --reviewed, and --golden.");
  }
  return { candidateWorkbookPath, reviewedWorkbookPath, goldenPath };
}

async function main() {
  const options = cliOptions(process.argv.slice(2));
  if (options === "help") {
    process.stdout.write("Usage: tsx scripts/verify-open-ena-ona-yu-3d-gate.ts --candidate <xlsx> --reviewed <xlsx> --golden <csv>\n");
    return;
  }
  process.stdout.write(JSON.stringify(await verifyOpenEnaOnaYu3dGate(options), null, 2) + "\n");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    process.stderr.write(`Yu ONA 3D hard gate failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}
