import { isProxy } from "node:util/types";

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

export const ENA_AGENT_ALLOWED_ACTIONS_V1 = [
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

export type EnaAgentProjectSurfaceV1 = typeof ENA_AGENT_PROJECT_SURFACES[number];
export type EnaAgentOperationModeV1 = typeof ENA_AGENT_OPERATION_MODES[number];
export type EnaAgentMaximumCompletionStateV1 = typeof ENA_AGENT_MAXIMUM_COMPLETION_STATES[number];
export type EnaAgentAllowedActionV1 = typeof ENA_AGENT_ALLOWED_ACTIONS_V1[number];

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
  readonly allowedActions: readonly EnaAgentAllowedActionV1[];
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

export const ENA_AGENT_OPERATION_ALLOWED_ACTIONS_V1 = deepFreeze({
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
} as const satisfies Record<EnaAgentOperationModeV1, readonly EnaAgentAllowedActionV1[]>);

export interface EnaAgentOperationModeTemplateV1 {
  readonly operationMode: EnaAgentGovernedOperationModeV1;
  readonly defaultMaximumCompletionState: EnaAgentMaximumCompletionStateV1;
  readonly allowedActions: readonly EnaAgentAllowedActionV1[];
  readonly forbiddenActions: readonly string[];
  readonly scientificInvariants: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly stopConditions: readonly string[];
}

export const ENA_AGENT_OPERATION_MODE_TEMPLATES_V1 = deepFreeze({
  diagnose: {
    operationMode: "diagnose",
    defaultMaximumCompletionState: "PLANNED",
    allowedActions: ENA_AGENT_OPERATION_ALLOWED_ACTIONS_V1.diagnose,
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
    allowedActions: ENA_AGENT_OPERATION_ALLOWED_ACTIONS_V1.implement,
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
    allowedActions: ENA_AGENT_OPERATION_ALLOWED_ACTIONS_V1["independent-review"],
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
    allowedActions: ENA_AGENT_OPERATION_ALLOWED_ACTIONS_V1["release-verify"],
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

const UNSAFE_TEXT_CODE_POINT_CLASS_SOURCE = "\\p{C}\\p{Zl}\\p{Zp}\\u034f\\u115f-\\u1160\\u17b4-\\u17b5\\u3164\\uffa0";
const SAFE_SINGLE_LINE_PATTERN = `^(?=.*\\S)[^${UNSAFE_TEXT_CODE_POINT_CLASS_SOURCE}]+$`;
const GIT_SHA_PATTERN_SOURCE = "^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$";
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
const ALLOWED_ACTIONS_SCHEMA = {
  type: "array",
  maxItems: ENA_AGENT_ALLOWED_ACTIONS_V1.length,
  uniqueItems: true,
  items: {
    type: "string",
    enum: ENA_AGENT_ALLOWED_ACTIONS_V1,
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
          pattern: GIT_SHA_PATTERN_SOURCE,
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
    allowedActions: ALLOWED_ACTIONS_SCHEMA,
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
  if (value === null || typeof value !== "object") {
    throw new Error(`${label} must be an object.`);
  }
  if (isProxy(value)) {
    throw new Error(`${label} must be a plain JSON object; Proxy values are not permitted.`);
  }
  if (Array.isArray(value)) throw new Error(`${label} must be an object.`);
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
  const maximumDisplayedProperties = 8;
  const displayedProperties: string[] = [];
  let unknownPropertyCount = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key) || allowed.has(key)) continue;
    unknownPropertyCount += 1;
    if (displayedProperties.length < maximumDisplayedProperties) {
      displayedProperties.push(diagnosticPropertyName(key));
    }
  }
  if (unknownPropertyCount > 0) {
    const displayed = displayedProperties.join(", ");
    const plural = unknownPropertyCount === 1 ? "property" : "properties";
    const count = unknownPropertyCount > maximumDisplayedProperties
      ? `${unknownPropertyCount} total; showing the first ${maximumDisplayedProperties}`
      : `${unknownPropertyCount} total`;
    const omitted = unknownPropertyCount > maximumDisplayedProperties
      ? ` (+${unknownPropertyCount - maximumDisplayedProperties} more)`
      : "";
    throw new Error(`${label} has unknown ${plural} (${count}): ${displayed}${omitted}.`);
  }
}

const MAX_DIAGNOSTIC_PROPERTY_NAME_LENGTH = 96;

function diagnosticPropertyCharacter(character: string): string {
  switch (character) {
    case "\b": return "\\b";
    case "\t": return "\\t";
    case "\n": return "\\n";
    case "\f": return "\\f";
    case "\r": return "\\r";
    case "\"": return "\\\"";
    case "\\": return "\\\\";
    default: {
      if (!/[\p{C}\p{Zl}\p{Zp}]/u.test(character)) return character;
      const codePoint = character.codePointAt(0);
      if (codePoint === undefined) return "";
      const hexadecimal = codePoint.toString(16).padStart(codePoint <= 0xffff ? 4 : 1, "0");
      return codePoint <= 0xffff ? `\\u${hexadecimal}` : `\\u{${hexadecimal}}`;
    }
  }
}

function diagnosticPropertyName(value: string): string {
  let rendered = "\"";
  let truncated = false;
  for (const character of value) {
    const escaped = diagnosticPropertyCharacter(character);
    if (rendered.length + escaped.length + 2 > MAX_DIAGNOSTIC_PROPERTY_NAME_LENGTH) {
      truncated = true;
      break;
    }
    rendered += escaped;
  }
  if (truncated) rendered += "…";
  return `${rendered}\"`;
}

function requireOwnEnumerableDataProperties(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  label: string,
): void {
  for (const key of requiredKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label}.${key} must be an own enumerable data property.`);
    }
  }
}

const UNSAFE_TEXT_CHARACTER = new RegExp(`[${UNSAFE_TEXT_CODE_POINT_CLASS_SOURCE}]`, "u");
const GIT_SHA_PATTERN = new RegExp(GIT_SHA_PATTERN_SOURCE, "u");
const MAX_LIST_ITEMS = 64;
const MAX_LIST_ENTRY_LENGTH = 1_024;

function validateTextCharactersAndLength(value: string, label: string, maximumLength: number): void {
  const maximumCodeUnits = maximumLength * 2;
  if (value.length > maximumCodeUnits) {
    throw new Error(`${label} must be ${maximumLength.toLocaleString("en-US")} characters or fewer.`);
  }
  let codePointCount = 0;
  for (const character of value) {
    codePointCount += 1;
    if (codePointCount > maximumLength) {
      throw new Error(`${label} must be ${maximumLength.toLocaleString("en-US")} characters or fewer.`);
    }
    if (UNSAFE_TEXT_CHARACTER.test(character)) {
      throw new Error(`${label} contains unsafe control or formatting characters.`);
    }
  }
}

function text(value: unknown, label: string, maximumLength = MAX_LIST_ENTRY_LENGTH): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  validateTextCharactersAndLength(value, label, maximumLength);
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error(`${label} must be nonblank.`);
  validateTextCharactersAndLength(normalized, label, maximumLength);
  return normalized;
}

function gitSha(value: unknown): string {
  if (typeof value !== "string" || !GIT_SHA_PATTERN.test(value)) {
    throw new Error("currentRepositoryState.headSha must be a 40- or 64-character Git SHA.");
  }
  return value.toLowerCase();
}

function assertDensePlainJsonArray(value: unknown[], label: string): void {
  if (isProxy(value)) {
    throw new Error(`${label} must be a dense plain JSON array; Proxy values are not permitted.`);
  }
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
  if (value !== null && typeof value === "object" && isProxy(value)) {
    throw new Error(`${label} must be a dense plain JSON array; Proxy values are not permitted.`);
  }
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

function allowedActionList(value: unknown): EnaAgentAllowedActionV1[] {
  const validated = textList(value, "allowedActions");
  const raw = value as unknown[];
  return validated.map((_action, index) => enumValue(
    raw[index],
    ENA_AGENT_ALLOWED_ACTIONS_V1,
    `allowedActions[${index}]`,
  ));
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

function mergeGovernanceItemsWithinSchemaCapacity(
  operationMode: EnaAgentGovernedOperationModeV1,
  field: "forbiddenActions" | "scientificInvariants" | "requiredEvidence" | "stopConditions",
  required: readonly string[],
  supplied: readonly string[],
): string[] {
  const merged = mergeGovernanceItems(required, supplied);
  if (merged.length > MAX_LIST_ITEMS) {
    throw new Error(
      `${operationMode} mode ${field} lacks capacity for required governance: `
      + `merged output would contain ${merged.length} items, exceeding the `
      + `${MAX_LIST_ITEMS}-item schema maximum.`,
    );
  }
  return merged;
}

function rejectActionsOutsideOperationMode(contract: EnaAgentTaskContractV1): void {
  const permitted = new Set<EnaAgentAllowedActionV1>(
    ENA_AGENT_OPERATION_ALLOWED_ACTIONS_V1[contract.operationMode],
  );
  contract.allowedActions.forEach((action, index) => {
    if (!permitted.has(action)) {
      throw new Error(
        `${contract.operationMode} mode allowedActions[${index}] is not permitted by the V1 capability matrix.`,
      );
    }
  });
}

const SHELL_EXECUTION_FEATURES = /[\n\r;&|<>`$\\"']/u;
const REQUIRED_COMMAND_TOKEN = /^[A-Za-z0-9_./:@%+=,-]+$/u;
const SAFE_TEST_PATH = /^tests\/[A-Za-z0-9_./-]+\.(?:test|spec)\.(?:ts|js)$/u;
const SAFE_NPM_VERIFICATION_COMMANDS = new Set([
  "npm test",
  "npm run test",
  "npm run test:app",
  "npm run test:browser:longitudinal-v3",
  "npm run typecheck",
  "npm run typecheck:app",
  "npm run build",
  "npm run build:app",
  "npm run verify",
  "npm run prompt:verify",
  "npm run verify:j3dena-vendor",
  "npm run verify:j3dena-vendor -- --require-installed",
  "npm run jena:verify",
  "npm run test:browser --workspace=jena-js",
]);
const SAFE_GIT_STATUS_ARGUMENTS = new Set([
  "--short",
  "--branch",
  "--porcelain",
  "--porcelain=v1",
  "--porcelain=v2",
  "--untracked-files=no",
  "--untracked-files=normal",
  "--untracked-files=all",
]);
const SAFE_GIT_DIFF_ARGUMENTS = new Set([
  "--check",
  "--stat",
  "--name-only",
  "--name-status",
  "--cached",
  "--staged",
  "--no-ext-diff",
  "--no-textconv",
  "--exit-code",
  "--quiet",
]);
const SAFE_GIT_HISTORY_ARGUMENTS = new Set([
  "--oneline",
  "--decorate",
  "--stat",
  "--name-only",
  "--name-status",
  "--no-patch",
  "--no-show-signature",
]);
const SAFE_RG_ARGUMENTS = new Set([
  "-n",
  "--line-number",
  "-F",
  "--fixed-strings",
  "-i",
  "--ignore-case",
  "--case-sensitive",
  "-l",
  "--files",
  "--files-with-matches",
  "--count",
  "--count-matches",
  "--no-heading",
  "--with-filename",
]);

type RequiredCommandEffect = "repository-inspection" | "source-inspection" | "local-verification";

const REQUIRED_COMMAND_EFFECT_ACTIONS = {
  "repository-inspection": [
    "inspect-repository-state",
    "inspect-review-candidate",
    "inspect-local-implementation-evidence",
  ],
  "source-inspection": [
    "inspect-authoritative-sources",
    "inspect-review-candidate",
    "inspect-local-implementation-evidence",
  ],
  "local-verification": [
    "run-local-verification",
    "run-read-only-diagnostics",
    "run-independent-verification",
  ],
} as const satisfies Record<RequiredCommandEffect, readonly EnaAgentAllowedActionV1[]>;

function requiredCommandTokens(command: string, label: string): string[] {
  if (SHELL_EXECUTION_FEATURES.test(command)) {
    throw new Error(`${label} uses shell execution features that are not permitted by V1.`);
  }
  const tokens = command.split(" ");
  if (tokens.length === 0
    || tokens.length > 32
    || tokens.join(" ") !== command
    || tokens.some((token) => !REQUIRED_COMMAND_TOKEN.test(token))) {
    throw new Error(`${label} is unsupported by the closed V1 required-command classifier.`);
  }
  return tokens;
}

function isSafeGitRevision(value: string): boolean {
  return value === "HEAD"
    || /^HEAD~[0-9]{1,4}$/u.test(value)
    || /^[0-9a-fA-F]{7,64}$/u.test(value);
}

function areSafeGitDiffArguments(args: readonly string[]): boolean {
  let pathsFollow = false;
  for (const argument of args) {
    if (argument === "--") {
      if (pathsFollow) return false;
      pathsFollow = true;
      continue;
    }
    if (pathsFollow) {
      if (argument.startsWith("/")
        || argument.split("/").includes("..")
        || !/^[A-Za-z0-9_./-]+$/u.test(argument)) return false;
      continue;
    }
    if (!SAFE_GIT_DIFF_ARGUMENTS.has(argument) && !isSafeGitRevision(argument)) return false;
  }
  return true;
}

function areSafeGitHistoryArguments(args: readonly string[]): boolean {
  return args.every((argument) => SAFE_GIT_HISTORY_ARGUMENTS.has(argument)
    || /^--max-count=[1-9][0-9]{0,3}$/u.test(argument)
    || /^-n[1-9][0-9]{0,3}$/u.test(argument)
    || isSafeGitRevision(argument));
}

function classifyGitCommand(tokens: readonly string[]): RequiredCommandEffect | undefined {
  const [, subcommand, ...args] = tokens;
  switch (subcommand) {
    case "status":
      return args.every((argument) => SAFE_GIT_STATUS_ARGUMENTS.has(argument))
        ? "repository-inspection"
        : undefined;
    case "diff":
      return areSafeGitDiffArguments(args) ? "repository-inspection" : undefined;
    case "show":
    case "log":
      return areSafeGitHistoryArguments(args) ? "repository-inspection" : undefined;
    case "rev-parse":
      return args.length > 0 && args.every((argument) => [
        "--short",
        "--verify",
        "--abbrev-ref",
        "--show-toplevel",
        "--git-dir",
        "--is-inside-work-tree",
      ].includes(argument) || isSafeGitRevision(argument))
        ? "repository-inspection"
        : undefined;
    case "branch":
      return args.length === 1 && ["--show-current", "--list"].includes(args[0])
        ? "repository-inspection"
        : undefined;
    case "worktree":
      return args.length >= 1
        && args[0] === "list"
        && args.slice(1).every((argument) => argument === "--porcelain")
        ? "repository-inspection"
        : undefined;
    case "ls-files":
      return args.every((argument) => ["--cached", "--deleted", "--modified", "--others", "--exclude-standard"].includes(argument))
        ? "repository-inspection"
        : undefined;
    default:
      return undefined;
  }
}

function classifyRipgrepCommand(tokens: readonly string[]): RequiredCommandEffect | undefined {
  const args = tokens.slice(1);
  if (args.length === 0) return undefined;
  const operands: string[] = [];
  for (const argument of args) {
    if (argument.startsWith("-")) {
      if (!SAFE_RG_ARGUMENTS.has(argument)
        && !/^--max-count=[1-9][0-9]{0,6}$/u.test(argument)
        && !/^--max-filesize=[1-9][0-9]{0,6}(?:K|M|G)?$/u.test(argument)) return undefined;
    } else {
      operands.push(argument);
    }
  }
  const filesOnly = args.includes("--files");
  const repositoryRelativePaths = filesOnly ? operands : operands.slice(1);
  const pathsAreSafe = repositoryRelativePaths.every((operand) => !operand.startsWith("/")
    && !operand.split("/").includes("..")
    && /^[A-Za-z0-9_./-]+$/u.test(operand));
  return pathsAreSafe && (filesOnly || operands.length > 0) ? "source-inspection" : undefined;
}

function classifyRequiredCommand(command: string, label: string): RequiredCommandEffect {
  const tokens = requiredCommandTokens(command, label);
  let effect: RequiredCommandEffect | undefined;
  if (tokens[0] === "node"
    && tokens.length >= 5
    && tokens[1] === "--import"
    && tokens[2] === "tsx"
    && tokens[3] === "--test"
    && tokens.slice(4).every((path) => SAFE_TEST_PATH.test(path)
      && !path.split("/").includes(".."))) {
    effect = "local-verification";
  } else if (tokens[0] === "npm" && SAFE_NPM_VERIFICATION_COMMANDS.has(command)) {
    effect = "local-verification";
  } else if (tokens[0] === "git") {
    effect = classifyGitCommand(tokens);
  } else if (tokens[0] === "rg") {
    effect = classifyRipgrepCommand(tokens);
  }
  if (effect === undefined) {
    throw new Error(`${label} is unsupported by the closed V1 required-command classifier.`);
  }
  return effect;
}

function validateRequiredCommands(
  requiredCommands: readonly string[],
  allowedActions: readonly EnaAgentAllowedActionV1[],
): void {
  const explicitlyAllowed = new Set(allowedActions);
  requiredCommands.forEach((command, index) => {
    const effect = classifyRequiredCommand(command, `requiredCommands[${index}]`);
    const requiredActions = REQUIRED_COMMAND_EFFECT_ACTIONS[effect];
    if (!requiredActions.some((action) => explicitlyAllowed.has(action))) {
      throw new Error(
        `requiredCommands[${index}] requires ${requiredActions.join(" or ")} in explicit `
        + "allowedActions; required commands never grant authority.",
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
  requireOwnEnumerableDataProperties(input, CONTRACT_KEYS, "ENA agent task contract");
  const repositoryState = record(input.currentRepositoryState, "currentRepositoryState");
  rejectUnknownProperties(repositoryState, REPOSITORY_STATE_KEYS, "currentRepositoryState");
  requireOwnEnumerableDataProperties(
    repositoryState,
    REPOSITORY_STATE_KEYS,
    "currentRepositoryState",
  );
  const headSha = gitSha(repositoryState.headSha);
  const allowedActions = allowedActionList(input.allowedActions);
  const forbiddenActions = textList(input.forbiddenActions, "forbiddenActions");
  const requiredCommands = textList(input.requiredCommands, "requiredCommands");
  rejectConflictingActions(allowedActions, forbiddenActions);
  validateRequiredCommands(requiredCommands, allowedActions);

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
    requiredCommands,
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
  rejectActionsOutsideOperationMode(contract);
  if (contract.operationMode === "plan") return contract;

  const template = ENA_AGENT_OPERATION_MODE_TEMPLATES_V1[contract.operationMode];
  if (contract.operationMode === "diagnose" && contract.maximumCompletionState !== "PLANNED") {
    throw new Error("diagnose mode requires a PLANNED maximumCompletionState ceiling.");
  }

  return parseEnaAgentTaskContractV1({
    ...contract,
    forbiddenActions: mergeGovernanceItemsWithinSchemaCapacity(
      contract.operationMode,
      "forbiddenActions",
      template.forbiddenActions,
      contract.forbiddenActions,
    ),
    scientificInvariants: mergeGovernanceItemsWithinSchemaCapacity(
      contract.operationMode,
      "scientificInvariants",
      template.scientificInvariants,
      contract.scientificInvariants,
    ),
    requiredEvidence: mergeGovernanceItemsWithinSchemaCapacity(
      contract.operationMode,
      "requiredEvidence",
      template.requiredEvidence,
      contract.requiredEvidence,
    ),
    stopConditions: mergeGovernanceItemsWithinSchemaCapacity(
      contract.operationMode,
      "stopConditions",
      template.stopConditions,
      contract.stopConditions,
    ),
  });
}

function markdownText(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/([`~*_{}\[\]()#+.!|])/gu, "\\$1")
    .replace(/^-/u, "\\-");
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
