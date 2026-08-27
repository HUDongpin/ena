import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  OPEN_ENA_AI_OFFLINE_EVALUATION_CASES_BY_LOCALE_V1,
  OPEN_ENA_AI_OFFLINE_EVALUATION_SUITE_VERSION_V1,
  collectOpenEnaAiOfflineFixtureEvidenceIdsV1,
  evaluateOpenEnaAiPromptArtifactOfflineV1,
  type OpenEnaAiOfflineEvaluationCaseV1,
  type OpenEnaAiOfflineEvaluationReportV1,
} from "../lib/server/open-ena-ai-prompt-evaluation";
import {
  OPEN_ENA_AI_APPROVED_ARTIFACT_SHA256_BY_LOCALE_V2,
  OPEN_ENA_AI_PROMPT_SPEC_V1,
  compileOpenEnaAiPromptArtifactV1,
  getApprovedOpenEnaAiPromptArtifact,
  instantiateOpenEnaAiResponseSchema,
  lintApprovedOpenEnaAiPromptArtifactV1,
  stableCanonicalJson,
  type EnaPromptEvalReceiptV1,
  type OpenEnaAiPromptLocaleV2,
} from "../lib/server/open-ena-ai-prompt-governance";
import { OPEN_ENA_AI_PROMPT_VERSION_V2 } from "../lib/open-ena/ai-interpretation";

export const OPEN_ENA_AI_PROMPT_VERIFICATION_SCHEMA_VERSION_V1 =
  "open-ena-ai-prompt-verification-v1" as const;

const LOCALES = ["en", "zh-hant", "zh-hans"] as const;

const MOCK_CLIENT_COVERAGE_BINDINGS = [
  {
    coverageId: "mock-timeout",
    sourceKey: "client",
    sourceFile: "tests/open-ena-ai-interpretation-client.test.ts",
    testName: "Luna interpretation aborts at the injected timeout and redacts the fetch error",
  },
  {
    coverageId: "mock-cancellation",
    sourceKey: "client",
    sourceFile: "tests/open-ena-ai-interpretation-client.test.ts",
    testName: "Luna interpretation propagates caller cancellation to the provider request",
  },
  {
    coverageId: "mock-rate-limit-429",
    sourceKey: "client",
    sourceFile: "tests/open-ena-ai-interpretation-client.test.ts",
    testName: "Luna interpretation maps OpenRouter 429 to a fail-closed rate-limit error",
  },
  {
    coverageId: "mock-payment-required-402",
    sourceKey: "client",
    sourceFile: "tests/open-ena-ai-interpretation-client.test.ts",
    testName: "Luna interpretation identifies OpenRouter 402 without exposing billing details or keys",
  },
  {
    coverageId: "mock-network-failure",
    sourceKey: "client",
    sourceFile: "tests/open-ena-ai-interpretation-client.test.ts",
    testName: "Luna interpretation redacts non-timeout fetch failures",
  },
  {
    coverageId: "mock-oversize-response",
    sourceKey: "client",
    sourceFile: "tests/open-ena-ai-interpretation-client.test.ts",
    testName: "Luna interpretation rejects an oversized provider response before schema parsing",
  },
  {
    coverageId: "mock-malformed-completion",
    sourceKey: "client",
    sourceFile: "tests/open-ena-ai-interpretation-client.test.ts",
    testName: "Luna interpretation rejects malformed completion JSON without echoing provider content",
  },
  {
    coverageId: "payload-hostile-label-projection",
    sourceKey: "payload",
    sourceFile: "tests/open-ena-ai-interpretation-payload.test.ts",
    testName: "AI v2 projection treats prompt-like source labels as untrusted and emits only role/index evidence",
  },
  {
    coverageId: "route-reviewed-aggregate-consent",
    sourceKey: "route",
    sourceFile: "tests/open-ena-ai-interpretation-route.test.ts",
    testName: "AI interpretation requires the reviewed-aggregate consent assertion",
  },
  {
    coverageId: "workspace-binding-change-revokes-output",
    sourceKey: "workspace",
    sourceFile: "tests/open-ena-ai-interpretation-workspace.test.ts",
    testName: "changing the evidence binding aborts work, revokes consent, and makes old output unrenderable",
  },
  {
    coverageId: "workspace-stale-generation-cannot-settle",
    sourceKey: "workspace",
    sourceFile: "tests/open-ena-ai-interpretation-workspace.test.ts",
    testName: "a deferred A generation cannot settle over a newer A generation after A to B to A",
  },
] as const;

export interface OpenEnaAiPromptVerificationArtifactV1 {
  readonly locale: OpenEnaAiPromptLocaleV2;
  readonly promptVersion: typeof OPEN_ENA_AI_PROMPT_VERSION_V2;
  readonly artifactSha256: string;
  readonly registryAuthorityVerified: boolean;
  readonly checkedInHashBindingVerified: boolean;
  readonly deterministicRecompilationVerified: boolean;
  readonly requestLocalSchemaVerified: boolean;
  readonly requestLocalSchemaVerifiedCaseIds: readonly string[];
  readonly issueCodes: readonly string[];
}

export interface OpenEnaAiPromptMockCoverageV1 {
  readonly coverageId: typeof MOCK_CLIENT_COVERAGE_BINDINGS[number]["coverageId"];
  readonly evidenceKind: "existing-offline-test-contract";
  readonly sourceFile: typeof MOCK_CLIENT_COVERAGE_BINDINGS[number]["sourceFile"];
  readonly testName: typeof MOCK_CLIENT_COVERAGE_BINDINGS[number]["testName"];
  readonly status: "bound" | "missing";
}

export interface OpenEnaAiPromptVerificationV1 {
  readonly verificationSchemaVersion: typeof OPEN_ENA_AI_PROMPT_VERIFICATION_SCHEMA_VERSION_V1;
  readonly evaluationSuiteVersion: typeof OPEN_ENA_AI_OFFLINE_EVALUATION_SUITE_VERSION_V1;
  readonly authorizationEffect: "none";
  readonly automatedStatus: "pass" | "fail";
  readonly artifacts: readonly OpenEnaAiPromptVerificationArtifactV1[];
  readonly evaluationReports: readonly OpenEnaAiOfflineEvaluationReportV1[];
  readonly evaluationReceipts: readonly EnaPromptEvalReceiptV1[];
  readonly mockClientCoverage: readonly OpenEnaAiPromptMockCoverageV1[];
  readonly hardGateFailures: readonly string[];
  readonly limitations: readonly string[];
}

export interface OpenEnaAiPromptVerificationOptionsV1 {
  readonly artifactOverrides?: Partial<Record<OpenEnaAiPromptLocaleV2, unknown>>;
  readonly cases?: readonly OpenEnaAiOfflineEvaluationCaseV1[];
  readonly mockClientTestSource?: string;
  readonly payloadTestSource?: string;
  readonly routeTestSource?: string;
  readonly workspaceTestSource?: string;
}

function deepFreeze<T>(value: T, seen = new Set<unknown>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function safeArtifactSha256(value: unknown): string {
  if (value !== null && typeof value === "object") {
    const descriptor = Object.getOwnPropertyDescriptor(value, "contentSha256");
    if (descriptor && "value" in descriptor && typeof descriptor.value === "string"
      && /^[0-9a-f]{64}$/u.test(descriptor.value)) {
      return descriptor.value;
    }
  }
  return "0".repeat(64);
}

type ContractTestSourceKey = "client" | "payload" | "route" | "workspace";

function defaultContractTestSources(): Readonly<Record<ContractTestSourceKey, string>> {
  return {
    client: readFileSync(
      new URL("../tests/open-ena-ai-interpretation-client.test.ts", import.meta.url),
      "utf8",
    ),
    payload: readFileSync(
      new URL("../tests/open-ena-ai-interpretation-payload.test.ts", import.meta.url),
      "utf8",
    ),
    route: readFileSync(
      new URL("../tests/open-ena-ai-interpretation-route.test.ts", import.meta.url),
      "utf8",
    ),
    workspace: readFileSync(
      new URL("../tests/open-ena-ai-interpretation-workspace.test.ts", import.meta.url),
      "utf8",
    ),
  };
}

function mockClientCoverage(
  sources: Readonly<Record<ContractTestSourceKey, string>>,
): OpenEnaAiPromptMockCoverageV1[] {
  const registrations = new Map<ContractTestSourceKey, ReadonlySet<string>>();
  return MOCK_CLIENT_COVERAGE_BINDINGS.map((binding) => {
    let registeredNames = registrations.get(binding.sourceKey);
    if (registeredNames === undefined) {
      registeredNames = registeredTopLevelNodeTestNames(
        sources[binding.sourceKey],
        binding.sourceFile,
      );
      registrations.set(binding.sourceKey, registeredNames);
    }
    return deepFreeze({
      coverageId: binding.coverageId,
      evidenceKind: "existing-offline-test-contract" as const,
      sourceFile: binding.sourceFile,
      testName: binding.testName,
      status: registeredNames.has(binding.testName) ? "bound" as const : "missing" as const,
    });
  });
}

function registeredTopLevelNodeTestNames(source: string, sourceFile: string): ReadonlySet<string> {
  const syntaxTree = ts.createSourceFile(
    sourceFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const testBindings = new Set<string>();
  for (const statement of syntaxTree.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "node:test") continue;
    const importClause = statement.importClause;
    if (importClause?.name) testBindings.add(importClause.name.text);
    if (importClause?.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
      for (const element of importClause.namedBindings.elements) {
        if ((element.propertyName?.text ?? element.name.text) === "test") {
          testBindings.add(element.name.text);
        }
      }
    }
  }
  const registeredNames = new Set<string>();
  for (const statement of syntaxTree.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const call = statement.expression;
    if (!ts.isIdentifier(call.expression) || !testBindings.has(call.expression.text)) continue;
    const name = call.arguments[0];
    if (name && ts.isStringLiteralLike(name)) registeredNames.add(name.text);
  }
  return registeredNames;
}

function instantiatedEvidenceEnum(schema: unknown): readonly string[] | null {
  try {
    const root = schema as {
      properties: {
        observedPatterns: {
          items: {
            properties: {
              evidenceRefs: { items: { enum: readonly string[] } };
            };
          };
        };
      };
    };
    return root.properties.observedPatterns.items.properties.evidenceRefs.items.enum;
  } catch {
    return null;
  }
}

export function buildOpenEnaAiPromptVerificationV1(
  options: OpenEnaAiPromptVerificationOptionsV1 = {},
): OpenEnaAiPromptVerificationV1 {
  const artifacts: OpenEnaAiPromptVerificationArtifactV1[] = [];
  const evaluationReports: OpenEnaAiOfflineEvaluationReportV1[] = [];
  const evaluationReceipts: EnaPromptEvalReceiptV1[] = [];
  const hardGateFailures: string[] = [];

  for (const locale of LOCALES) {
    const cases = options.cases ?? OPEN_ENA_AI_OFFLINE_EVALUATION_CASES_BY_LOCALE_V1[locale];
    const fixtureSchemaInputs = cases.map((evaluationCase) => ({
      caseId: evaluationCase.caseId,
      evidenceIds: collectOpenEnaAiOfflineFixtureEvidenceIdsV1(evaluationCase),
    }));
    const registryArtifact = getApprovedOpenEnaAiPromptArtifact(
      OPEN_ENA_AI_PROMPT_VERSION_V2,
      locale,
    );
    const artifact = options.artifactOverrides?.[locale] ?? registryArtifact;
    const issueCodes: string[] = lintApprovedOpenEnaAiPromptArtifactV1(
      OPEN_ENA_AI_PROMPT_SPEC_V1,
      artifact,
      locale,
    ).map((issue) => issue.code);
    const firstCompilation = compileOpenEnaAiPromptArtifactV1(OPEN_ENA_AI_PROMPT_SPEC_V1, locale);
    const secondCompilation = compileOpenEnaAiPromptArtifactV1(OPEN_ENA_AI_PROMPT_SPEC_V1, locale);
    const deterministicRecompilationVerified = stableCanonicalJson(firstCompilation)
      === stableCanonicalJson(secondCompilation);
    if (!deterministicRecompilationVerified) issueCodes.push("deterministic-recompilation-mismatch");
    const artifactSha256 = safeArtifactSha256(artifact);
    const checkedInHashBindingVerified = artifactSha256
      === OPEN_ENA_AI_APPROVED_ARTIFACT_SHA256_BY_LOCALE_V2[locale]
      && firstCompilation.contentSha256 === OPEN_ENA_AI_APPROVED_ARTIFACT_SHA256_BY_LOCALE_V2[locale];
    if (!checkedInHashBindingVerified) issueCodes.push("checked-in-hash-binding-mismatch");
    const requestLocalSchemaVerifiedCaseIds: string[] = [];
    for (const fixture of fixtureSchemaInputs) {
      try {
        const instantiated = instantiateOpenEnaAiResponseSchema(
          OPEN_ENA_AI_PROMPT_VERSION_V2,
          locale,
          fixture.evidenceIds,
        );
        if (stableCanonicalJson(instantiatedEvidenceEnum(instantiated))
          === stableCanonicalJson(fixture.evidenceIds)) {
          requestLocalSchemaVerifiedCaseIds.push(fixture.caseId);
        }
      } catch {
        // The aggregate result below fails closed if any fixed fixture is not verified.
      }
    }
    const requestLocalSchemaVerified = fixtureSchemaInputs.length === 4
      && requestLocalSchemaVerifiedCaseIds.length === fixtureSchemaInputs.length;
    if (!requestLocalSchemaVerified) issueCodes.push("request-local-schema-instantiation-failed");
    const normalizedIssueCodes = uniqueSorted(issueCodes);
    for (const issueCode of normalizedIssueCodes) {
      hardGateFailures.push(`${locale}-${issueCode}`);
    }
    artifacts.push(deepFreeze({
      locale,
      promptVersion: OPEN_ENA_AI_PROMPT_VERSION_V2,
      artifactSha256,
      registryAuthorityVerified: artifact === registryArtifact,
      checkedInHashBindingVerified,
      deterministicRecompilationVerified,
      requestLocalSchemaVerified,
      requestLocalSchemaVerifiedCaseIds,
      issueCodes: normalizedIssueCodes,
    }));
    const evaluation = evaluateOpenEnaAiPromptArtifactOfflineV1(artifact, locale, { cases });
    evaluationReports.push(evaluation.report);
    evaluationReceipts.push(evaluation.receipt);
    for (const failure of evaluation.report.hardGateFailures) {
      hardGateFailures.push(`${locale}-${failure}`);
    }
  }

  const defaultSources = defaultContractTestSources();
  const coverage = mockClientCoverage({
    client: options.mockClientTestSource ?? defaultSources.client,
    payload: options.payloadTestSource ?? defaultSources.payload,
    route: options.routeTestSource ?? defaultSources.route,
    workspace: options.workspaceTestSource ?? defaultSources.workspace,
  });
  for (const entry of coverage) {
    if (entry.status === "missing") hardGateFailures.push(`${entry.coverageId}-binding-missing`);
  }
  const normalizedFailures = uniqueSorted(hardGateFailures);
  return deepFreeze({
    verificationSchemaVersion: OPEN_ENA_AI_PROMPT_VERIFICATION_SCHEMA_VERSION_V1,
    evaluationSuiteVersion: OPEN_ENA_AI_OFFLINE_EVALUATION_SUITE_VERSION_V1,
    authorizationEffect: "none",
    automatedStatus: normalizedFailures.length === 0 ? "pass" : "fail",
    artifacts,
    evaluationReports,
    evaluationReceipts,
    mockClientCoverage: coverage,
    hardGateFailures: normalizedFailures,
    limitations: [
      "This verifier executes deterministic offline synthetic and mocked contracts only.",
      "Bound client tests are offline mocks, not live provider, deployment, or production evidence.",
      "Automated status has no approval effect; scientific and privacy/security reviews remain independent.",
    ],
  });
}

export function openEnaAiPromptVerificationExitCodeV1(
  verification: Pick<OpenEnaAiPromptVerificationV1, "automatedStatus">,
): 0 | 1 {
  return verification.automatedStatus === "pass" ? 0 : 1;
}

function runAsCli(): void {
  let verification: OpenEnaAiPromptVerificationV1;
  try {
    verification = buildOpenEnaAiPromptVerificationV1();
  } catch {
    verification = deepFreeze({
      verificationSchemaVersion: OPEN_ENA_AI_PROMPT_VERIFICATION_SCHEMA_VERSION_V1,
      evaluationSuiteVersion: OPEN_ENA_AI_OFFLINE_EVALUATION_SUITE_VERSION_V1,
      authorizationEffect: "none",
      automatedStatus: "fail",
      artifacts: [],
      evaluationReports: [],
      evaluationReceipts: [],
      mockClientCoverage: [],
      hardGateFailures: ["prompt-verifier-internal-failure"],
      limitations: [
        "Offline verification could not complete; no artifact approval or runtime authority changed.",
      ],
    });
  }
  console.log(stableCanonicalJson(verification));
  process.exitCode = openEnaAiPromptVerificationExitCodeV1(verification);
}

const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) runAsCli();
