export const ENA_AGENT_TASK_CONTRACT_SCHEMA_VERSION = "ena-agent-task-contract-v1" as const;

export const ENA_AGENT_PROJECT_SURFACES = [
  "ena-public-site",
  "open-ena",
  "jena-js",
  "j-3dena",
] as const;

export const ENA_AGENT_OPERATION_MODES = [
  "diagnose",
  "plan",
  "implement",
  "independent-review",
  "release-verify",
] as const;

export const ENA_AGENT_MAXIMUM_COMPLETION_STATES = [
  "PLANNED",
  "IMPLEMENTED_UNVERIFIED",
  "PARITY_CANDIDATE",
  "VERIFIED_PARITY",
  "PRODUCTION_CANDIDATE",
  "PRODUCTION_READY",
] as const;

export type EnaAgentProjectSurfaceV1 = typeof ENA_AGENT_PROJECT_SURFACES[number];
export type EnaAgentOperationModeV1 = typeof ENA_AGENT_OPERATION_MODES[number];
export type EnaAgentMaximumCompletionStateV1 = typeof ENA_AGENT_MAXIMUM_COMPLETION_STATES[number];

export interface EnaAgentCurrentRepositoryStateV1 {
  readonly worktree: string;
  readonly branch: string;
  readonly headSha: string;
  readonly dirtyPathsPresent: boolean;
  readonly concurrentWritersKnown: boolean;
}

export interface EnaAgentTaskContractV1 {
  readonly schemaVersion: typeof ENA_AGENT_TASK_CONTRACT_SCHEMA_VERSION;
  readonly projectSurface: EnaAgentProjectSurfaceV1;
  readonly operationMode: EnaAgentOperationModeV1;
  readonly explicitGoal: string;
  readonly nonGoals: readonly string[];
  readonly targetAudience: readonly string[];
  readonly currentRepositoryState: EnaAgentCurrentRepositoryStateV1;
  readonly authoritativeSources: readonly string[];
  readonly assumptions: readonly string[];
  readonly unresolvedDecisions: readonly string[];
  readonly allowedActions: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly scientificInvariants: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly requiredCommands: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly failureRecovery: readonly string[];
  readonly stopConditions: readonly string[];
  readonly maximumCompletionState: EnaAgentMaximumCompletionStateV1;
}

export interface EnaAgentTaskCompilationV1 {
  readonly contract: EnaAgentTaskContractV1;
  readonly markdown: string;
}

export type EnaAgentGovernedOperationModeV1 = Exclude<EnaAgentOperationModeV1, "plan">;

export interface EnaAgentOperationModeTemplateV1 {
  readonly operationMode: EnaAgentGovernedOperationModeV1;
  readonly defaultMaximumCompletionState: EnaAgentMaximumCompletionStateV1;
  readonly allowedActions: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly scientificInvariants: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly stopConditions: readonly string[];
}

export const ENA_AGENT_OPERATION_MODE_TEMPLATES_V1 = deepFreeze({
  diagnose: {
    operationMode: "diagnose",
    defaultMaximumCompletionState: "PLANNED",
    allowedActions: [
      "Inspect repository state and supplied evidence read-only.",
      "Run non-mutating diagnostic commands.",
      "Report evidence-backed findings, uncertainty, and the next decision required.",
    ],
    forbiddenActions: [
      "Modify files or repository state.",
      "Perform any repository mutation.",
      "Commit, push, merge, deploy, or publish changes.",
    ],
    scientificInvariants: [
      "Do not infer or change scientific methods, results, thresholds, parity, or approval during diagnosis.",
    ],
    requiredEvidence: [
      "Current repository-state evidence",
      "Diagnostic command evidence",
    ],
    stopConditions: [
      "Stop before any mutation or completion claim beyond PLANNED.",
    ],
  },
  implement: {
    operationMode: "implement",
    defaultMaximumCompletionState: "IMPLEMENTED_UNVERIFIED",
    allowedActions: [
      "Modify only files inside the explicitly authorized implementation scope.",
      "Run local verification commands for the implemented scope.",
      "Create a local commit only when the task explicitly authorizes it.",
    ],
    forbiddenActions: [
      "Do not push commits or branches.",
      "Do not merge branches or pull requests.",
      "Do not deploy or publish artifacts.",
    ],
    scientificInvariants: [
      "Do not change scientific methods, thresholds, interpretations, or authority without an explicit approved decision.",
    ],
    requiredEvidence: [
      "Scoped diff evidence",
      "Local test evidence",
    ],
    stopConditions: [
      "Stop at the explicit completion-state ceiling before push, merge, deployment, or publication.",
    ],
  },
  "independent-review": {
    operationMode: "independent-review",
    defaultMaximumCompletionState: "PARITY_CANDIDATE",
    allowedActions: [
      "Inspect the review candidate read-only.",
      "Run independent verification without changing the candidate.",
      "Report findings and unresolved evidence gaps.",
    ],
    forbiddenActions: [
      "Do not modify the review candidate.",
      "Do not self-approve the review candidate or waive unresolved findings.",
      "Do not merge, deploy, or publish the review candidate.",
    ],
    scientificInvariants: [
      "Independent review supplies evidence; it does not create scientific authority or approval.",
    ],
    requiredEvidence: [
      "Candidate identity evidence",
      "Independent verification evidence",
      "Finding disposition evidence",
    ],
    stopConditions: [
      "Stop when review would require modifying or approving the candidate.",
    ],
  },
  "release-verify": {
    operationMode: "release-verify",
    defaultMaximumCompletionState: "PRODUCTION_CANDIDATE",
    allowedActions: [
      "Inspect each release evidence plane independently.",
      "Report the highest completion state directly supported by current evidence.",
    ],
    forbiddenActions: [
      "Do not treat evidence from one plane as proof of another plane.",
      "Do not push, merge, deploy, publish, or change provider configuration while verifying.",
      "Do not infer release authorization or production readiness from missing evidence.",
    ],
    scientificInvariants: [
      "Release verification does not establish scientific parity without its own authorized evidence.",
    ],
    requiredEvidence: [
      "Local implementation evidence",
      "Local test evidence",
      "CI evidence",
      "GitHub state evidence",
      "Deployment evidence",
      "Live behavior evidence",
    ],
    stopConditions: [
      "Stop before mutation or any completion claim unsupported by all required evidence planes.",
    ],
  },
} as const satisfies Record<EnaAgentGovernedOperationModeV1, EnaAgentOperationModeTemplateV1>);

const CONTRACT_KEYS = [
  "schemaVersion",
  "projectSurface",
  "operationMode",
  "explicitGoal",
  "nonGoals",
  "targetAudience",
  "currentRepositoryState",
  "authoritativeSources",
  "assumptions",
  "unresolvedDecisions",
  "allowedActions",
  "forbiddenActions",
  "scientificInvariants",
  "acceptanceCriteria",
  "requiredCommands",
  "requiredEvidence",
  "failureRecovery",
  "stopConditions",
  "maximumCompletionState",
] as const;

const REPOSITORY_STATE_KEYS = [
  "worktree",
  "branch",
  "headSha",
  "dirtyPathsPresent",
  "concurrentWritersKnown",
] as const;

const SAFE_SINGLE_LINE_PATTERN = "^(?=.*\\S)[^\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]+$";
const BOUNDED_TEXT_LIST_SCHEMA = {
  type: "array",
  maxItems: 64,
  uniqueItems: true,
  items: {
    type: "string",
    minLength: 1,
    maxLength: 1_024,
    pattern: SAFE_SINGLE_LINE_PATTERN,
  },
} as const;

export const ENA_AGENT_TASK_CONTRACT_V1_JSON_SCHEMA = deepFreeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://www.ena.hk/schemas/internal/ena-agent-task-contract-v1.json",
  title: "ENA Agent Task Contract V1",
  type: "object",
  additionalProperties: false,
  required: CONTRACT_KEYS,
  properties: {
    schemaVersion: {
      const: ENA_AGENT_TASK_CONTRACT_SCHEMA_VERSION,
    },
    projectSurface: {
      type: "string",
      enum: ENA_AGENT_PROJECT_SURFACES,
    },
    operationMode: {
      type: "string",
      enum: ENA_AGENT_OPERATION_MODES,
    },
    explicitGoal: {
      type: "string",
      minLength: 1,
      maxLength: 4_096,
      pattern: SAFE_SINGLE_LINE_PATTERN,
    },
    nonGoals: BOUNDED_TEXT_LIST_SCHEMA,
    targetAudience: BOUNDED_TEXT_LIST_SCHEMA,
    currentRepositoryState: {
      type: "object",
      additionalProperties: false,
      required: REPOSITORY_STATE_KEYS,
      properties: {
        worktree: {
          type: "string",
          minLength: 1,
          maxLength: 2_048,
          pattern: SAFE_SINGLE_LINE_PATTERN,
        },
        branch: {
          type: "string",
          minLength: 1,
          maxLength: 255,
          pattern: SAFE_SINGLE_LINE_PATTERN,
        },
        headSha: {
          type: "string",
          pattern: "^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$",
        },
        dirtyPathsPresent: {
          type: "boolean",
        },
        concurrentWritersKnown: {
          type: "boolean",
        },
      },
    },
    authoritativeSources: BOUNDED_TEXT_LIST_SCHEMA,
    assumptions: BOUNDED_TEXT_LIST_SCHEMA,
    unresolvedDecisions: BOUNDED_TEXT_LIST_SCHEMA,
    allowedActions: BOUNDED_TEXT_LIST_SCHEMA,
    forbiddenActions: BOUNDED_TEXT_LIST_SCHEMA,
    scientificInvariants: BOUNDED_TEXT_LIST_SCHEMA,
    acceptanceCriteria: BOUNDED_TEXT_LIST_SCHEMA,
    requiredCommands: BOUNDED_TEXT_LIST_SCHEMA,
    requiredEvidence: BOUNDED_TEXT_LIST_SCHEMA,
    failureRecovery: BOUNDED_TEXT_LIST_SCHEMA,
    stopConditions: BOUNDED_TEXT_LIST_SCHEMA,
    maximumCompletionState: {
      type: "string",
      enum: ENA_AGENT_MAXIMUM_COMPLETION_STATES,
    },
  },
} as const);

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  const hasUnsafeProperty = keys.some((key) => {
    if (typeof key !== "string") return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor === undefined || !descriptor.enumerable || !("value" in descriptor);
  });
  if ((prototype !== Object.prototype && prototype !== null) || hasUnsafeProperty) {
    throw new Error(`${label} must be a plain JSON object without accessors or symbol keys.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownProperties(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.getOwnPropertyNames(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length > 0) {
    throw new Error(`${label} has unknown properties: ${unknown.join(", ")}.`);
  }
}

const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u;
const MAX_LIST_ITEMS = 64;
const MAX_LIST_ENTRY_LENGTH = 1_024;

function text(value: unknown, label: string, maximumLength = MAX_LIST_ENTRY_LENGTH): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  if (value.length > maximumLength) {
    throw new Error(`${label} must be ${maximumLength.toLocaleString("en-US")} characters or fewer.`);
  }
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error(`${label} must be nonblank.`);
  if (normalized.length > maximumLength) {
    throw new Error(`${label} must be ${maximumLength.toLocaleString("en-US")} characters or fewer.`);
  }
  if (UNSAFE_TEXT.test(normalized)) {
    throw new Error(`${label} contains unsafe control or formatting characters.`);
  }
  return normalized;
}

function assertDensePlainJsonArray(value: unknown[], label: string): void {
  const ownKeys = Reflect.ownKeys(value);
  const itemKeys = ownKeys.filter((key) => key !== "length");
  const hasUnsafeItem = itemKeys.some((key, index) => {
    if (typeof key !== "string" || key !== String(index)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor === undefined || !descriptor.enumerable || !("value" in descriptor);
  });
  if (Object.getPrototypeOf(value) !== Array.prototype
    || itemKeys.length !== value.length
    || hasUnsafeItem) {
    throw new Error(`${label} must be a dense plain JSON array without accessors or extra properties.`);
  }
}

function textList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > MAX_LIST_ITEMS) {
    throw new Error(`${label} must contain ${MAX_LIST_ITEMS} items or fewer.`);
  }
  assertDensePlainJsonArray(value, label);
  const normalized = value.map((entry, index) => text(entry, `${label}[${index}]`));
  const seen = new Set<string>();
  for (const entry of normalized) {
    if (seen.has(entry)) throw new Error(`${label} contains a duplicate entry: ${entry}.`);
    seen.add(entry);
  }
  return normalized;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  label: string,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new Error(`${label} must be one of: ${values.join(", ")}.`);
  }
  return value as Values[number];
}

function canonicalAction(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();
}

function rejectConflictingActions(allowedActions: readonly string[], forbiddenActions: readonly string[]): void {
  const forbidden = new Set(forbiddenActions.map(canonicalAction));
  const conflict = allowedActions.find((action) => forbidden.has(canonicalAction(action)));
  if (conflict) {
    throw new Error(
      `allowedActions and forbiddenActions contain the same action: ${conflict}.`,
    );
  }
}

function mergeGovernanceItems(required: readonly string[], supplied: readonly string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...required, ...supplied]) {
    const key = canonicalAction(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

const ACTION_CLAUSE_START = String.raw`(?:^|[.;:]\s*|\b(?:and|then)\s+)`;
const ACTION_PERMISSION_PREFIX = String.raw`(?:(?:please|then)\s+|(?:the agent\s+)?(?:may|can|must|should|will)\s+|(?:the agent\s+)?(?:is\s+)?(?:allowed|permitted)\s+to\s+)*`;
const MUTATION_ACTION_VERBS = String.raw`(?:mutat(?:e|es|ed|ing)|modif(?:y|ies|ied|ying)|edit(?:s|ed|ing)?|writ(?:e|es|ing|ten)|chang(?:e|es|ed|ing)|updat(?:e|es|ed|ing)|commit(?:s|ted|ting)?|push(?:es|ed|ing)?|merg(?:e|es|ed|ing)|deploy(?:s|ed|ing)?|publish(?:es|ed|ing)?)`;
const REMOTE_ACTION_VERBS = String.raw`(?:push(?:es|ed|ing)?|merg(?:e|es|ed|ing)|deploy(?:s|ed|ing)?|publish(?:es|ed|ing)?)`;
const REVIEW_CANDIDATE_MUTATION_VERBS = String.raw`(?:mutat(?:e|es|ed|ing)|modif(?:y|ies|ied|ying)|edit(?:s|ed|ing)?|writ(?:e|es|ing|ten)|chang(?:e|es|ed|ing)|updat(?:e|es|ed|ing))`;
const SELF_APPROVAL_VERBS = String.raw`(?:self(?:-|\s)?approv(?:e|es|ed|ing))`;

function explicitActionPattern(verbs: string): RegExp {
  return new RegExp(`${ACTION_CLAUSE_START}${ACTION_PERMISSION_PREFIX}${verbs}\\b`, "u");
}

const MUTATION_ACTION_PATTERN = explicitActionPattern(MUTATION_ACTION_VERBS);
const REMOTE_ACTION_PATTERN = explicitActionPattern(REMOTE_ACTION_VERBS);
const SELF_APPROVAL_ACTION_PATTERN = explicitActionPattern(SELF_APPROVAL_VERBS);
const REVIEW_CANDIDATE_MUTATION_PATTERN = new RegExp(
  `${ACTION_CLAUSE_START}${ACTION_PERMISSION_PREFIX}${REVIEW_CANDIDATE_MUTATION_VERBS}\\b[^.;:]{0,160}\\b(?:review\\s+)?candidate\\b`,
  "u",
);

const RELEASE_EVIDENCE_PLANES = [
  ["local-implementation", /\blocal implementation(?: evidence)?\b/u],
  ["local-test", /\blocal tests?(?: evidence)?\b/u],
  ["ci", /\bci(?: evidence)?\b/u],
  ["github", /\bgithub(?: state)?(?: evidence)?\b/u],
  ["deployment", /\bdeployment(?: state)?(?: evidence)?\b/u],
  ["live", /\blive(?: behavior)?(?: evidence)?\b/u],
] as const;
const EVIDENCE_SUBSTITUTION_PHRASE = /\b(?:proves?|(?:is|as)\s+(?:a\s+)?proof\s+of|substitut(?:e|es|ed|ing)\s+for|(?:is|as)\s+(?:a\s+)?substitute\s+for|stands?\s+in\s+for)\b/u;
const NEGATED_EVIDENCE_SUBSTITUTION = /\b(?:do(?:es)?|is|are|can|must|should|will)\s+not\b|\bnever\b/u;

function treatsOneReleasePlaneAsAnother(action: string): boolean {
  if (NEGATED_EVIDENCE_SUBSTITUTION.test(action)
    || !EVIDENCE_SUBSTITUTION_PHRASE.test(action)) return false;
  const planes = RELEASE_EVIDENCE_PLANES
    .filter(([, pattern]) => pattern.test(action))
    .map(([plane]) => plane);
  return new Set(planes).size >= 2;
}

function prohibitedAllowedActionReason(
  operationMode: EnaAgentGovernedOperationModeV1,
  action: string,
): string | null {
  const normalized = canonicalAction(action);
  if (operationMode === "diagnose" && MUTATION_ACTION_PATTERN.test(normalized)) {
    return "diagnose is read-only";
  }
  if (operationMode === "implement" && REMOTE_ACTION_PATTERN.test(normalized)) {
    return "implement cannot push, merge, deploy, or publish";
  }
  if (operationMode === "independent-review") {
    if (REVIEW_CANDIDATE_MUTATION_PATTERN.test(normalized)) {
      return "independent-review cannot modify its candidate";
    }
    if (SELF_APPROVAL_ACTION_PATTERN.test(normalized)) {
      return "independent-review cannot self-approve";
    }
    if (REMOTE_ACTION_PATTERN.test(normalized)) {
      return "independent-review cannot push, merge, deploy, or publish";
    }
  }
  if (operationMode === "release-verify") {
    if (MUTATION_ACTION_PATTERN.test(normalized)) {
      return "release-verify is non-mutating";
    }
    if (treatsOneReleasePlaneAsAnother(normalized)) {
      return "release-verify keeps evidence planes separate";
    }
  }
  return null;
}

function rejectModeProhibitedAllowedActions(contract: EnaAgentTaskContractV1): void {
  const operationMode = contract.operationMode;
  if (operationMode === "plan") return;
  contract.allowedActions.forEach((action, index) => {
    const reason = prohibitedAllowedActionReason(operationMode, action);
    if (reason) {
      throw new Error(
        `${operationMode} mode allowedActions[${index}] is prohibited by V1 governance: ${reason}.`,
      );
    }
  });
}

function deepFreeze<T>(value: T, seen = new Set<unknown>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

export function parseEnaAgentTaskContractV1(value: unknown): EnaAgentTaskContractV1 {
  const input = record(value, "ENA agent task contract");
  rejectUnknownProperties(input, CONTRACT_KEYS, "ENA agent task contract");
  const repositoryState = record(input.currentRepositoryState, "currentRepositoryState");
  rejectUnknownProperties(repositoryState, REPOSITORY_STATE_KEYS, "currentRepositoryState");
  const headSha = text(repositoryState.headSha, "currentRepositoryState.headSha", 64).toLowerCase();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(headSha)) {
    throw new Error("currentRepositoryState.headSha must be a 40- or 64-character Git SHA.");
  }
  const allowedActions = textList(input.allowedActions, "allowedActions");
  const forbiddenActions = textList(input.forbiddenActions, "forbiddenActions");
  rejectConflictingActions(allowedActions, forbiddenActions);

  return deepFreeze({
    schemaVersion: enumValue(
      input.schemaVersion,
      [ENA_AGENT_TASK_CONTRACT_SCHEMA_VERSION] as const,
      "schemaVersion",
    ),
    projectSurface: enumValue(input.projectSurface, ENA_AGENT_PROJECT_SURFACES, "projectSurface"),
    operationMode: enumValue(input.operationMode, ENA_AGENT_OPERATION_MODES, "operationMode"),
    explicitGoal: text(input.explicitGoal, "explicitGoal", 4_096),
    nonGoals: textList(input.nonGoals, "nonGoals"),
    targetAudience: textList(input.targetAudience, "targetAudience"),
    currentRepositoryState: {
      worktree: text(repositoryState.worktree, "currentRepositoryState.worktree", 2_048),
      branch: text(repositoryState.branch, "currentRepositoryState.branch", 255),
      headSha,
      dirtyPathsPresent: booleanValue(
        repositoryState.dirtyPathsPresent,
        "currentRepositoryState.dirtyPathsPresent",
      ),
      concurrentWritersKnown: booleanValue(
        repositoryState.concurrentWritersKnown,
        "currentRepositoryState.concurrentWritersKnown",
      ),
    },
    authoritativeSources: textList(input.authoritativeSources, "authoritativeSources"),
    assumptions: textList(input.assumptions, "assumptions"),
    unresolvedDecisions: textList(input.unresolvedDecisions, "unresolvedDecisions"),
    allowedActions,
    forbiddenActions,
    scientificInvariants: textList(input.scientificInvariants, "scientificInvariants"),
    acceptanceCriteria: textList(input.acceptanceCriteria, "acceptanceCriteria"),
    requiredCommands: textList(input.requiredCommands, "requiredCommands"),
    requiredEvidence: textList(input.requiredEvidence, "requiredEvidence"),
    failureRecovery: textList(input.failureRecovery, "failureRecovery"),
    stopConditions: textList(input.stopConditions, "stopConditions"),
    maximumCompletionState: enumValue(
      input.maximumCompletionState,
      ENA_AGENT_MAXIMUM_COMPLETION_STATES,
      "maximumCompletionState",
    ),
  });
}

export function applyEnaAgentOperationModeGovernanceV1(value: unknown): EnaAgentTaskContractV1 {
  const contract = parseEnaAgentTaskContractV1(value);
  if (contract.operationMode === "plan") return contract;

  const template = ENA_AGENT_OPERATION_MODE_TEMPLATES_V1[contract.operationMode];
  if (contract.operationMode === "diagnose" && contract.maximumCompletionState !== "PLANNED") {
    throw new Error("diagnose mode requires a PLANNED maximumCompletionState ceiling.");
  }
  rejectModeProhibitedAllowedActions(contract);

  return parseEnaAgentTaskContractV1({
    ...contract,
    forbiddenActions: mergeGovernanceItems(template.forbiddenActions, contract.forbiddenActions),
    scientificInvariants: mergeGovernanceItems(
      template.scientificInvariants,
      contract.scientificInvariants,
    ),
    requiredEvidence: mergeGovernanceItems(template.requiredEvidence, contract.requiredEvidence),
    stopConditions: mergeGovernanceItems(template.stopConditions, contract.stopConditions),
  });
}

function markdownText(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/([`~*_{}\[\]()#+.!|])/gu, "\\$1");
}

function markdownList(values: readonly string[]): string {
  if (values.length === 0) return "- None specified.";
  return values.map((value) => `- ${markdownText(value)}`).join("\n");
}

function renderNormalizedContract(contract: EnaAgentTaskContractV1): string {
  const sections = [
    "# ENA Agent Task Contract V1",
    [
      "## Contract metadata",
      `- Schema version: ${markdownText(contract.schemaVersion)}`,
      `- Project surface: ${markdownText(contract.projectSurface)}`,
      `- Operation mode: ${markdownText(contract.operationMode)}`,
    ].join("\n"),
    `## Explicit goal\n${markdownText(contract.explicitGoal)}`,
    `## Non-goals\n${markdownList(contract.nonGoals)}`,
    `## Target audience\n${markdownList(contract.targetAudience)}`,
    [
      "## Current repository state",
      `- Worktree: ${markdownText(contract.currentRepositoryState.worktree)}`,
      `- Branch: ${markdownText(contract.currentRepositoryState.branch)}`,
      `- HEAD SHA: ${contract.currentRepositoryState.headSha}`,
      `- Dirty paths present: ${contract.currentRepositoryState.dirtyPathsPresent ? "yes" : "no"}`,
      `- Concurrent writers known: ${contract.currentRepositoryState.concurrentWritersKnown ? "yes" : "no"}`,
    ].join("\n"),
    `## Authoritative sources\n${markdownList(contract.authoritativeSources)}`,
    `## Assumptions\n${markdownList(contract.assumptions)}`,
    `## Unresolved decisions\n${markdownList(contract.unresolvedDecisions)}`,
    `## Allowed actions\n${markdownList(contract.allowedActions)}`,
    `## Forbidden actions\n${markdownList(contract.forbiddenActions)}`,
    `## Scientific invariants\n${markdownList(contract.scientificInvariants)}`,
    `## Acceptance criteria\n${markdownList(contract.acceptanceCriteria)}`,
    `## Required commands\n${markdownList(contract.requiredCommands)}`,
    `## Required evidence\n${markdownList(contract.requiredEvidence)}`,
    `## Failure recovery\n${markdownList(contract.failureRecovery)}`,
    `## Stop conditions\n${markdownList(contract.stopConditions)}`,
    `## Maximum completion state\n${markdownText(contract.maximumCompletionState)}`,
  ];
  return `${sections.join("\n\n")}\n`;
}

export function renderEnaAgentTaskContractMarkdownV1(value: unknown): string {
  return renderNormalizedContract(applyEnaAgentOperationModeGovernanceV1(value));
}

export function compileEnaAgentTaskContractV1(value: unknown): EnaAgentTaskCompilationV1 {
  const contract = applyEnaAgentOperationModeGovernanceV1(value);
  return deepFreeze({
    contract,
    markdown: renderNormalizedContract(contract),
  });
}
