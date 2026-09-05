import type { BoundResultV3, PresentationArtifactV3 } from "./model-v3/types";
import { captureBundleJsonV3 } from "./bundle-json-v3";
import { assertPresentationArtifactContractV3 } from "./bundle-contract-v3";
import { deepFreezeV3 } from "./model-v3/canonical-json";

/** Builder input Code names are canonical SOURCE columns. Artifact Code names
 * are PUBLIC aliases, as in the original v3 bundle contract. Never guess. */
export function buildPresentationArtifactV3(
  result: BoundResultV3,
  state: Omit<PresentationArtifactV3, "boundResultSha256">,
): PresentationArtifactV3 {
  const captured = captureBundleJsonV3(state) as Omit<
    PresentationArtifactV3,
    "boundResultSha256"
  >;
  const codes = new Map(
    result.executionProvenance.labels.codes.map((e) => [
      e.sourceColumn,
      e.column,
    ]),
  );
  function code(value: string) {
    const label = codes.get(value);
    if (!label)
      throw new TypeError(
        "Presentation requires canonical source Code columns",
      );
    return label;
  }
  const artifact = {
    ...captured,
    boundResultSha256: result.binding.scientificResultSha256,
    hiddenCodes: captured.hiddenCodes.map(code),
    codeColors: Object.fromEntries(
      Object.entries(captured.codeColors).map(([key, color]) => [
        code(key),
        color,
      ]),
    ),
    nodeOverrides: captured.nodeOverrides.map((node) => ({
      ...node,
      code: code(node.code),
    })),
  };
  assertPresentationArtifactContractV3(artifact, result);
  return deepFreezeV3(artifact);
}

/** This operation grants display applicability only, never current model or
 * inference authority. Mismatch preserves the complete detached preset. */
export function applyPresentationV3(
  resultHash: string,
  input: PresentationArtifactV3,
) {
  if (!/^[0-9a-f]{64}$/u.test(resultHash))
    throw new TypeError("Presentation needs an exact scientific result SHA256");
  const presentation = captureBundleJsonV3(input) as PresentationArtifactV3;
  assertPresentationArtifactContractV3(presentation);
  return deepFreezeV3({
    status:
      presentation.boundResultSha256 === resultHash
        ? ("applied" as const)
        : ("unapplied-preset" as const),
    presentation,
  });
}
