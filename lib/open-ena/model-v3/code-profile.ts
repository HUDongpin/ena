import { canonicalJsonV3 } from "./canonical-json";

export type CodeValueRepresentationV3 =
  | "binary-number"
  | "binary-boolean"
  | "frequency";

export type CodeColumnProfileV3 =
  | {
      readonly status: "valid";
      readonly representation: CodeValueRepresentationV3 | null;
      readonly positiveCount: number;
      readonly magnitudes: number[];
      readonly signature: string;
      readonly allZero: boolean;
    }
  | { readonly status: "invalid"; readonly invalidRows: number[] };

/**
 * Profiles one exact source column using the same strict value domains as the
 * Standard compiler. This is descriptive source evidence only; it does not
 * create canonical configuration, preflight, or execution authority.
 */
export function profileCodeColumnValuesV3(
  rows: readonly Record<string, unknown>[],
  code: string,
  weighting: "binary" | "frequency",
): CodeColumnProfileV3 {
  const invalidRows: number[] = [];
  const magnitudes: number[] = [];
  const typedValues: Array<{
    type: "number" | "boolean";
    value: number | boolean;
  }> = [];
  const binaryKinds = new Set<"number" | "boolean">();
  const numericRows: number[] = [];
  const booleanRows: number[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const descriptor = Object.getOwnPropertyDescriptor(row, code);
    if (descriptor === undefined || !("value" in descriptor)) {
      invalidRows.push(rowIndex);
      continue;
    }
    const value = descriptor.value;
    if (weighting === "binary") {
      if (typeof value === "number" && (value === 0 || value === 1)) {
        const normalized = Object.is(value, -0) ? 0 : value;
        binaryKinds.add("number");
        numericRows.push(rowIndex);
        magnitudes.push(normalized);
        typedValues.push({ type: "number", value: normalized });
      } else if (typeof value === "boolean") {
        binaryKinds.add("boolean");
        booleanRows.push(rowIndex);
        magnitudes.push(value ? 1 : 0);
        typedValues.push({ type: "boolean", value });
      } else {
        invalidRows.push(rowIndex);
      }
    } else if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0
    ) {
      const normalized = Object.is(value, -0) ? 0 : value;
      magnitudes.push(normalized);
      typedValues.push({ type: "number", value: normalized });
    } else {
      invalidRows.push(rowIndex);
    }
  }

  if (weighting === "binary" && binaryKinds.size > 1) {
    invalidRows.push(...numericRows, ...booleanRows);
  }
  if (invalidRows.length > 0) {
    return {
      status: "invalid",
      invalidRows: [...new Set(invalidRows)].sort(
        (left, right) => left - right,
      ),
    };
  }

  const representation =
    weighting === "frequency"
      ? ("frequency" as const)
      : binaryKinds.has("boolean")
        ? ("binary-boolean" as const)
        : binaryKinds.has("number")
          ? ("binary-number" as const)
          : null;
  return {
    status: "valid",
    representation,
    positiveCount: magnitudes.filter((value) => value > 0).length,
    magnitudes,
    signature: canonicalJsonV3(typedValues),
    allZero: magnitudes.length > 0 && magnitudes.every((value) => value === 0),
  };
}
