import { parseCsv } from "../../lib/open-ena/csv";
import { prepareTypedCsvSourceV3 } from "../../lib/open-ena/source-preparation-v3";
import { compileOnaDraftV3 } from "../../lib/open-ena/model-v3/compiler";
import { buildOnaExecutionPlanV3 } from "../../lib/open-ena/model-v3/ona-adapter";
import type { OrderedNetworkDraftV3 } from "../../lib/open-ena/model-v3/types";

export async function onaSourceBudgetFixture(kind: "short" | "ascii-wide" | "unicode-wide" | "wide-codes" | "long-name" = "short") {
  const codes = ["A", "B", "C"].map(c => kind === "wide-codes" ? c.padEnd(256, "未") : c);
  const unused = kind.endsWith("-wide") ? Array.from({ length: 250 }, (_, i) => `unused${i}_`.padEnd(256, kind === "ascii-wide" ? "x" : "未")) : [];
  const csv = ["unit,horizon,turn," + [...codes, ...unused].join(","), ...Array.from({ length: 6 }, (_, i) => `u${i},h,${i},${i % 2 + 1},${(i + 1) % 2 + 1},${i % 3 + 1}` + unused.map(() => ",x").join(""))].join("\n");
  const parsed = parseCsv(csv, { name: "source-budget.csv", source: "upload" });
  const declarations = Object.fromEntries([["unit", "text"], ["horizon", "text"], ["turn", "number"], ...codes.map(c => [c, "number"]), ...unused.map(c => [c, "text"])]);
  const typed = await prepareTypedCsvSourceV3(csv, parsed, declarations as Parameters<typeof prepareTypedCsvSourceV3>[2], new Date("2026-10-12T00:00:00Z"));
  if (kind === "long-name") typed.dataset.name = "未".repeat(80_000) + ".xlsx";
  const draft: OrderedNetworkDraftV3 = { unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null, codes,
    backward: { kind: "finite", value: 1 }, rowOrder: { kind: "columns", keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }] },
    directionalMask: { schemaVersion: 1, codeOrder: codes, enabled: codes.map(() => codes.map(() => true)) } };
  const compiled = await compileOnaDraftV3(typed.dataset, typed.datasetSha256, draft);
  return { ...typed, csv, draft, compiled, async plan() {
    if (compiled.status !== "ready") throw new Error(compiled.diagnostics.map(d => d.id).join(","));
    return buildOnaExecutionPlanV3(typed.dataset, typed.datasetSha256, compiled.canonicalConfiguration);
  } };
}
