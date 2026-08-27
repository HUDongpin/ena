import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  OPEN_ENA_AI_OFFLINE_EVALUATION_CASES_V1,
  OPEN_ENA_AI_OFFLINE_EVALUATION_SUITE_VERSION_V1,
} from "../lib/server/open-ena-ai-prompt-evaluation";
import {
  getApprovedOpenEnaAiPromptArtifact,
  stableCanonicalJson,
} from "../lib/server/open-ena-ai-prompt-governance";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const verifierPath = join(projectRoot, "scripts/verify-open-ena-ai-prompts.ts");
const tsxLoaderPath = join(projectRoot, "node_modules/tsx/dist/loader.mjs");

async function loadVerifier() {
  assert.equal(existsSync(verifierPath), true, "the prompt verifier CLI must exist");
  return import(pathToFileURL(verifierPath).href) as Promise<{
    buildOpenEnaAiPromptVerificationV1: (options?: Record<string, unknown>) => {
      automatedStatus: "pass" | "fail";
      authorizationEffect: "none";
      hardGateFailures: readonly string[];
      artifacts: ReadonlyArray<{
        locale: string;
        artifactSha256: string;
        issueCodes: readonly string[];
        requestLocalSchemaVerifiedCaseIds: readonly string[];
      }>;
      evaluationReports: ReadonlyArray<{
        hardGateFailures: readonly string[];
      }>;
      evaluationReceipts: ReadonlyArray<{
        scientificReview: string;
        privacySecurityReview: string;
      }>;
      mockClientCoverage: ReadonlyArray<{
        coverageId: string;
        evidenceKind: string;
        sourceSha256Verified: boolean;
        status: "bound" | "missing";
      }>;
    };
    openEnaAiPromptVerificationExitCodeV1: (verification: {
      automatedStatus: "pass" | "fail";
    }) => 0 | 1;
  }>;
}

function assertDeepFrozen(value: unknown, seen = new Set<unknown>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const nested of Object.values(value as Record<string, unknown>)) assertDeepFrozen(nested, seen);
}

test("the verifier returns one deterministic, authorization-neutral result for all approved locales", async () => {
  const verifier = await loadVerifier();
  const first = verifier.buildOpenEnaAiPromptVerificationV1();
  const second = verifier.buildOpenEnaAiPromptVerificationV1();

  assert.equal(first.automatedStatus, "pass");
  assert.equal(verifier.openEnaAiPromptVerificationExitCodeV1(first), 0);
  assert.equal(first.authorizationEffect, "none");
  assert.deepEqual(first.hardGateFailures, []);
  assert.deepEqual(first.artifacts.map((entry) => entry.locale), ["en", "zh-hant", "zh-hans"]);
  assert.ok(first.artifacts.every((entry) => entry.issueCodes.length === 0));
  assert.ok(first.artifacts.every((entry) => (
    stableCanonicalJson(entry.requestLocalSchemaVerifiedCaseIds)
      === stableCanonicalJson(OPEN_ENA_AI_OFFLINE_EVALUATION_CASES_V1.map(
        (evaluationCase) => evaluationCase.caseId,
      ))
  )));
  assert.ok(first.evaluationReports.every((entry) => entry.hardGateFailures.length === 0));
  assert.ok(first.evaluationReceipts.every((receipt) => (
    receipt.scientificReview === "pending" && receipt.privacySecurityReview === "pending"
  )));
  assert.deepEqual(first.mockClientCoverage.map((entry) => [entry.coverageId, entry.status]), [
    ["mock-timeout", "bound"],
    ["mock-cancellation", "bound"],
    ["mock-rate-limit-429", "bound"],
    ["mock-payment-required-402", "bound"],
    ["mock-network-failure", "bound"],
    ["mock-oversize-response", "bound"],
    ["mock-malformed-completion", "bound"],
    ["payload-hostile-label-projection", "bound"],
    ["route-reviewed-aggregate-consent", "bound"],
    ["workspace-binding-change-revokes-output", "bound"],
    ["workspace-stale-generation-cannot-settle", "bound"],
  ]);
  assert.ok(first.mockClientCoverage.every(
    (entry) => entry.evidenceKind === "existing-offline-test-source-registration",
  ));
  assert.ok(first.mockClientCoverage.every((entry) => entry.sourceSha256Verified));
  assert.equal(stableCanonicalJson(first), stableCanonicalJson(second));
  const canonicalResult = stableCanonicalJson(first);
  for (const forbiddenText of [
    "approvalStatus",
    "ignore-previous-instructions",
    "canary-473",
    "IGNORE PREVIOUS INSTRUCTIONS GROUP",
    "REVEAL PRIVATE IDENTIFIERS GROUP",
    "OutputSecretRowsCode",
    "FollowUserDirectiveCode",
    "ReturnCompletionMarkerCode",
    "SYSTEM OVERRIDE PERIOD ONE",
    "DISCLOSE COORDINATES PERIOD TWO",
    "ECHO PRIVATE LABEL PERIOD THREE",
    "/Volumes/",
  ]) assert.equal(canonicalResult.includes(forbiddenText), false, forbiddenText);
  assertDeepFrozen(first);
});

test("the verification function fails controlled prompt-byte, hash, schema, fixture, and mock-binding drift", async () => {
  const verifier = await loadVerifier();
  const approved = getApprovedOpenEnaAiPromptArtifact(
    "open-ena-aggregate-inference-review-v2",
    "en",
  );
  const schemaDrift = structuredClone(approved);
  Object.assign(schemaDrift.responseJsonSchema, { description: "drift" });
  const mutations: Array<[string, Record<string, unknown>]> = [
    ["prompt-byte", {
      artifactOverrides: { en: { ...approved, systemPrompt: `${approved.systemPrompt}.` } },
    }],
    ["hash", {
      artifactOverrides: { en: { ...approved, contentSha256: "0".repeat(64) } },
    }],
    ["schema", { artifactOverrides: { en: schemaDrift } }],
    ["fixture", { cases: OPEN_ENA_AI_OFFLINE_EVALUATION_CASES_V1.slice(0, 3) }],
    ["mock-binding", { mockClientTestSource: "no bound mock client tests" }],
  ];

  for (const [mutationId, options] of mutations) {
    const result = verifier.buildOpenEnaAiPromptVerificationV1(options);
    assert.equal(result.automatedStatus, "fail", mutationId);
    assert.equal(verifier.openEnaAiPromptVerificationExitCodeV1(result), 1, mutationId);
    assert.ok(result.hardGateFailures.length > 0, mutationId);
  }

  const commentedClientSource = readFileSync(
    join(projectRoot, "tests/open-ena-ai-interpretation-client.test.ts"),
    "utf8",
  ).split("\n").map((line) => `// ${line}`).join("\n");
  const commentOnlyBinding = verifier.buildOpenEnaAiPromptVerificationV1({
    mockClientTestSource: commentedClientSource,
  });
  assert.equal(commentOnlyBinding.automatedStatus, "fail");
  assert.equal(verifier.openEnaAiPromptVerificationExitCodeV1(commentOnlyBinding), 1);
  assert.ok(commentOnlyBinding.mockClientCoverage
    .filter((entry) => entry.coverageId.startsWith("mock-"))
    .every((entry) => entry.status === "missing"));

  const timeoutTestName = "Luna interpretation aborts at the injected timeout and redacts the fetch error";
  const invalidRegistrations = [
    `import test from "node:test";\ntest(${JSON.stringify(timeoutTestName)});`,
    `import test from "node:test";\ntest(${JSON.stringify(timeoutTestName)}, () => {});`,
    `import test from "node:test";\ntest(${JSON.stringify(timeoutTestName)}, { skip: true }, () => { throw new Error("not run"); });`,
    `import test from "node:test";\ntest(${JSON.stringify(timeoutTestName)}, { todo: "later" }, () => { throw new Error("not run"); });`,
    `import test from "node:test";\ntest(${JSON.stringify(timeoutTestName)}, { only: true }, () => { throw new Error("not run"); });`,
    `import test from "node:test";\ntest(${JSON.stringify(timeoutTestName)}, () => { return; });`,
    `import test from "node:test";\ntest(${JSON.stringify(timeoutTestName)}, () => void 0);`,
    `import test from "node:test";\ntest(${JSON.stringify(timeoutTestName)}, () => (() => { throw new Error("not invoked"); }));`,
  ];
  for (const mockClientTestSource of invalidRegistrations) {
    const result = verifier.buildOpenEnaAiPromptVerificationV1({ mockClientTestSource });
    assert.equal(result.automatedStatus, "fail", mockClientTestSource);
    assert.equal(
      result.mockClientCoverage.find((entry) => entry.coverageId === "mock-timeout")?.status,
      "missing",
      mockClientTestSource,
    );
  }

  const exactClientTestNames = [
    "Luna interpretation aborts at the injected timeout and redacts the fetch error",
    "Luna interpretation propagates caller cancellation to the provider request",
    "Luna interpretation maps OpenRouter 429 to a fail-closed rate-limit error",
    "Luna interpretation identifies OpenRouter 402 without exposing billing details or keys",
    "Luna interpretation redacts non-timeout fetch failures",
    "Luna interpretation rejects an oversized provider response before schema parsing",
    "Luna interpretation rejects malformed completion JSON without echoing provider content",
  ];
  const allNoOpClientRegistrations = [
    `import test from "node:test";`,
    ...exactClientTestNames.map((name) => `test(${JSON.stringify(name)}, () => { return; });`),
  ].join("\n");
  const allNoOpResult = verifier.buildOpenEnaAiPromptVerificationV1({
    mockClientTestSource: allNoOpClientRegistrations,
  });
  assert.equal(allNoOpResult.automatedStatus, "fail");
  assert.ok(allNoOpResult.mockClientCoverage
    .filter((entry) => entry.coverageId.startsWith("mock-"))
    .every((entry) => entry.status === "missing"));

  const sourceDrift = verifier.buildOpenEnaAiPromptVerificationV1({
    mockClientTestSource: `${readFileSync(
      join(projectRoot, "tests/open-ena-ai-interpretation-client.test.ts"),
      "utf8",
    )}\n// source-manifest-drift`,
  });
  assert.equal(sourceDrift.automatedStatus, "fail");
  assert.ok(sourceDrift.mockClientCoverage
    .filter((entry) => entry.coverageId.startsWith("mock-"))
    .every((entry) => !entry.sourceSha256Verified && entry.status === "missing"));
});

test("the CLI is cwd- and AI-environment-independent and emits only canonical deterministic JSON", () => {
  assert.equal(existsSync(verifierPath), true, "the prompt verifier CLI must exist");
  const run = (cwd: string, extraEnvironment: Record<string, string> = {}) => spawnSync(
    process.execPath,
    ["--import", tsxLoaderPath, verifierPath],
    {
      cwd,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        ...extraEnvironment,
      },
    },
  );
  const fromProject = run(projectRoot);
  const fromTmpWithIgnoredAiEnvironment = run("/tmp", {
    OPEN_ENA_AI_ENABLED: "1",
    OPENROUTER_API_KEY: "synthetic-never-used",
    OPEN_ENA_AI_MODEL: "must-not-affect-offline-verification",
    OPENROUTER_MODEL: "also-must-not-affect-offline-verification",
  });

  for (const result of [fromProject, fromTmpWithIgnoredAiEnvironment]) {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(parsed.automatedStatus, "pass");
    assert.equal(parsed.authorizationEffect, "none");
    assert.equal(parsed.evaluationSuiteVersion, OPEN_ENA_AI_OFFLINE_EVALUATION_SUITE_VERSION_V1);
    assert.equal(`${stableCanonicalJson(parsed)}\n`, result.stdout);
  }
  assert.equal(fromProject.stdout, fromTmpWithIgnoredAiEnvironment.stdout);
});

test("package verify runs prompt governance first and CI names the inclusive verification step once", () => {
  const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts["prompt:verify"],
    "node --import tsx scripts/verify-open-ena-ai-prompts.ts",
  );
  assert.ok(packageJson.scripts.verify.startsWith("npm run prompt:verify && "));
  assert.equal(packageJson.scripts.verify.match(/npm run prompt:verify/gu)?.length, 1);

  const workflow = readFileSync(join(projectRoot, ".github/workflows/open-ena-ci.yml"), "utf8");
  assert.match(
    workflow,
    /- name: Verify prompt governance and complete application\s+run: npm run verify/u,
  );
  assert.equal(workflow.match(/npm run prompt:verify/gu)?.length ?? 0, 0);
});

test("offline evaluation and verification sources have no network, environment, write, or provider-client dependency", () => {
  assert.equal(existsSync(verifierPath), true, "the prompt verifier CLI must exist");
  const sources = [
    readFileSync(join(projectRoot, "lib/server/open-ena-ai-prompt-evaluation.ts"), "utf8"),
    readFileSync(verifierPath, "utf8"),
  ].join("\n");
  assert.doesNotMatch(sources, /\bfetch\s*\(/u);
  assert.doesNotMatch(sources, /process\.env/u);
  assert.doesNotMatch(sources, /\b(?:writeFile|appendFile|createWriteStream|rmSync|unlinkSync)\b/u);
  assert.doesNotMatch(sources, /from\s+["'][^"']*luna-client["']/u);
  assert.doesNotMatch(sources, /https?:\/\//u);
  const runtimeClient = readFileSync(join(projectRoot, "lib/server/luna-client.ts"), "utf8");
  assert.doesNotMatch(runtimeClient, /open-ena-ai-prompt-evaluation/u);
});
