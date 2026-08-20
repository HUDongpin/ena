import type { AdjacencyKeyEntry, RotationSet, Row } from "jena-js";
import type {
  DatasetHashKind,
  OpenEnaConfig,
  OpenEnaManifest,
  OpenEnaReferenceFit,
  OpenEnaReferenceCompatibility,
  OpenEnaResult,
  OpenEnaRotationReference,
  ParsedDataset,
} from "./types";
import { datasetHashKindFor, JENA_RUNTIME_VERSION } from "./types";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
  if (value.length > 1_024) throw new Error(`${label} must be 1,024 characters or fewer.`);
  return value;
}

function asSha256(value: unknown, label: string) {
  if (value === null) return null;
  const hash = asString(value, label);
  if (!/^[0-9a-f]{64}$/i.test(hash)) throw new Error(`${label} must be a 64-character SHA-256 value or null.`);
  return hash.toLowerCase();
}

function asDatasetHashKind(value: unknown): DatasetHashKind | undefined {
  if (value === undefined) return undefined;
  if (value === "normalized-utf8-text-sha256"
    || value === "normalized-utf8-csv-text-sha256"
    || value === "canonical-first-xlsx-worksheet-v1-sha256") return value;
  throw new Error("Reference dataset hash kind is not supported.");
}

function asIsoTimestamp(value: unknown, label: string) {
  const timestamp = asString(value, label);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== timestamp) {
    throw new Error(`${label} must be a canonical ISO timestamp.`);
  }
  return timestamp;
}

function asFiniteNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must contain finite numbers.`);
  return value;
}

function asStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return [...value] as string[];
}

function parseCanonicalNodes(value: unknown, codes: string[], displayedDimensions: string[]): Row[] {
  if (!Array.isArray(value) || value.some((row) => !isRecord(row)) || value.length !== codes.length) {
    throw new Error("Reference nodes must contain one ordered row per code.");
  }
  const allowedKeys = new Set(["code", ...displayedDimensions]);
  return value.map((row, rowIndex) => {
    const record = row as JsonRecord;
    if (record.code !== codes[rowIndex]) {
      throw new Error("Reference nodes must contain one ordered row per code.");
    }
    const keys = Object.keys(record);
    if (keys.length !== allowedKeys.size || keys.some((key) => !allowedKeys.has(key))) {
      throw new Error("Reference nodes may contain only code and displayed-dimension coordinates.");
    }
    return {
      code: codes[rowIndex],
      ...Object.fromEntries(displayedDimensions.map((dimension) => [
        dimension,
        asFiniteNumber(record[dimension], "Reference nodes must contain finite coordinates for the displayed dimensions."),
      ])),
    };
  });
}

function expectedAdjacency(codes: string[]) {
  const entries: AdjacencyKeyEntry[] = [];
  for (let targetIndex = 1; targetIndex < codes.length; targetIndex += 1) {
    for (let sourceIndex = 0; sourceIndex < targetIndex; sourceIndex += 1) {
      entries.push({
        source: codes[sourceIndex],
        target: codes[targetIndex],
        name: `${codes[sourceIndex]} & ${codes[targetIndex]}`,
        sourceIndex,
        targetIndex,
      });
    }
  }
  return entries;
}

function parseRotationSet(value: unknown): RotationSet {
  if (!isRecord(value)) throw new Error("Reference rotationSet must be an object.");
  const codes = asStringArray(value.codes, "Reference codes");
  if (codes.length > 30) throw new Error("Reference rotations support at most 30 codes.");
  if (codes.some((code) => code.length > 256)) throw new Error("Reference code names must be 256 characters or fewer.");
  if (codes.length < 3 || new Set(codes).size !== codes.length) {
    throw new Error("Reference codes must contain at least three unique names.");
  }
  if (!Array.isArray(value.adjacencyKey) || value.adjacencyKey.some((entry) => !isRecord(entry))) {
    throw new Error("Reference adjacencyKey must be an array of edge objects.");
  }
  const adjacencyKey = value.adjacencyKey.map((entry, index) => {
    const record = entry as JsonRecord;
    return {
      source: asString(record.source, `Reference adjacencyKey[${index}].source`),
      target: asString(record.target, `Reference adjacencyKey[${index}].target`),
      name: asString(record.name, `Reference adjacencyKey[${index}].name`),
      sourceIndex: asFiniteNumber(record.sourceIndex, `Reference adjacencyKey[${index}].sourceIndex`),
      targetIndex: asFiniteNumber(record.targetIndex, `Reference adjacencyKey[${index}].targetIndex`),
    };
  });
  const expected = expectedAdjacency(codes);
  if (adjacencyKey.length !== expected.length || adjacencyKey.some((entry, index) => (
    entry.source !== expected[index].source
    || entry.target !== expected[index].target
    || entry.name !== expected[index].name
    || entry.sourceIndex !== expected[index].sourceIndex
    || entry.targetIndex !== expected[index].targetIndex
  ))) {
    throw new Error("Reference adjacency keys must exactly match the code names and order.");
  }
  const rotationColumns = asStringArray(value.rotationColumns, "Reference rotation columns");
  if (rotationColumns.length !== adjacencyKey.length) {
    throw new Error("Reference rotation columns must contain exactly one axis per adjacency edge.");
  }
  const svdColumns = rotationColumns.every((column, index) => column === `SVD${index + 1}`);
  const meanColumns = rotationColumns.every((column, index) => column === (index === 0 ? "MR1" : `SVD${index + 1}`));
  if (!svdColumns && !meanColumns) {
    throw new Error("Reference rotation columns must use canonical SVD or mean-rotation names.");
  }
  if (!Array.isArray(value.rotationMatrix) || value.rotationMatrix.length !== adjacencyKey.length) {
    throw new Error("Reference rotation matrix must have one row per adjacency edge.");
  }
  const rotationMatrix = value.rotationMatrix.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== rotationColumns.length) {
      throw new Error("Reference rotation matrix dimensions do not match its edge and axis metadata.");
    }
    return row.map((cell, columnIndex) => asFiniteNumber(
      cell,
      `Reference finite numeric rotation matrix cell [${rowIndex}, ${columnIndex}]`,
    ));
  });
  const orthonormalTolerance = 1e-8;
  for (let left = 0; left < rotationColumns.length; left += 1) {
    for (let right = left; right < rotationColumns.length; right += 1) {
      let dotProduct = 0;
      for (const row of rotationMatrix) dotProduct += row[left] * row[right];
      const expectedDot = left === right ? 1 : 0;
      if (Math.abs(dotProduct - expectedDot) > orthonormalTolerance) {
        throw new Error("Reference rotation matrix columns must form an orthonormal basis.");
      }
    }
  }
  const isMeanRotation = rotationColumns[0] === "MR1";
  if (!Array.isArray(value.eigenvalues)
    || (isMeanRotation ? value.eigenvalues.length !== 0 : value.eigenvalues.length !== rotationColumns.length)) {
    throw new Error(isMeanRotation
      ? "Reference mean rotations must use jENA's empty eigenvalue representation."
      : "Reference SVD eigenvalues must match the rotation columns.");
  }
  const eigenvalues = value.eigenvalues.map((cell, index) => asFiniteNumber(cell, `Reference eigenvalue ${index}`));
  if (eigenvalues.some((value) => value < -1e-12)) {
    throw new Error("Reference rotation sets must contain nonnegative eigenvalues.");
  }
  if (!Array.isArray(value.centerVector) || value.centerVector.length !== adjacencyKey.length) {
    throw new Error("Reference center vector must have one value per adjacency edge.");
  }
  const centerVector = value.centerVector.map((cell, index) => asFiniteNumber(cell, `Reference center value ${index}`));
  const centerSquaredNorm = centerVector.reduce((sum, coordinate) => sum + coordinate * coordinate, 0);
  if (centerVector.some((coordinate) => coordinate < -1e-12 || coordinate > 1 + 1e-12)
    || !Number.isFinite(centerSquaredNorm)
    || centerSquaredNorm > 1 + 1e-8) {
    throw new Error("Reference center vector must be a valid sphere-normalized mean.");
  }
  const displayedDimensions = rotationColumns.slice(0, Math.min(3, rotationColumns.length));
  const nodes = parseCanonicalNodes(value.nodes, codes, displayedDimensions);
  return { codes, adjacencyKey, rotationMatrix, rotationColumns, eigenvalues, centerVector, nodes };
}

function parseCompatibility(value: unknown): OpenEnaReferenceCompatibility {
  if (!isRecord(value)) throw new Error("Reference compatibility metadata is missing.");
  if (value.model !== "EndPoint") throw new Error("Reference rotations must come from an endpoint model.");
  if (value.window !== "MovingStanzaWindow" && value.window !== "Conversation") throw new Error("Reference window is invalid.");
  if (value.weightBy !== "binary" && value.weightBy !== "sum") throw new Error("Reference weighting is invalid.");
  if (value.normalization !== "sphere") throw new Error("Reference normalization must be sphere.");
  if (typeof value.centerAlignToOrigin !== "boolean") throw new Error("Reference zero-network handling is invalid.");
  const backward = value.windowSizeBack === "Infinity"
    ? "Infinity"
    : asFiniteNumber(value.windowSizeBack, "Reference backward window");
  const forward = asFiniteNumber(value.windowSizeForward, "Reference forward window");
  return {
    model: "EndPoint",
    codes: asStringArray(value.codes, "Reference compatibility codes"),
    window: value.window,
    windowSizeBack: backward,
    windowSizeForward: forward,
    weightBy: value.weightBy,
    centerAlignToOrigin: value.centerAlignToOrigin,
    normalization: "sphere",
  };
}

function parseReferenceFit(value: unknown): OpenEnaReferenceFit {
  if (!isRecord(value)) throw new Error("Reference fit provenance is missing.");
  const unitColumns = asStringArray(value.unitColumns, "Reference fit unit columns");
  const conversationColumns = asStringArray(value.conversationColumns, "Reference fit conversation columns");
  if (unitColumns.length === 0 || conversationColumns.length === 0) {
    throw new Error("Reference fit provenance must preserve at least one unit and conversation column.");
  }
  if (new Set(unitColumns).size !== unitColumns.length || new Set(conversationColumns).size !== conversationColumns.length) {
    throw new Error("Reference fit unit and conversation mappings must contain unique columns.");
  }
  if (value.method === "svd") return { method: "svd", unitColumns, conversationColumns };
  if (value.method !== "mean") throw new Error("Reference fit method must be SVD or mean rotation.");
  if (!Array.isArray(value.groupOrder) || value.groupOrder.length !== 2) {
    throw new Error("Reference mean-rotation provenance must contain two ordered group labels.");
  }
  const groupOrder = value.groupOrder.map((label, index) => asString(label, `Reference fit group ${index + 1}`));
  if (groupOrder[0] === groupOrder[1]) {
    throw new Error("Reference mean-rotation provenance must contain two distinct ordered groups.");
  }
  return {
    method: "mean",
    unitColumns,
    conversationColumns,
    groupColumn: asString(value.groupColumn, "Reference fit comparison field"),
    groupOrder: [groupOrder[0], groupOrder[1]],
  };
}

function parseReferenceObject(value: unknown): OpenEnaRotationReference {
  if (!isRecord(value)) throw new Error("Reference rotation JSON must contain an object.");
  if (value.schemaVersion !== 1 || value.kind !== "open-ena-reference-rotation" || value.app !== "ENA.HK Open ENA") {
    throw new Error("This is not a supported ENA.HK reference rotation package.");
  }
  if (value.runtime !== "jena-js" || value.runtimeVersion !== JENA_RUNTIME_VERSION) {
    throw new Error(`Reference rotation runtime must be jena-js ${JENA_RUNTIME_VERSION}.`);
  }
  if (!isRecord(value.source)) throw new Error("Reference source provenance is missing.");
  const compatibility = parseCompatibility(value.compatibility);
  const rotationSet = parseRotationSet(value.rotationSet);
  const fit = parseReferenceFit(value.fit);
  const rotationIsMean = rotationSet.rotationColumns[0] === "MR1";
  if ((fit.method === "mean") !== rotationIsMean) {
    throw new Error("Reference fit provenance must match the rotation-axis definition.");
  }
  if (compatibility.codes.length !== rotationSet.codes.length || compatibility.codes.some((code, index) => code !== rotationSet.codes[index])) {
    throw new Error("Reference compatibility codes do not match its rotation set.");
  }
  return {
    schemaVersion: 1,
    kind: "open-ena-reference-rotation",
    app: "ENA.HK Open ENA",
    runtime: "jena-js",
    runtimeVersion: JENA_RUNTIME_VERSION,
    referenceId: asString(value.referenceId, "Reference ID"),
    name: asString(value.name, "Reference name"),
    source: {
      datasetName: asString(value.source.datasetName, "Reference dataset name"),
      hashKind: asDatasetHashKind(value.source.hashKind),
      normalizedUtf8TextSha256: asSha256(value.source.normalizedUtf8TextSha256, "Reference dataset hash"),
      analyzedAt: asIsoTimestamp(value.source.analyzedAt, "Reference analysis timestamp"),
    },
    fit,
    compatibility,
    rotationSet,
  };
}

function referenceFromResultBundle(value: JsonRecord, filename: string): OpenEnaRotationReference {
  if ((value.schemaVersion !== 1 && value.schemaVersion !== 2)
    || value.app !== "ENA.HK Open ENA"
    || !isRecord(value.manifest)) {
    throw new Error("This JSON is neither an ENA.HK reference rotation nor a supported result bundle.");
  }
  const manifest = value.manifest as unknown as OpenEnaManifest;
  if (!isRecord(manifest.dataset) || !isRecord(manifest.result) || !isRecord(manifest.effectiveJenaOptions)) {
    throw new Error("The result bundle manifest is incomplete.");
  }
  if (manifest.runtime !== "jena-js" || manifest.runtimeVersion !== JENA_RUNTIME_VERSION) {
    throw new Error(`Reference rotation runtime must be jena-js ${JENA_RUNTIME_VERSION}.`);
  }
  const effective = manifest.effectiveJenaOptions;
  const effectiveReference = effective.rotation.method === "reference";
  const hasProjectionReference = Boolean(manifest.result.projectionReference);
  if (effectiveReference !== hasProjectionReference) {
    throw new Error("Result-bundle projection lineage is inconsistent with its effective rotation method.");
  }
  const analyzedAt = asIsoTimestamp(manifest.result.analyzedAt, "Reference analysis timestamp");
  const hash = asSha256(manifest.dataset.normalizedUtf8TextSha256, "Reference dataset hash");
  if (manifest.result.projectionReference) {
    if (effective.rotation.method !== "reference") {
      throw new Error("Result-bundle projection lineage is inconsistent with its effective rotation method.");
    }
    if (effective.rotation.referenceId !== manifest.result.projectionReference.referenceId) {
      throw new Error("Result-bundle reference identifier is inconsistent with its projection provenance.");
    }
    if (effective.rotation.sourceDatasetSha256 !== manifest.result.projectionReference.source.normalizedUtf8TextSha256) {
      throw new Error("Result-bundle reference analyzed-table hash is inconsistent with its projection provenance.");
    }
    return parseReferenceObject({
      ...manifest.result.projectionReference,
      rotationSet: value.rotationSet,
    });
  }
  return parseReferenceObject({
    schemaVersion: 1,
    kind: "open-ena-reference-rotation",
    app: "ENA.HK Open ENA",
    runtime: "jena-js",
    runtimeVersion: manifest.runtimeVersion,
    referenceId: `open-ena-ref:${hash ?? manifest.dataset.name}:${analyzedAt}`,
    name: `Reference from ${filename}`,
    source: {
      datasetName: manifest.dataset.name,
      hashKind: manifest.dataset.hashKind,
      normalizedUtf8TextSha256: hash,
      analyzedAt,
    },
    fit: effective.rotation.method === "mean" || effective.rotation.method === "generalized"
      ? {
          method: "mean",
          unitColumns: manifest.configuration.unitColumns,
          conversationColumns: manifest.configuration.conversationColumns,
          groupColumn: manifest.configuration.groupColumn,
          groupOrder: manifest.result.groups.map((group) => group.name),
        }
      : {
          method: "svd",
          unitColumns: manifest.configuration.unitColumns,
          conversationColumns: manifest.configuration.conversationColumns,
        },
    compatibility: {
      model: effective.model,
      codes: effective.codes,
      window: effective.window,
      windowSizeBack: effective.windowSizeBack,
      windowSizeForward: effective.windowSizeForward,
      weightBy: effective.weightBy,
      centerAlignToOrigin: effective.centerAlignToOrigin,
      normalization: effective.normalization,
    },
    rotationSet: value.rotationSet,
  });
}

export function parseRotationReference(text: string, filename = "reference.json") {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Reference rotation file is not valid JSON.");
  }
  if (isRecord(value) && value.kind === "open-ena-reference-rotation") return parseReferenceObject(value);
  if (isRecord(value)) return referenceFromResultBundle(value, filename);
  throw new Error("Reference rotation JSON must contain an object.");
}

export function buildReferenceRotationPackage(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  result: OpenEnaResult,
  sha256: string | null = null,
): OpenEnaRotationReference {
  if (result.set.modelType !== "EndPoint") throw new Error("Only endpoint models can be exported as reference rotations.");
  if (result.projectionReference) {
    return { ...result.projectionReference, rotationSet: result.set.rotation };
  }
  const backward = config.window === "Conversation" ? "Infinity" : config.windowSizeBack;
  const forward = config.window === "Conversation" ? 0 : config.windowSizeForward;
  return {
    schemaVersion: 1,
    kind: "open-ena-reference-rotation",
    app: "ENA.HK Open ENA",
    runtime: "jena-js",
    runtimeVersion: JENA_RUNTIME_VERSION,
    referenceId: `open-ena-ref:${sha256 ?? dataset.name}:${result.analyzedAt}`,
    name: `${dataset.name} reference rotation`,
    source: {
      datasetName: dataset.name,
      hashKind: datasetHashKindFor(dataset),
      normalizedUtf8TextSha256: sha256,
      analyzedAt: result.analyzedAt,
    },
    fit: config.rotation === "mean"
      ? {
          method: "mean",
          unitColumns: [...config.unitColumns],
          conversationColumns: [...config.conversationColumns],
          groupColumn: config.groupColumn ?? "",
          groupOrder: result.groups.slice(0, 2).map((group) => group.name) as [string, string],
        }
      : {
          method: "svd",
          unitColumns: [...config.unitColumns],
          conversationColumns: [...config.conversationColumns],
        },
    compatibility: {
      model: "EndPoint",
      codes: [...result.set.rotation.codes],
      window: config.window,
      windowSizeBack: backward,
      windowSizeForward: forward,
      weightBy: config.weightBy,
      centerAlignToOrigin: config.centerAlignToOrigin,
      normalization: "sphere",
    },
    rotationSet: {
      ...result.set.rotation,
      codes: [...result.set.rotation.codes],
      adjacencyKey: result.set.rotation.adjacencyKey.map((edge) => ({ ...edge })),
      rotationMatrix: result.set.rotation.rotationMatrix.map((row) => [...row]),
      rotationColumns: [...result.set.rotation.rotationColumns],
      eigenvalues: [...result.set.rotation.eigenvalues],
      centerVector: [...result.set.rotation.centerVector],
      nodes: result.set.rotation.nodes?.map((row) => ({ ...row })),
    },
  };
}

export function validateReferenceCompatibility(config: OpenEnaConfig, reference: OpenEnaRotationReference) {
  if (config.rotation !== "reference") return [];
  const errors: string[] = [];
  if (config.referenceRotationId !== reference.referenceId) errors.push("The selected reference rotation does not match the model configuration.");
  if (config.model !== "EndPoint") errors.push("Reference projection is currently limited to endpoint models.");
  if (config.codes.length !== reference.compatibility.codes.length || config.codes.some((code, index) => code !== reference.compatibility.codes[index])) {
    errors.push("Reference projection requires the same code names and order as the fitted reference.");
  }
  if (config.window !== reference.compatibility.window) errors.push("Reference projection requires the same conversation-window method.");
  const backward = config.window === "Conversation" ? "Infinity" : config.windowSizeBack;
  const forward = config.window === "Conversation" ? 0 : config.windowSizeForward;
  if (backward !== reference.compatibility.windowSizeBack) errors.push("Reference projection requires the same effective backward window.");
  if (forward !== reference.compatibility.windowSizeForward) errors.push("Reference projection requires the same effective forward window.");
  if (config.weightBy !== reference.compatibility.weightBy) errors.push("Reference projection requires the same co-occurrence weighting.");
  if (config.centerAlignToOrigin !== reference.compatibility.centerAlignToOrigin) {
    errors.push("Reference projection requires the same zero-network handling.");
  }
  return errors;
}
