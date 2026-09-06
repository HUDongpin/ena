import { buildContrastV3 } from "./contrasts";
import type { OpenEnaEndpointControlsV3 } from "./inference-consumers-v3";
import { rowsToCsv } from "./export";

/** Native descriptive contrast export is separate from an immutable model bundle
 * and from the independently requested native inference. No V2 receipt is made. */
export async function exportContrastV3(result: unknown, currentPlan: unknown, controls: OpenEnaEndpointControlsV3) {
  const value = await buildContrastV3(result, currentPlan, controls);
  const source = new Map(value.result.executionProvenance.labels.codes.map((code) => [code.column, code.sourceColumn]));
  const edges = value.edges.map((edge) => ({ source: source.get(edge.source)!, target: source.get(edge.target)!,
    primaryWeight: edge.primaryWeight, secondaryWeight: edge.secondaryWeight, signedDifference: edge.signedDifference }));
  const artifact = { schemaVersion: 3, kind: "open-ena-native-endpoint-contrast", executable: false,
    binding: value.binding, configuration: value.configuration, controls: value.controls, provenance: value.provenance,
    primary: value.primary, secondary: value.secondary, geometry: value.geometry, edges, boundaries: value.boundaries,
    meaning: "Full bound Group populations on the selected supported axes. Display hiding does not redefine the exported scientific population. No inference is attached and imported bytes confer no native producer or Reference authority." };
  return { filename: "native-endpoint-contrast.json", contents: JSON.stringify(artifact, null, 2), edgesCsv: rowsToCsv(edges) };
}
