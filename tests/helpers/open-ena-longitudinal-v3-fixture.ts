import type { LongitudinalExecutionRequestV2 } from "j-3dena";

import { analyzeDataset, bindOpenEnaResultProvenance } from "../../lib/open-ena/analyze";
import {
  buildOpenEnaLongitudinalExecutionRequestV3,
  createOpenEnaLongitudinalSettingsV3,
} from "../../lib/open-ena/longitudinal-v3";
import type { OpenEnaConfig, ParsedDataset } from "../../lib/open-ena/types";

const DATASET_HASH = "7".repeat(64);

const dataset: ParsedDataset = {
  name: "longitudinal-client-fixture.csv",
  headers: ["Group", "Speaker", "Period", "A", "B", "C", "D"],
  rows: [
    { Group: "A", Speaker: "a1", Period: 1, A: 1, B: 1, C: 0, D: 0 },
    { Group: "A", Speaker: "a1", Period: 2, A: 0, B: 1, C: 1, D: 0 },
    { Group: "A", Speaker: "a1", Period: 3, A: 0, B: 0, C: 1, D: 1 },
    { Group: "B", Speaker: "b1", Period: 1, A: 1, B: 0, C: 1, D: 1 },
    { Group: "B", Speaker: "b1", Period: 2, A: 1, B: 1, C: 0, D: 1 },
    { Group: "B", Speaker: "b1", Period: 3, A: 0, B: 1, C: 0, D: 1 },
  ],
  sizeBytes: 512,
  source: "upload",
  hashKind: "normalized-utf8-csv-text-sha256",
};

const config: OpenEnaConfig = {
  analysisKind: "ena",
  unitColumns: ["Group", "Speaker"],
  conversationColumns: ["Group", "Speaker", "Period"],
  groupColumn: "Group",
  codes: ["A", "B", "C", "D"],
  model: "SeparateTrajectory",
  window: "Conversation",
  windowSizeBack: 5,
  windowSizeForward: 0,
  weightBy: "binary",
  rotation: "svd",
  referenceRotationId: null,
  centerAlignToOrigin: true,
};

export async function validOpenEnaLongitudinalRequestV3(
  receiptRows = 20,
  repetitions = 500,
): Promise<LongitudinalExecutionRequestV2> {
  const result = bindOpenEnaResultProvenance(
    analyzeDataset(dataset, config),
    dataset,
    DATASET_HASH,
    config,
  );
  const settings = await createOpenEnaLongitudinalSettingsV3({
    result,
    config,
    dataset,
    datasetHash: DATASET_HASH,
  });
  settings.inference.independentPeriod = null;
  settings.inference.pairedPeriods = null;
  settings.inference.repeatedPeriods = null;
  if (!settings.inference.pathComparison) throw new Error("Fixture requires two fitted groups.");
  settings.inference.pathComparison.repetitions = repetitions;
  settings.networkOverlay.enabled = false;
  const prepared = await buildOpenEnaLongitudinalExecutionRequestV3({
    result,
    config,
    dataset,
    datasetHash: DATASET_HASH,
    settings,
    runId: "open-ena-longitudinal-client-fixture",
    executionTarget: "browser-worker",
  });
  const request = structuredClone(prepared.request);
  request.dataset.receipt.rows = receiptRows;
  request.dataset.receipt.limits.maxRows = Math.max(request.dataset.receipt.limits.maxRows, receiptRows);
  request.dataset.receipt.limits.maxCells = Math.max(
    request.dataset.receipt.limits.maxCells,
    receiptRows * request.dataset.receipt.columns,
  );
  return request;
}
