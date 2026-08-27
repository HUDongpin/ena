import assert from "node:assert/strict";
import test from "node:test";
import {
  compileEnaAgentTaskContractV1,
  ENA_AGENT_ALLOWED_ACTIONS_V1,
  ENA_AGENT_OPERATION_ALLOWED_ACTIONS_V1,
  ENA_AGENT_OPERATION_MODE_TEMPLATES_V1,
  ENA_AGENT_TASK_CONTRACT_SCHEMA_VERSION,
  ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA,
  parseEnaAgentTaskContractV1,
  renderEnaAgentTaskContractMarkdownV1,
  type EnaAgentAllowedActionV1,
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
    allowedActions: ["edit-authorized-scope"],
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

test("the V1 parser requires every root and repository-state field to be an own data property", () => {
  const exerciseInheritedField = (
    field: string,
    descriptor: PropertyDescriptor,
    contract: Record<string, unknown>,
    expectedLabel: RegExp,
  ) => {
    assert.equal(Object.getOwnPropertyDescriptor(Object.prototype, field), undefined);
    Object.defineProperty(Object.prototype, field, {
      configurable: true,
      enumerable: true,
      ...descriptor,
    });
    try {
      assert.throws(
        () => parseEnaAgentTaskContractV1(contract),
        expectedLabel,
      );
    } finally {
      Reflect.deleteProperty(Object.prototype, field);
    }
  };

  const { requiredEvidence: _rootInheritedValue, ...rootWithInheritedValue } = validContract();
  exerciseInheritedField(
    "requiredEvidence",
    { value: ["Inherited evidence"] },
    rootWithInheritedValue,
    /requiredEvidence.*own enumerable data property/i,
  );

  let rootGetterInvocations = 0;
  const { explicitGoal: _rootInheritedGetter, ...rootWithInheritedGetter } = validContract();
  exerciseInheritedField(
    "explicitGoal",
    {
      get() {
        rootGetterInvocations += 1;
        return "Inherited goal";
      },
    },
    rootWithInheritedGetter,
    /explicitGoal.*own enumerable data property/i,
  );
  assert.equal(rootGetterInvocations, 0);

  const {
    worktree: _nestedInheritedValue,
    ...repositoryStateWithInheritedValue
  } = validContract().currentRepositoryState;
  const nestedWithInheritedValue = validContract({
    currentRepositoryState: repositoryStateWithInheritedValue,
  });
  exerciseInheritedField(
    "worktree",
    { value: "/inherited/worktree" },
    nestedWithInheritedValue,
    /currentRepositoryState\.worktree.*own enumerable data property/i,
  );

  let nestedGetterInvocations = 0;
  const {
    branch: _nestedInheritedGetter,
    ...repositoryStateWithInheritedGetter
  } = validContract().currentRepositoryState;
  const nestedWithInheritedGetter = validContract({
    currentRepositoryState: repositoryStateWithInheritedGetter,
  });
  exerciseInheritedField(
    "branch",
    {
      get() {
        nestedGetterInvocations += 1;
        return "inherited/branch";
      },
    },
    nestedWithInheritedGetter,
    /currentRepositoryState\.branch.*own enumerable data property/i,
  );
  assert.equal(nestedGetterInvocations, 0);
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
    /requiredEvidence.*own enumerable data property/i,
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
      allowedActions: ["edit-authorized-scope"],
      forbiddenActions: ["edit-authorized-scope"],
    })),
    /allowedActions.*forbiddenActions.*edit-authorized-scope/i,
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

test("the V1 parser and JSON Schema reject raw unsafe code points before normalization", () => {
  const explicitGoalPattern = new RegExp(
    ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA.properties.explicitGoal.pattern,
    "u",
  );
  const listEntryPattern = new RegExp(
    ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA.properties.assumptions.items.pattern,
    "u",
  );
  const unsafeValues = [
    "\tGoal",
    "Goal\t",
    "\nGoal",
    "Goal\n",
    "\u2028Goal",
    "Goal\u2028",
    "\ufeffGoal",
    "Goal\ufeff",
    "\u061cGoal",
    "Goal\u061c",
  ];

  for (const unsafeValue of unsafeValues) {
    assert.equal(explicitGoalPattern.test(unsafeValue), false);
    assert.equal(listEntryPattern.test(unsafeValue), false);
    assert.throws(
      () => parseEnaAgentTaskContractV1(validContract({ explicitGoal: unsafeValue })),
      /explicitGoal.*unsafe control or formatting characters/i,
    );
    assert.throws(
      () => parseEnaAgentTaskContractV1(validContract({ assumptions: [unsafeValue] })),
      /assumptions\[0\].*unsafe control or formatting characters/i,
    );
  }

  assert.equal(explicitGoalPattern.test("  Goal with ordinary spaces  "), true);
  assert.equal(
    parseEnaAgentTaskContractV1(validContract({ explicitGoal: "  Goal with ordinary spaces  " }))
      .explicitGoal,
    "Goal with ordinary spaces",
  );
});

test("the V1 parser enforces schema string limits by Unicode code points", () => {
  const astralEmoji = "😀";
  const listBoundary = astralEmoji.repeat(1_024);
  const goalBoundary = astralEmoji.repeat(4_096);

  assert.equal(Array.from(listBoundary).length, 1_024);
  assert.equal(Array.from(goalBoundary).length, 4_096);
  assert.equal(
    parseEnaAgentTaskContractV1(validContract({ assumptions: [listBoundary] })).assumptions[0],
    listBoundary,
  );
  assert.equal(
    parseEnaAgentTaskContractV1(validContract({ explicitGoal: goalBoundary })).explicitGoal,
    goalBoundary,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({
      assumptions: [astralEmoji.repeat(1_025)],
    })),
    /assumptions\[0\].*1,?024/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({
      explicitGoal: astralEmoji.repeat(4_097),
    })),
    /explicitGoal.*4,?096/i,
  );
  assert.equal(
    ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA.properties.assumptions.items.maxLength,
    1_024,
  );
  assert.equal(
    ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA.properties.explicitGoal.maxLength,
    4_096,
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

test("allowedActions uses one closed V1 capability vocabulary in TypeScript, parsing, and schema", () => {
  const expected = [
    "inspect-repository-state",
    "inspect-authoritative-sources",
    "run-read-only-diagnostics",
    "edit-authorized-scope",
    "run-local-verification",
    "create-local-commit",
    "inspect-review-candidate",
    "run-independent-verification",
    "inspect-local-implementation-evidence",
    "inspect-local-test-evidence",
    "inspect-ci-evidence",
    "inspect-github-evidence",
    "inspect-deployment-evidence",
    "inspect-live-behavior-evidence",
    "report-findings-and-gaps",
  ] as const;
  const typedAction: EnaAgentAllowedActionV1 = "inspect-repository-state";

  assert.equal(typedAction, expected[0]);
  assert.deepEqual(ENA_AGENT_ALLOWED_ACTIONS_V1, expected);
  assert.deepEqual(
    ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA.properties.allowedActions.items.enum,
    expected,
  );
  assert.deepEqual(
    parseEnaAgentTaskContractV1(validContract({ allowedActions: [...expected] })).allowedActions,
    expected,
  );

  for (const bypass of [
    "Delete files.",
    "Create files.",
    "Automatically deploy.",
    "Redeploy the application.",
    "Approve own candidate.",
    "Configure provider.",
    "CI evidence proves live behavior.",
    "Push",
    "Merge",
    "Deploy",
    "Publish",
    " edit-authorized-scope ",
  ]) {
    assert.throws(
      () => parseEnaAgentTaskContractV1(validContract({ allowedActions: [bypass] })),
      /allowedActions\[0\].*must be one of/i,
      `closed action vocabulary must reject: ${bypass}`,
    );
  }
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

test("the V1 renderer preserves section structure around fence, HTML, heading, and marker text", () => {
  const compilation = compileEnaAgentTaskContractV1(validContract({
    explicitGoal: "~~~",
    nonGoals: [
      "~~~ untrusted tilde fence",
      "``` untrusted backtick fence",
      "<agent-task>HTML-ish wrapper</agent-task>",
      "# Injected heading",
      "[COMPILATION_COMPLETE]",
    ],
  }));
  const lines = compilation.markdown.split("\n");
  const rawFence = /^(?: {0,3})(?:[-+*]\s+)?(?:`{3,}|~{3,})(?:\s.*)?$/u;

  assert.equal(lines.some((line) => rawFence.test(line)), false);
  assert.doesNotMatch(compilation.markdown, /<\/?agent-task>/u);
  assert.doesNotMatch(compilation.markdown, /(?:^|\n)# Injected heading(?:\n|$)/u);
  assert.doesNotMatch(compilation.markdown, /\[COMPILATION_COMPLETE\]/u);
  assert.match(compilation.markdown, /\\~\\~\\~/u);
  assert.match(compilation.markdown, /\\`\\`\\`/u);
  assert.match(compilation.markdown, /&lt;agent-task&gt;HTML-ish wrapper&lt;\/agent-task&gt;/u);
  for (const section of [
    "## Explicit goal",
    "## Non-goals",
    "## Current repository state",
    "## Required evidence",
    "## Maximum completion state",
  ]) {
    assert.equal(lines.filter((line) => line === section).length, 1);
  }
});

test("the V1 renderer escapes caller hyphens that could create Markdown block structure", () => {
  const compilation = compileEnaAgentTaskContractV1(validContract({
    explicitGoal: "---",
    nonGoals: ["- nested", "---"],
  }));
  const lines = compilation.markdown.split("\n");

  assert.match(compilation.markdown, /## Explicit goal\n\\---/u);
  assert.match(compilation.markdown, /## Non-goals\n- \\- nested\n- \\---/u);
  assert.equal(lines.some((line) => /^ {0,3}(?:-\s*){3,}$/u.test(line)), false);
  assert.equal(lines.some((line) => /^ {0,3}-\s+-\s+/u.test(line)), false);
  for (const section of [
    "## Current repository state",
    "## Required evidence",
    "## Failure recovery",
    "## Stop conditions",
    "## Maximum completion state",
  ]) {
    assert.equal(lines.filter((line) => line === section).length, 1);
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

test("the V1 compiler enforces the complete operation-mode capability matrix", () => {
  const expectedMatrix = {
    diagnose: [
      "inspect-repository-state",
      "inspect-authoritative-sources",
      "run-read-only-diagnostics",
      "report-findings-and-gaps",
    ],
    plan: [
      "inspect-repository-state",
      "inspect-authoritative-sources",
      "report-findings-and-gaps",
    ],
    implement: [
      "inspect-repository-state",
      "inspect-authoritative-sources",
      "edit-authorized-scope",
      "run-local-verification",
      "create-local-commit",
      "report-findings-and-gaps",
    ],
    "independent-review": [
      "inspect-authoritative-sources",
      "inspect-review-candidate",
      "run-independent-verification",
      "report-findings-and-gaps",
    ],
    "release-verify": [
      "inspect-local-implementation-evidence",
      "inspect-local-test-evidence",
      "inspect-ci-evidence",
      "inspect-github-evidence",
      "inspect-deployment-evidence",
      "inspect-live-behavior-evidence",
      "report-findings-and-gaps",
    ],
  } as const;
  const ceilings = {
    diagnose: "PLANNED",
    plan: "PLANNED",
    implement: "IMPLEMENTED_UNVERIFIED",
    "independent-review": "PARITY_CANDIDATE",
    "release-verify": "PRODUCTION_CANDIDATE",
  } as const;
  const modes = [
    "diagnose",
    "plan",
    "implement",
    "independent-review",
    "release-verify",
  ] as const;

  assert.deepEqual(ENA_AGENT_OPERATION_ALLOWED_ACTIONS_V1, expectedMatrix);
  for (const mode of [
    "diagnose",
    "implement",
    "independent-review",
    "release-verify",
  ] as const) {
    assert.deepEqual(ENA_AGENT_OPERATION_MODE_TEMPLATES_V1[mode].allowedActions, expectedMatrix[mode]);
  }

  for (const operationMode of modes) {
    const permitted = new Set<string>(expectedMatrix[operationMode]);
    for (const action of ENA_AGENT_ALLOWED_ACTIONS_V1) {
      const compile = () => compileEnaAgentTaskContractV1(validContract({
        operationMode,
        maximumCompletionState: ceilings[operationMode],
        allowedActions: [action],
        forbiddenActions: [],
      }));
      if (permitted.has(action)) {
        assert.deepEqual(compile().contract.allowedActions, [action]);
      } else {
        assert.throws(
          compile,
          new RegExp(`${operationMode}.*allowedActions\\[0\\].*not permitted`, "i"),
          `${operationMode} must reject globally valid capability: ${action}`,
        );
      }
    }
  }
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

test("the V1 compiler reserves schema capacity for required mode governance", () => {
  const releaseContract = (requiredEvidence: string[]) => validContract({
    operationMode: "release-verify",
    maximumCompletionState: "PRODUCTION_CANDIDATE",
    allowedActions: ["inspect-ci-evidence"],
    forbiddenActions: [],
    scientificInvariants: [],
    requiredEvidence,
    stopConditions: [],
  });
  const sixtyFourCallerItems = Array.from(
    { length: 64 },
    (_, index) => `Caller evidence ${index + 1}`,
  );

  assert.equal(
    ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA.properties.requiredEvidence.maxItems,
    64,
  );
  assert.equal(
    parseEnaAgentTaskContractV1(releaseContract(sixtyFourCallerItems)).requiredEvidence.length,
    64,
  );
  assert.throws(
    () => compileEnaAgentTaskContractV1(releaseContract(sixtyFourCallerItems)),
    /release-verify.*requiredEvidence.*capacity.*required governance.*70 items.*64-item schema maximum/i,
  );

  const fiftyEightCallerItems = sixtyFourCallerItems.slice(0, 58);
  const compiledAtBoundary = compileEnaAgentTaskContractV1(
    releaseContract(fiftyEightCallerItems),
  ).contract;
  assert.equal(compiledAtBoundary.requiredEvidence.length, 64);
  assert.deepEqual(
    compiledAtBoundary.requiredEvidence.slice(0, 6),
    ENA_AGENT_OPERATION_MODE_TEMPLATES_V1["release-verify"].requiredEvidence,
  );
  assert.deepEqual(
    parseEnaAgentTaskContractV1(compiledAtBoundary),
    compiledAtBoundary,
  );
});

test("the V1 compiler never infers scientific or release decisions from supplied evidence", () => {
  const compilation = compileEnaAgentTaskContractV1(validContract({
    operationMode: "release-verify",
    maximumCompletionState: "PLANNED",
    allowedActions: ["inspect-ci-evidence"],
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
