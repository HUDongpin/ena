import assert from "node:assert/strict";
import test from "node:test";
import {
  compileEnaAgentTaskContractV1,
  ENA_AGENT_OPERATION_MODE_TEMPLATES_V1,
  ENA_AGENT_TASK_CONTRACT_SCHEMA_VERSION,
  ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA,
  parseEnaAgentTaskContractV1,
  renderEnaAgentTaskContractMarkdownV1,
} from "../lib/prompt-governance/agent-task-contract";

function validContract(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "ena-agent-task-contract-v1",
    projectSurface: "open-ena",
    operationMode: "implement",
    explicitGoal: "  Add a deterministic internal task contract.  ",
    nonGoals: ["Do not change production AI behavior."],
    targetAudience: ["ENA maintainers"],
    currentRepositoryState: {
      worktree: "/Volumes/Starship/ENA/output/worktrees/example",
      branch: "codex/example",
      headSha: "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
      dirtyPathsPresent: false,
      concurrentWritersKnown: true,
    },
    authoritativeSources: ["Approved implementation plan"],
    assumptions: [],
    unresolvedDecisions: [],
    allowedActions: ["Edit files in the isolated worktree."],
    forbiddenActions: ["Deploy the application."],
    scientificInvariants: ["Do not alter ENA scientific calculations."],
    acceptanceCriteria: ["Focused public-interface tests pass."],
    requiredCommands: ["node --import tsx --test tests/ena-agent-task-contract.test.ts"],
    requiredEvidence: ["Focused test output"],
    failureRecovery: ["Stop and report the failing command."],
    stopConditions: ["Stop before push, merge, or deployment."],
    maximumCompletionState: "IMPLEMENTED_UNVERIFIED",
    ...overrides,
  };
}

test("the V1 parser returns a normalized deeply frozen contract", () => {
  const parsed = parseEnaAgentTaskContractV1(validContract());

  assert.equal(ENA_AGENT_TASK_CONTRACT_SCHEMA_VERSION, "ena-agent-task-contract-v1");
  assert.equal(parsed.explicitGoal, "Add a deterministic internal task contract.");
  assert.equal(parsed.currentRepositoryState.headSha, "abcdef0123456789abcdef0123456789abcdef01");
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.currentRepositoryState), true);
  assert.equal(Object.isFrozen(parsed.acceptanceCriteria), true);
  assert.throws(() => {
    (parsed.allowedActions as string[]).push("Unexpected mutation");
  }, TypeError);
});

test("the V1 parser rejects unknown properties at every object layer", () => {
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ surprise: true })),
    /unknown propert(?:y|ies).*surprise/i,
  );

  const nested = {
    ...validContract(),
    currentRepositoryState: {
      ...validContract().currentRepositoryState,
      deployment: "production",
    },
  };
  assert.throws(
    () => parseEnaAgentTaskContractV1(nested),
    /currentRepositoryState.*unknown propert(?:y|ies).*deployment/i,
  );
});

test("the V1 parser accepts only plain JSON objects and never invokes accessors", () => {
  const inherited = Object.assign(Object.create({ inherited: true }), validContract());
  assert.throws(
    () => parseEnaAgentTaskContractV1(inherited),
    /plain JSON object/i,
  );

  const accessor = validContract();
  let invoked = false;
  Object.defineProperty(accessor, "explicitGoal", {
    enumerable: true,
    get() {
      invoked = true;
      return "Unsafe getter";
    },
  });
  assert.throws(
    () => parseEnaAgentTaskContractV1(accessor),
    /plain JSON object.*accessor/i,
  );
  assert.equal(invoked, false);
});

test("the V1 parser accepts only dense plain JSON arrays and never invokes array accessors", () => {
  const sparse = new Array<string>(1);
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ assumptions: sparse })),
    /assumptions.*dense plain JSON array/i,
  );

  const accessor = new Array<string>(1);
  let invoked = false;
  Object.defineProperty(accessor, "0", {
    enumerable: true,
    get() {
      invoked = true;
      return "Unsafe getter";
    },
  });
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ assumptions: accessor })),
    /assumptions.*dense plain JSON array.*accessor/i,
  );
  assert.equal(invoked, false);
});

test("the V1 parser rejects missing fields, wrong types, wrong enums, blank goals, and malformed SHAs", () => {
  const { requiredEvidence: _removed, ...missingRequiredEvidence } = validContract();
  assert.throws(
    () => parseEnaAgentTaskContractV1(missingRequiredEvidence),
    /requiredEvidence.*array/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ schemaVersion: "v2" })),
    /schemaVersion.*ena-agent-task-contract-v1/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ projectSurface: "other" })),
    /projectSurface.*ena-public-site.*open-ena.*jena-js.*j-3dena/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ operationMode: "review" })),
    /operationMode.*diagnose.*plan.*implement.*independent-review.*release-verify/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ maximumCompletionState: "DONE" })),
    /maximumCompletionState.*PLANNED.*PRODUCTION_READY/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ explicitGoal: "   " })),
    /explicitGoal.*nonblank/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ targetAudience: "maintainers" })),
    /targetAudience.*array/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({
      currentRepositoryState: {
        ...validContract().currentRepositoryState,
        dirtyPathsPresent: "false",
      },
    })),
    /dirtyPathsPresent.*boolean/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({
      currentRepositoryState: {
        ...validContract().currentRepositoryState,
        headSha: "deadbeef",
      },
    })),
    /headSha.*40.*64.*Git SHA/i,
  );
});

test("the V1 parser rejects an action that is both allowed and forbidden", () => {
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({
      allowedActions: ["  Deploy the application.  "],
      forbiddenActions: ["deploy the application."],
    })),
    /allowedActions.*forbiddenActions.*Deploy the application/i,
  );
});

test("the V1 parser rejects duplicate normalized list entries", () => {
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({
      authoritativeSources: ["Approved plan", "  Approved plan  "],
    })),
    /authoritativeSources.*duplicate.*Approved plan/i,
  );
});

test("the V1 parser rejects unbounded and unsafe text input", () => {
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ explicitGoal: "x".repeat(4_097) })),
    /explicitGoal.*4,?096/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ assumptions: Array.from({ length: 65 }, (_, index) => `A${index}`) })),
    /assumptions.*64/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ requiredCommands: ["npm test\nrm -rf unsafe"] })),
    /requiredCommands\[0\].*unsafe/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ explicitGoal: "Review\u202ethe contract" })),
    /explicitGoal.*unsafe/i,
  );
});

test("the exported JSON Schema is strict at every object layer", () => {
  const schema = ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA;

  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, Object.keys(validContract()));
  assert.deepEqual(schema.properties.projectSurface.enum, [
    "ena-public-site",
    "open-ena",
    "jena-js",
    "j-3dena",
  ]);
  assert.deepEqual(schema.properties.operationMode.enum, [
    "diagnose",
    "plan",
    "implement",
    "independent-review",
    "release-verify",
  ]);
  assert.deepEqual(schema.properties.maximumCompletionState.enum, [
    "PLANNED",
    "IMPLEMENTED_UNVERIFIED",
    "PARITY_CANDIDATE",
    "VERIFIED_PARITY",
    "PRODUCTION_CANDIDATE",
    "PRODUCTION_READY",
  ]);
  assert.equal(schema.properties.currentRepositoryState.type, "object");
  assert.equal(schema.properties.currentRepositoryState.additionalProperties, false);
  assert.deepEqual(schema.properties.currentRepositoryState.required, [
    "worktree",
    "branch",
    "headSha",
    "dirtyPathsPresent",
    "concurrentWritersKnown",
  ]);
});

test("the V1 compiler renders deterministic plain Markdown in stable section order", () => {
  const first = compileEnaAgentTaskContractV1(validContract());
  const second = compileEnaAgentTaskContractV1(structuredClone(validContract()));

  assert.deepEqual(second, first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.contract), true);
  assert.equal(renderEnaAgentTaskContractMarkdownV1(first.contract), first.markdown);
  assert.match(first.markdown, /^# ENA Agent Task Contract V1\n/u);
  assert.doesNotMatch(first.markdown, /<\/?[A-Za-z][^>]*>/u);
  assert.doesNotMatch(first.markdown, /\[COMPILATION_COMPLETE\]/u);

  const sections = [
    "## Contract metadata",
    "## Explicit goal",
    "## Non-goals",
    "## Target audience",
    "## Current repository state",
    "## Authoritative sources",
    "## Assumptions",
    "## Unresolved decisions",
    "## Allowed actions",
    "## Forbidden actions",
    "## Scientific invariants",
    "## Acceptance criteria",
    "## Required commands",
    "## Required evidence",
    "## Failure recovery",
    "## Stop conditions",
    "## Maximum completion state",
  ];
  let priorIndex = -1;
  for (const section of sections) {
    const index = first.markdown.indexOf(section);
    assert.equal(index > priorIndex, true, `${section} must follow the previous section`);
    priorIndex = index;
  }
});

test("the four V1 mode templates encode conservative default governance", () => {
  const templates = ENA_AGENT_OPERATION_MODE_TEMPLATES_V1;
  assert.deepEqual(Object.keys(templates), [
    "diagnose",
    "implement",
    "independent-review",
    "release-verify",
  ]);
  assert.equal(templates.diagnose.defaultMaximumCompletionState, "PLANNED");
  assert.match(templates.diagnose.forbiddenActions.join(" "), /modify files|repository mutation/i);
  assert.match(templates.implement.forbiddenActions.join(" "), /push/i);
  assert.match(templates.implement.forbiddenActions.join(" "), /merge/i);
  assert.match(templates.implement.forbiddenActions.join(" "), /deploy/i);
  assert.match(templates["independent-review"].forbiddenActions.join(" "), /modify the review candidate/i);
  assert.match(templates["independent-review"].forbiddenActions.join(" "), /self-approve/i);
  assert.deepEqual(templates["release-verify"].requiredEvidence, [
    "Local implementation evidence",
    "Local test evidence",
    "CI evidence",
    "GitHub state evidence",
    "Deployment evidence",
    "Live behavior evidence",
  ]);
  assert.equal(Object.isFrozen(templates), true);
  assert.equal(Object.isFrozen(templates["release-verify"].requiredEvidence), true);

  assert.equal(parseEnaAgentTaskContractV1(validContract({
    operationMode: "plan",
    maximumCompletionState: "PLANNED",
  })).operationMode, "plan");
});

test("the V1 compiler applies restrictive mode governance without expanding allowed actions", () => {
  const base = {
    allowedActions: [],
    forbiddenActions: [],
    scientificInvariants: [],
    requiredEvidence: [],
    stopConditions: [],
  };
  const diagnose = compileEnaAgentTaskContractV1(validContract({
    ...base,
    operationMode: "diagnose",
    maximumCompletionState: "PLANNED",
  })).contract;
  assert.deepEqual(diagnose.allowedActions, []);
  assert.match(diagnose.forbiddenActions.join(" "), /modify files|repository mutation/i);
  assert.equal(diagnose.maximumCompletionState, "PLANNED");
  assert.throws(
    () => compileEnaAgentTaskContractV1(validContract({
      ...base,
      operationMode: "diagnose",
      maximumCompletionState: "IMPLEMENTED_UNVERIFIED",
    })),
    /diagnose.*PLANNED/i,
  );

  const implement = compileEnaAgentTaskContractV1(validContract({ ...base })).contract;
  assert.deepEqual(implement.allowedActions, []);
  assert.match(implement.forbiddenActions.join(" "), /push/i);
  assert.match(implement.forbiddenActions.join(" "), /merge/i);
  assert.match(implement.forbiddenActions.join(" "), /deploy/i);

  const independentReview = compileEnaAgentTaskContractV1(validContract({
    ...base,
    operationMode: "independent-review",
    maximumCompletionState: "PARITY_CANDIDATE",
  })).contract;
  assert.match(independentReview.forbiddenActions.join(" "), /modify the review candidate/i);
  assert.match(independentReview.forbiddenActions.join(" "), /self-approve/i);

  const releaseVerify = compileEnaAgentTaskContractV1(validContract({
    ...base,
    operationMode: "release-verify",
    maximumCompletionState: "PRODUCTION_CANDIDATE",
  })).contract;
  assert.deepEqual(
    releaseVerify.requiredEvidence,
    ENA_AGENT_OPERATION_MODE_TEMPLATES_V1["release-verify"].requiredEvidence,
  );
});

test("the V1 compiler never infers scientific or release decisions from supplied evidence", () => {
  const compilation = compileEnaAgentTaskContractV1(validContract({
    operationMode: "release-verify",
    maximumCompletionState: "PLANNED",
    unresolvedDecisions: ["An authorized reviewer must decide scientific parity."],
    requiredEvidence: [
      "Local implementation evidence",
      "Local test evidence",
      "CI evidence",
      "GitHub state evidence",
      "Deployment evidence",
      "Live behavior evidence",
    ],
  }));

  assert.equal(compilation.contract.maximumCompletionState, "PLANNED");
  assert.deepEqual(
    compilation.contract.unresolvedDecisions,
    ["An authorized reviewer must decide scientific parity."],
  );
  assert.doesNotMatch(
    compilation.markdown,
    /## Maximum completion state\nPRODUCTION_READY/u,
  );
});
