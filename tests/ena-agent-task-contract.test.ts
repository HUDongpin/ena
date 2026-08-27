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
    allowedActions: ["edit-authorized-scope", "run-local-verification"],
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

test("unknown-property diagnostics are single-line, bounded, and report the full unknown count", () => {
  const polluted = validContract();
  const unsafeName = "\nline\rseparator\u2028\u{e0020}";
  const oversizedName = `!${"x".repeat(5_000)}`;
  Object.assign(polluted, {
    [unsafeName]: true,
    [oversizedName]: true,
    ...Object.fromEntries(
      Array.from({ length: 18 }, (_, index) => [`unknown-${String(index).padStart(2, "0")}`, true]),
    ),
  });

  let thrown: unknown;
  try {
    parseEnaAgentTaskContractV1(polluted);
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof Error);
  assert.match(thrown.message, /unknown properties.*20 total/i);
  assert.match(thrown.message, /showing (?:the first )?8/i);
  assert.match(thrown.message, /\(\+12 more\)/i);
  assert.match(thrown.message, /\\nline\\rseparator\\u2028\\u\{e0020\}/i);
  assert.doesNotMatch(thrown.message, /[\n\r\u2028\u2029]/u);
  assert.equal(thrown.message.length < 1_024, true);
  assert.doesNotMatch(thrown.message, /x{100}/u);
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

test("the V1 parser rejects live and revoked Proxies before any trap can run", () => {
  const trapCounts = {
    get: 0,
    getOwnPropertyDescriptor: 0,
    getPrototypeOf: 0,
    ownKeys: 0,
  };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, property, receiver) {
      trapCounts.get += 1;
      return Reflect.get(target, property, receiver);
    },
    getOwnPropertyDescriptor(target, property) {
      trapCounts.getOwnPropertyDescriptor += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    getPrototypeOf(target) {
      trapCounts.getPrototypeOf += 1;
      return Reflect.getPrototypeOf(target);
    },
    ownKeys(target) {
      trapCounts.ownKeys += 1;
      return Reflect.ownKeys(target);
    },
  };

  assert.throws(
    () => parseEnaAgentTaskContractV1(new Proxy(validContract(), handler)),
    /Proxy.*not permitted|plain JSON.*Proxy/i,
  );
  assert.deepEqual(trapCounts, {
    get: 0,
    getOwnPropertyDescriptor: 0,
    getPrototypeOf: 0,
    ownKeys: 0,
  });

  const nestedTrapCounts = { get: 0, getPrototypeOf: 0, ownKeys: 0 };
  const nestedProxy = new Proxy(validContract().currentRepositoryState, {
    get(target, property, receiver) {
      nestedTrapCounts.get += 1;
      return Reflect.get(target, property, receiver);
    },
    getPrototypeOf(target) {
      nestedTrapCounts.getPrototypeOf += 1;
      return Reflect.getPrototypeOf(target);
    },
    ownKeys(target) {
      nestedTrapCounts.ownKeys += 1;
      return Reflect.ownKeys(target);
    },
  });
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ currentRepositoryState: nestedProxy })),
    /currentRepositoryState.*Proxy/i,
  );
  assert.deepEqual(nestedTrapCounts, { get: 0, getPrototypeOf: 0, ownKeys: 0 });

  let arrayTraps = 0;
  const proxiedList = new Proxy(["Approved plan"], {
    get(target, property, receiver) {
      arrayTraps += 1;
      return Reflect.get(target, property, receiver);
    },
    getOwnPropertyDescriptor(target, property) {
      arrayTraps += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    getPrototypeOf(target) {
      arrayTraps += 1;
      return Reflect.getPrototypeOf(target);
    },
    ownKeys(target) {
      arrayTraps += 1;
      return Reflect.ownKeys(target);
    },
  });
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ assumptions: proxiedList })),
    /assumptions.*Proxy/i,
  );
  assert.equal(arrayTraps, 0);

  const revoked = Proxy.revocable(validContract(), {});
  revoked.revoke();
  assert.throws(
    () => parseEnaAgentTaskContractV1(revoked.proxy),
    /Proxy.*not permitted|plain JSON.*Proxy/i,
  );
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

test("headSha parsing matches the Schema and never trims boundary whitespace", () => {
  const sha40 = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
  const sha64 = `${sha40}ABCDEF0123456789ABCDEF01`;
  const shaPattern = new RegExp(
    ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA.properties.currentRepositoryState.properties.headSha.pattern,
    "u",
  );

  for (const sha of [sha40, sha64]) {
    assert.equal(shaPattern.test(sha), true);
    assert.equal(
      parseEnaAgentTaskContractV1(validContract({
        currentRepositoryState: {
          ...validContract().currentRepositoryState,
          headSha: sha,
        },
      })).currentRepositoryState.headSha,
      sha.toLowerCase(),
    );

    for (const boundaryWhitespace of [` ${sha}`, `${sha} `]) {
      assert.equal(shaPattern.test(boundaryWhitespace), false);
      assert.throws(
        () => parseEnaAgentTaskContractV1(validContract({
          currentRepositoryState: {
            ...validContract().currentRepositoryState,
            headSha: boundaryWhitespace,
          },
        })),
        /headSha.*40.*64.*Git SHA/i,
      );
    }
  }
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

test("required commands never grant verification authority", () => {
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({
      allowedActions: ["edit-authorized-scope"],
      requiredCommands: ["node --import tsx --test tests/ena-agent-task-contract.test.ts"],
    })),
    /requiredCommands\[0\].*run-local-verification.*explicit allowedActions/i,
  );
});

test("required commands reject shell execution features and mutation families in every governed mode", () => {
  const modes = [
    {
      operationMode: "diagnose",
      maximumCompletionState: "PLANNED",
      allowedActions: ["inspect-repository-state"],
    },
    {
      operationMode: "plan",
      maximumCompletionState: "PLANNED",
      allowedActions: ["inspect-repository-state"],
    },
    {
      operationMode: "independent-review",
      maximumCompletionState: "PARITY_CANDIDATE",
      allowedActions: ["inspect-review-candidate"],
    },
    {
      operationMode: "release-verify",
      maximumCompletionState: "PRODUCTION_CANDIDATE",
      allowedActions: ["inspect-local-implementation-evidence"],
    },
  ] as const;
  const rejectedCommands = [
    "git add lib/prompt-governance/agent-task-contract.ts",
    "git commit -m review",
    "git push origin main",
    "git merge main",
    "git restore lib/prompt-governance/agent-task-contract.ts",
    "npm run deploy",
    "git status && git push origin main",
    "git status; git push origin main",
    "git status | tee status.txt",
    "git status > status.txt",
    "$(git status)",
    "`git status`",
    "rg --pre processor pattern .",
    "rg -n pattern /etc/passwd",
    "rg --files ../../outside",
    "node --eval console.log",
    "node --import tsx --test tests/../outside.test.ts",
    "node --import tsx --test tests/nested/../../outside.test.ts",
  ];

  for (const mode of modes) {
    for (const command of rejectedCommands) {
      assert.throws(
        () => compileEnaAgentTaskContractV1(validContract({
          ...mode,
          requiredCommands: [command],
          forbiddenActions: [],
        })),
        /requiredCommands\[0\].*(?:unsupported|not permitted|shell)/i,
        `${mode.operationMode} must reject: ${command}`,
      );
    }
  }
});

test("required commands accept only closed read-only and verification families with explicit capabilities", () => {
  const accepted = [
    {
      operationMode: "diagnose",
      maximumCompletionState: "PLANNED",
      allowedActions: ["inspect-repository-state"],
      command: "git status --short",
    },
    {
      operationMode: "diagnose",
      maximumCompletionState: "PLANNED",
      allowedActions: ["inspect-authoritative-sources"],
      command: "rg -n requiredCommands lib/prompt-governance/agent-task-contract.ts",
    },
    {
      operationMode: "diagnose",
      maximumCompletionState: "PLANNED",
      allowedActions: ["run-read-only-diagnostics"],
      command: "node --import tsx --test tests/ena-agent-task-contract.test.ts",
    },
    {
      operationMode: "plan",
      maximumCompletionState: "PLANNED",
      allowedActions: ["inspect-repository-state"],
      command: "git rev-parse --short HEAD",
    },
    {
      operationMode: "implement",
      maximumCompletionState: "IMPLEMENTED_UNVERIFIED",
      allowedActions: ["inspect-repository-state"],
      command: "git diff --check",
    },
    ...[
      "npm test",
      "npm run test",
      "npm run test:app",
      "npm run typecheck",
      "npm run typecheck:app",
      "npm run build",
      "npm run build:app",
      "npm run verify",
      "npm run prompt:verify",
      "npm run test:browser:longitudinal-v3",
      "npm run test:browser --workspace=jena-js",
    ].map(
      (command) => ({
        operationMode: "implement" as const,
        maximumCompletionState: "IMPLEMENTED_UNVERIFIED" as const,
        allowedActions: ["run-local-verification"] as const,
        command,
      }),
    ),
    {
      operationMode: "independent-review",
      maximumCompletionState: "PARITY_CANDIDATE",
      allowedActions: ["inspect-review-candidate"],
      command: "git show --stat HEAD",
    },
    {
      operationMode: "independent-review",
      maximumCompletionState: "PARITY_CANDIDATE",
      allowedActions: ["run-independent-verification"],
      command: "node --import tsx --test tests/ena-agent-task-contract.test.ts",
    },
    {
      operationMode: "release-verify",
      maximumCompletionState: "PRODUCTION_CANDIDATE",
      allowedActions: ["inspect-local-implementation-evidence"],
      command: "git log --oneline --max-count=5",
    },
    {
      operationMode: "release-verify",
      maximumCompletionState: "PRODUCTION_CANDIDATE",
      allowedActions: ["run-independent-verification"],
      command: "npm run verify",
    },
  ] as const;

  for (const testCase of accepted) {
    const { command, ...contractOverrides } = testCase;
    const compiled = compileEnaAgentTaskContractV1(validContract({
      ...contractOverrides,
      requiredCommands: [command],
      forbiddenActions: [],
    }));
    assert.deepEqual(compiled.contract.requiredCommands, [command]);
  }

  for (const command of [
    "git status --short",
    "rg -n requiredCommands lib/prompt-governance/agent-task-contract.ts",
    "npm run verify",
  ]) {
    assert.throws(
      () => parseEnaAgentTaskContractV1(validContract({
        allowedActions: ["report-findings-and-gaps"],
        requiredCommands: [command],
      })),
      /requiredCommands\[0\].*explicit allowedActions.*never grant authority/i,
      `missing capability must reject: ${command}`,
    );
  }
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

  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({
      explicitGoal: `${"x".repeat(8_193)}\u202e`,
    })),
    /explicitGoal.*4,?096/i,
  );
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({
      assumptions: [`${"x".repeat(2_049)}\u202e`],
    })),
    /assumptions\[0\].*1,?024/i,
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

test("the V1 parser and JSON Schema reject every task-contract TAG and stealth-format character", () => {
  const explicitGoalPattern = new RegExp(
    ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA.properties.explicitGoal.pattern,
    "u",
  );
  const listEntryPattern = new RegExp(
    ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA.properties.assumptions.items.pattern,
    "u",
  );
  const unsafeCodePoints = [
    0x00ad,
    0x180e,
    0xe0001,
    ...Array.from({ length: 0xe007f - 0xe0020 + 1 }, (_, index) => 0xe0020 + index),
  ];

  for (const codePoint of unsafeCodePoints) {
    const unsafe = String.fromCodePoint(codePoint);
    for (const unsafeValue of [`${unsafe}Goal`, `Go${unsafe}al`, `Goal${unsafe}`]) {
      assert.equal(explicitGoalPattern.test(unsafeValue), false, `U+${codePoint.toString(16)}`);
      assert.equal(listEntryPattern.test(unsafeValue), false, `U+${codePoint.toString(16)}`);
      assert.throws(
        () => parseEnaAgentTaskContractV1(validContract({ explicitGoal: unsafeValue })),
        /explicitGoal.*unsafe control or formatting characters/i,
      );
      assert.throws(
        () => parseEnaAgentTaskContractV1(validContract({ assumptions: [unsafeValue] })),
        /assumptions\[0\].*unsafe control or formatting characters/i,
      );
    }
  }

  for (const validVariationSequence of ["Travel ✈\ufe0f plan", "Ideograph 漢\u{e0100} review"]) {
    assert.equal(explicitGoalPattern.test(validVariationSequence), true);
    assert.equal(listEntryPattern.test(validVariationSequence), true);
    assert.equal(
      parseEnaAgentTaskContractV1(validContract({ explicitGoal: validVariationSequence }))
        .explicitGoal,
      validVariationSequence,
    );
  }
});

test("the V1 parser and JSON Schema reject every tested control category and lone surrogate", () => {
  const explicitGoalPattern = new RegExp(
    ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA.properties.explicitGoal.pattern,
    "u",
  );
  const listEntryPattern = new RegExp(
    ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA.properties.assumptions.items.pattern,
    "u",
  );
  const unsafeCodeUnitsOrPoints = [
    0x034f,
    0x0600,
    0x070f,
    0x115f,
    0x1160,
    0x17b4,
    0x17b5,
    0x1bca0,
    0x3164,
    0x13430,
    0xffa0,
    0xfff9,
    0x110bd,
    0xd800,
    0xdbff,
    0xdc00,
    0xdfff,
  ];

  for (const codePoint of unsafeCodeUnitsOrPoints) {
    const unsafe = codePoint >= 0xd800 && codePoint <= 0xdfff
      ? String.fromCharCode(codePoint)
      : String.fromCodePoint(codePoint);
    for (const unsafeValue of [`${unsafe}Goal`, `Go${unsafe}al`, `Goal${unsafe}`]) {
      const label = `U+${codePoint.toString(16).toUpperCase()}`;
      assert.equal(explicitGoalPattern.test(unsafeValue), false, label);
      assert.equal(listEntryPattern.test(unsafeValue), false, label);
      assert.throws(
        () => parseEnaAgentTaskContractV1(validContract({ explicitGoal: unsafeValue })),
        /explicitGoal.*unsafe control or formatting characters/i,
      );
      assert.throws(
        () => parseEnaAgentTaskContractV1(validContract({ assumptions: [unsafeValue] })),
        /assumptions\[0\].*unsafe control or formatting characters/i,
      );
    }
  }

  for (const surrogate of ["\ud800", "\udbff", "\udc00", "\udfff"]) {
    assert.throws(
      () => parseEnaAgentTaskContractV1(validContract({
        currentRepositoryState: {
          ...validContract().currentRepositoryState,
          worktree: `/repo/${surrogate}/worktree`,
        },
      })),
      /currentRepositoryState\.worktree.*unsafe/i,
    );
    assert.throws(
      () => parseEnaAgentTaskContractV1(validContract({
        currentRepositoryState: {
          ...validContract().currentRepositoryState,
          branch: `codex/${surrogate}/branch`,
        },
      })),
      /currentRepositoryState\.branch.*unsafe/i,
    );
  }

  const loneSurrogate: string = ["A", "\ud800", "B"].join("");
  const replacementCharacter: string = ["A", "\ufffd", "B"].join("");
  assert.equal(loneSurrogate === replacementCharacter, false);
  assert.deepEqual(Buffer.from(loneSurrogate), Buffer.from(replacementCharacter));
  assert.throws(
    () => parseEnaAgentTaskContractV1(validContract({ explicitGoal: loneSurrogate })),
    /explicitGoal.*unsafe/i,
  );
  assert.equal(
    parseEnaAgentTaskContractV1(validContract({ explicitGoal: replacementCharacter })).explicitGoal,
    replacementCharacter,
  );

  for (const validText of ["Astral 😀 input", "Travel ✈\ufe0f plan", "Ideograph 漢\u{e0100} review"]) {
    assert.equal(explicitGoalPattern.test(validText), true);
    assert.equal(parseEnaAgentTaskContractV1(validContract({ explicitGoal: validText })).explicitGoal, validText);
  }
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
      "run-independent-verification",
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
        requiredCommands: [],
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
    requiredCommands: [],
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
    requiredCommands: [],
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
    requiredCommands: [],
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
