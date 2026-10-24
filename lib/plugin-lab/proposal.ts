export type PluginProposalState =
  | "received"
  | "under-review"
  | "needs-information"
  | "selected"
  | "not-selected"
  | "withdrawn";

export type PluginProposalTrack = "academic" | "commissioned" | "unsure";
export type PluginProposalVisibility = "private" | "public-after-review";

export interface PluginProposalSubmission {
  schemaVersion?: 2;
  email: string;
  name: string | null;
  affiliation: string | null;
  title: string;
  researchQuestion: string;
  currentGap: string;
  proposedChange: string;
  unchangedBoundary: string;
  publicSummary: string;
  privateDetails: string;
  referenceLinks: readonly string[];
  visibility: PluginProposalVisibility;
  track: PluginProposalTrack;
  dataSafetyConfirmed: true;
  privacyConsent: true;
}

const SUBMISSION_KEYS = [
  "email", "name", "affiliation", "title", "researchQuestion", "currentGap",
  "proposedChange", "unchangedBoundary", "publicSummary", "privateDetails",
  "referenceLinks", "visibility", "track", "dataSafetyConfirmed", "privacyConsent",
] as const;

const limits = {
  name: 120,
  affiliation: 160,
  title: 160,
  researchQuestion: 2_000,
  currentGap: 2_000,
  proposedChange: 3_000,
  unchangedBoundary: 1_600,
  publicSummary: 1_200,
  privateDetails: 5_000,
  referenceLinks: 1_600,
} as const;

function fail(message: string): never {
  throw new TypeError(`Invalid Plugin Lab proposal: ${message}`);
}

function plainRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("submission must be a plain object.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => !("value" in descriptor))) fail("submission cannot contain accessors.");
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, label: keyof typeof limits, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string") fail(`${label} must be text.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > limits[label]) fail(`${label} is empty or too long.`);
  if (/[\u0000-\u001f\u007f]/u.test(normalized.replace(/\r?\n/gu, ""))) fail(`${label} contains unsafe control characters.`);
  return normalized;
}

function safeHttpsLinks(value: unknown, representation: "form" | "stored") {
  let lines: string[];
  if (representation === "stored") {
    if (!Array.isArray(value) || value.some((line) => typeof line !== "string")) fail("referenceLinks is invalid.");
    lines = value;
    // A Unicode code unit can expand to nine percent-encoded URL characters;
    // allow one canonical trailing slash for each of the eight permitted URLs.
    if (lines.reduce((total, line) => total + line.length, 0) > limits.referenceLinks * 9 + 8) fail("referenceLinks is invalid.");
  } else {
    if (value === undefined || value === null || value === "") return [];
    if (typeof value !== "string" || value.length > limits.referenceLinks) fail("referenceLinks is invalid.");
    lines = value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  }
  if (lines.length > 8) fail("referenceLinks contains too many links.");
  const parsed = lines.map((line) => {
    let url: URL;
    try { url = new URL(line); } catch { fail("referenceLinks must contain HTTPS URLs."); }
    if (url.protocol !== "https:" || url.username || url.password) fail("referenceLinks must contain HTTPS URLs without credentials.");
    if (representation === "stored" && url.toString() !== line) fail("referenceLinks must contain canonical URLs.");
    return url.toString();
  });
  if (new Set(parsed).size !== parsed.length) fail("referenceLinks contains duplicates.");
  return parsed;
}

function assertNoCredentialLikeContent(values: readonly string[]) {
  const joined = values.join("\n");
  if (/\b(?:password|passwd|api[_ -]?key|secret|bearer|access[_ -]?token)\s*[:=]\s*\S+/iu.test(joined)) {
    fail("credential-like content is not accepted.");
  }
}

function parseProposalSubmission(value: unknown, representation: "form" | "stored"): PluginProposalSubmission {
  const record = plainRecord(value);
  const version2 = record.schemaVersion === 2;
  if (Object.hasOwn(record, "schemaVersion") && !version2) fail("schemaVersion is unsupported.");
  const unknown = Object.keys(record).filter((key) => !(SUBMISSION_KEYS as readonly string[]).includes(key) && !(version2 && key === "schemaVersion"));
  if (unknown.length > 0) fail(`submission contains unknown field ${unknown[0]}.`);
  const required = version2 ? ["email", "title", "researchQuestion", "proposedChange", "dataSafetyConfirmed", "privacyConsent"] : SUBMISSION_KEYS;
  const missing = required.filter((key) => !Object.hasOwn(record, key));
  if (missing.length > 0) fail(`submission is missing ${missing[0]}.`);

  if (typeof record.email !== "string") fail("email is invalid.");
  const email = record.email.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) fail("email is invalid.");
  const name = boundedText(record.name, "name", true);
  const affiliation = boundedText(record.affiliation, "affiliation", true);
  const title = boundedText(record.title, "title")!;
  const researchQuestion = boundedText(record.researchQuestion, "researchQuestion")!;
  const currentGap = boundedText(record.currentGap, "currentGap", version2) ?? "";
  const proposedChange = boundedText(record.proposedChange, "proposedChange")!;
  const unchangedBoundary = boundedText(record.unchangedBoundary, "unchangedBoundary", version2) ?? "";
  const visibility = version2 && record.visibility === undefined ? "private" : record.visibility;
  const track = version2 && record.track === undefined ? "unsure" : record.track;
  const publicSummary = boundedText(record.publicSummary, "publicSummary", version2 && visibility === "private") ?? "";
  const privateDetails = boundedText(record.privateDetails, "privateDetails", version2) ?? "";
  const referenceLinks = safeHttpsLinks(version2 && record.referenceLinks === undefined ? (representation === "stored" ? [] : "") : record.referenceLinks, representation);
  if (visibility !== "private" && visibility !== "public-after-review") fail("visibility is unsupported.");
  if (track !== "academic" && track !== "commissioned" && track !== "unsure") fail("track is unsupported.");
  const confirmed = representation === "stored" ? true : "yes";
  if (record.dataSafetyConfirmed !== confirmed) fail("the data-safety confirmation is required.");
  if (record.privacyConsent !== confirmed) fail("privacy consent is required.");
  assertNoCredentialLikeContent([title, researchQuestion, currentGap, proposedChange, unchangedBoundary, publicSummary, privateDetails, ...referenceLinks]);

  return Object.freeze({
    ...(version2 ? { schemaVersion: 2 as const } : {}),
    email, name, affiliation, title, researchQuestion, currentGap, proposedChange,
    unchangedBoundary, publicSummary, privateDetails, referenceLinks: Object.freeze(referenceLinks),
    visibility,
    track,
    dataSafetyConfirmed: true as const,
    privacyConsent: true as const,
  });
}

export function parsePluginProposalSubmission(value: unknown): PluginProposalSubmission {
  return parseProposalSubmission(value, "form");
}

export function parseStoredPluginProposalSubmission(value: unknown): PluginProposalSubmission {
  return parseProposalSubmission(value, "stored");
}

const TRANSITIONS: Readonly<Record<PluginProposalState, readonly PluginProposalState[]>> = {
  received: ["under-review", "withdrawn"],
  "under-review": ["needs-information", "selected", "not-selected", "withdrawn"],
  "needs-information": ["under-review", "selected", "not-selected", "withdrawn"],
  selected: ["withdrawn"],
  "not-selected": [],
  withdrawn: [],
};

export function assertPluginProposalTransition(from: PluginProposalState, to: PluginProposalState) {
  if (!TRANSITIONS[from]?.includes(to)) throw new TypeError(`Plugin proposal transition ${from} -> ${to} is not allowed.`);
}

export function isPluginProposalState(value: unknown): value is PluginProposalState {
  return typeof value === "string" && Object.hasOwn(TRANSITIONS, value);
}
