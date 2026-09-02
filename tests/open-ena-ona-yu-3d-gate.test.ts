import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const candidatePath = "/Users/dongpinhu/Desktop/Yu_ena_coded_data_0712.xlsx";
const reviewedPath = "/Volumes/Starship/ENA的衍生文件/ONA/Yu_ena_coded_data_0712.xlsx";
const goldenPath = "/Volumes/Starship/ENA的衍生文件/ONA/ona_output/yu_within_student/ona_connection_counts.csv";
const gateAvailable = [candidatePath, reviewedPath, goldenPath].every(existsSync);

test("Yu exact 3D gate preserves the verified ordered result and returns aggregate-only evidence", {
  skip: gateAvailable ? false : "Private Yu exact-gate inputs are not available on this host.",
}, async () => {
  assert.equal(
    existsSync(new URL("../scripts/verify-open-ena-ona-yu-3d-gate.ts", import.meta.url)),
    true,
    "the Yu 3D exact gate is missing",
  );
  const { verifyOpenEnaOnaYu3dGate } = await import("../scripts/verify-open-ena-ona-yu-3d-gate");
  const receipt = await verifyOpenEnaOnaYu3dGate({
    candidateWorkbookPath: candidatePath,
    reviewedWorkbookPath: reviewedPath,
    goldenPath,
  });

  assert.equal(receipt.privacy.aggregateSummaryOnly, true);
  assert.equal(receipt.privacy.sourceRowsReturned, false);
  assert.equal(receipt.privacy.unitIdentifiersReturned, false);
  assert.deepEqual(receipt.inputs, {
    candidateCanonicalWorksheetSha256: "1bebd33de14571e13c029ba6803f59906394b01ae1d1bdca41c78444fe2ad5ec",
    reviewedCanonicalWorksheetSha256: "1bebd33de14571e13c029ba6803f59906394b01ae1d1bdca41c78444fe2ad5ec",
    reviewedWorkbookSha256: "f2132f8dc3e147609169472594a2031130be23eab4a2ac0fb9adcb6d9d667042",
    goldenSha256: "b4c0a6921ece7df51d846b3864e239747062da304a212aa0e2402d4a85074253",
  });
  assert.deepEqual(receipt.result, {
    sourceRows: 174,
    units: 87,
    codes: 7,
    directedDimensions: 49,
    goldenConnectionTotal: 811,
    openEnaConnectionTotal: 811,
    goldenZeroNetworks: 3,
    openEnaZeroNetworks: 3,
    mismatchedCells: 0,
    maximumAbsoluteDifference: 0,
  });
  assert.match(receipt.identity.resultSha256, /^[0-9a-f]{64}$/u);
  assert.match(receipt.identity.connectionCountsSha256, /^[0-9a-f]{64}$/u);
  assert.match(receipt.identity.orderedAuditSha256, /^[0-9a-f]{64}$/u);
  assert.equal(receipt.identity.compilerMutationFree, true);
  assert.equal(receipt.identity.displayVariantsMutationFree, true);
  assert.deepEqual(receipt.display, {
    overallCodeNodes: 7,
    primaryCodeNodes: 7,
    secondaryCodeNodes: 7,
    overallBaseUnitMarkersAreCircles: true,
    directedTraceLimitSatisfied: true,
    sameCompletedResultConsumed: true,
  });
});
