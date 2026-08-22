import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_YU_ONA_GOLDEN_PATH,
  DEFAULT_YU_ONA_WORKBOOK_PATH,
  verifyOpenEnaOnaYuGolden,
} from "../scripts/verify-open-ena-ona-yu-golden";

const externalGoldenAvailable = existsSync(DEFAULT_YU_ONA_WORKBOOK_PATH)
  && existsSync(DEFAULT_YU_ONA_GOLDEN_PATH);

test("Open ENA reproduces the external Yu within-student ONA gold standard exactly", {
  skip: externalGoldenAvailable
    ? false
    : "The private/local Yu workbook and R-derived golden CSV are not committed fixtures.",
}, async () => {
  const verification = await verifyOpenEnaOnaYuGolden();

  assert.deepEqual(verification, {
    schemaVersion: 1,
    privacy: {
      sourceFilesCommitted: false,
      sourceRowsReturned: false,
      unitIdentifiersReturned: false,
      aggregateSummaryOnly: true,
    },
    inputs: {
      workbookSha256: "f2132f8dc3e147609169472594a2031130be23eab4a2ac0fb9adcb6d9d667042",
      goldenSha256: "b4c0a6921ece7df51d846b3864e239747062da304a212aa0e2402d4a85074253",
    },
    contract: {
      analysisKind: "ona",
      networkType: "ordered",
      unitColumns: ["Group", "Name"],
      horizonColumns: ["Group", "Name"],
      orderColumns: ["Lesson"],
      orderComparators: { Lesson: "string" },
      lessonRuntimeType: "string",
      lessonDistinctValueCount: 2,
      maximumRowsPerHorizon: 2,
      window: "MovingStanzaWindow",
      windowSizeBack: 2,
      windowSizeForward: 0,
      effectivePreviousRows: 1,
      weightBy: "sum",
      rotation: "svd",
    },
    result: {
      sourceRows: 174,
      units: 87,
      codes: ["EC", "ICT", "MCO", "NI", "SR", "SC", "ATT"],
      directedDimensions: 49,
      goldenConnectionTotal: 811,
      openEnaConnectionTotal: 811,
      goldenZeroNetworks: 3,
      openEnaZeroNetworks: 3,
      mismatchedCells: 0,
      maximumAbsoluteDifference: 0,
    },
  });
});
