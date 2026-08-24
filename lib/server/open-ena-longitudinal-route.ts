import {
  assertAnalysisExecutionDatasetV2,
  assertTrajectoryRunSpecV2,
  executeLongitudinalAnalysisV2,
  verifyLongitudinalAnalysisBundleV2,
  type LongitudinalAnalysisBundleV2,
  type LongitudinalExecutionRequestV2,
} from "j-3dena";

const MAX_DERIVED_PAYLOAD_BYTES = 64 * 1024 * 1024;
const HARD_DEADLINE_MS = 60_000;

type RequestValidatorV3 = (request: LongitudinalExecutionRequestV2) => void;

export interface OpenEnaLongitudinalRouteDependenciesV3 {
  execute?: (request: LongitudinalExecutionRequestV2) => Promise<LongitudinalAnalysisBundleV2>;
  verify?: (bundle: LongitudinalAnalysisBundleV2) => Promise<void> | void;
  validateRequest?: RequestValidatorV3;
  deadlineMilliseconds?: number;
}

export class OpenEnaLongitudinalRouteErrorV3 extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "OpenEnaLongitudinalRouteErrorV3";
    this.code = code;
    this.status = status;
  }
}

function fail(code: string, status: number, message: string): never {
  throw new OpenEnaLongitudinalRouteErrorV3(code, status, message);
}

function objectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_REQUEST", 400, `${path} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[], path: string): void {
  const actual = Object.keys(record).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    fail("INVALID_REQUEST", 400, `${path} contains unsupported fields.`);
  }
}

function assertOpaqueIdentity(value: unknown, prefix: string, path: string, enforceOpaqueComponents = false): void {
  const record = objectRecord(value, path);
  if (typeof record.canonical !== "string" || !record.canonical.startsWith(prefix)) {
    fail("PRIVACY_BOUNDARY_VIOLATION", 400, `${path} is not an opaque Open ENA identity.`);
  }
  if (enforceOpaqueComponents && (!Array.isArray(record.values)
    || record.values.some((component) => typeof component === "string" && !component.startsWith("participant-") && !component.startsWith("unit-") && !component.startsWith("step-") && !component.startsWith("@opaque")))) {
    fail("PRIVACY_BOUNDARY_VIOLATION", 400, `${path}.values contains a raw identity component.`);
  }
}

/**
 * Enforces the server boundary independently of the scientific contract:
 * the service receives fixed-fit projected values and opaque identities only.
 */
export function assertOpenEnaLongitudinalRemotePrivacyV3(request: LongitudinalExecutionRequestV2): void {
  if (request.execution.target !== "persistent-compute-service") {
    fail("INVALID_EXECUTION_TARGET", 400, "Remote trajectory execution must declare persistent-compute-service.");
  }
  const sourceResult = request.dataset.sourceResult;
  if (!sourceResult || sourceResult.sourceKind !== "raw-jena") {
    fail("INVALID_SOURCE_KIND", 400, "Remote trajectory execution requires the bound raw-jena result envelope.");
  }
  const scientific = objectRecord(sourceResult.result, "request.dataset.sourceResult.result");
  const points = scientific.points;
  if (!Array.isArray(points) || points.length === 0) fail("EMPTY_DERIVED_PAYLOAD", 400, "The projected trajectory payload contains no fitted points.");
  points.forEach((candidate, index) => {
    const point = objectRecord(candidate, `points[${index}]`);
    assertOpaqueIdentity(point.participantLabel, "opaque-participant:", `points[${index}].participantLabel`, true);
    assertOpaqueIdentity(point.unit, "opaque-unit:", `points[${index}].unit`);
    assertOpaqueIdentity(point.id, "opaque-point:", `points[${index}].id`);
  });
  const accumulation = objectRecord(scientific.accumulation, "request.dataset.sourceResult.result.accumulation");
  const rowCounts = objectRecord(accumulation.rowCounts, "request.dataset.sourceResult.result.accumulation.rowCounts");
  if (!Array.isArray(rowCounts.rowKeys) || rowCounts.rowKeys.length !== 0
    || !Array.isArray(rowCounts.values) || rowCounts.values.length !== 0) {
    fail("PRIVACY_BOUNDARY_VIOLATION", 400, "Raw coded row counts must be removed before remote execution.");
  }
}

function validateScientificRequest(request: LongitudinalExecutionRequestV2): void {
  assertAnalysisExecutionDatasetV2(request.dataset);
  assertTrajectoryRunSpecV2(request.pathTask.runSpec);
  const sourceResult = request.dataset.sourceResult;
  if (!sourceResult) fail("MISSING_SOURCE_RESULT", 400, "The immutable jENA source result is required.");
  if (request.pathTask.datasetHash !== request.dataset.receipt.sha256
    || request.pathTask.specHash !== request.dataset.specHash
    || request.pathTask.runSpec.sourceResultHash !== sourceResult.hash) {
    fail("IMMUTABLE_BINDING_MISMATCH", 400, "The dataset, spec, and source-result hashes do not share one immutable binding.");
  }
}

async function withDeadline<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new OpenEnaLongitudinalRouteErrorV3(
      "REMOTE_DEADLINE_EXCEEDED",
      408,
      `Persistent trajectory compute exceeded its ${milliseconds} ms hard deadline. Repetitions were not reduced.`,
    )), milliseconds);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function errorResponse(error: unknown): Response {
  const known = error instanceof OpenEnaLongitudinalRouteErrorV3;
  const status = known ? error.status : 400;
  const code = known ? error.code : "INVALID_LONGITUDINAL_TASK";
  const message = error instanceof Error ? error.message : "The trajectory task was rejected.";
  return Response.json({ error: { code, message } }, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function createOpenEnaLongitudinalPostHandlerV3(
  dependencies: OpenEnaLongitudinalRouteDependenciesV3 = {},
): (incoming: Request) => Promise<Response> {
  const execute = dependencies.execute ?? executeLongitudinalAnalysisV2;
  const verify = dependencies.verify ?? verifyLongitudinalAnalysisBundleV2;
  const validate = dependencies.validateRequest ?? validateScientificRequest;
  const deadlineMilliseconds = dependencies.deadlineMilliseconds ?? HARD_DEADLINE_MS;
  return async (incoming: Request) => {
    try {
      const declaredLength = Number(incoming.headers.get("content-length") ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > MAX_DERIVED_PAYLOAD_BYTES) {
        fail("DERIVED_PAYLOAD_TOO_LARGE", 413, "The derived trajectory payload exceeds the 64 MiB service limit.");
      }
      const text = await incoming.text();
      if (new TextEncoder().encode(text).byteLength > MAX_DERIVED_PAYLOAD_BYTES) {
        fail("DERIVED_PAYLOAD_TOO_LARGE", 413, "The derived trajectory payload exceeds the 64 MiB service limit.");
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(text);
      } catch {
        fail("INVALID_JSON", 400, "The persistent trajectory request is not valid JSON.");
      }
      const body = objectRecord(decoded, "body");
      exactKeys(body, ["schemaVersion", "request"], "body");
      if (body.schemaVersion !== 2) fail("INVALID_REQUEST_VERSION", 400, "body.schemaVersion must be 2.");
      const request = structuredClone(objectRecord(body.request, "body.request")) as unknown as LongitudinalExecutionRequestV2;
      assertOpenEnaLongitudinalRemotePrivacyV3(request);
      validate(request);
      const requestedRepetitions = request.bootstrapTask?.repetitions ?? null;
      const requestedPermutations = request.inferenceTask?.requests.map((item) => item.kind === "path-comparison" ? item.repetitions : null) ?? [];
      const bundle = await withDeadline(execute(request), deadlineMilliseconds);
      if (request.bootstrapTask?.repetitions !== requestedRepetitions
        || request.inferenceTask?.requests.some((item, index) => item.kind === "path-comparison" && item.repetitions !== requestedPermutations[index])) {
        fail("TASK_MUTATION_DETECTED", 500, "The compute service mutated the requested repetition plan.");
      }
      await verify(bundle);
      if (bundle.identity.datasetHash !== request.pathTask.datasetHash
        || bundle.identity.specHash !== request.pathTask.specHash
        || bundle.identity.sourceResultHash !== request.pathTask.runSpec.sourceResultHash
        || bundle.identity.runId !== request.pathTask.runId
        || bundle.execution.target !== "persistent-compute-service") {
        fail("RESULT_BINDING_MISMATCH", 500, "The service result does not match the submitted immutable task binding.");
      }
      return Response.json(bundle, {
        status: 200,
        headers: { "cache-control": "no-store", "x-open-ena-compute": "persistent-derived-v2" },
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const handleOpenEnaLongitudinalPostV3 = createOpenEnaLongitudinalPostHandlerV3();
