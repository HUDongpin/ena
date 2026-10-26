import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { collectOpenEnaAiEvidenceIds, parseInterpretationV2, type OpenEnaAiInterpretationRequestV2 } from "../lib/open-ena/ai-interpretation";
import { getApprovedOpenEnaAiPromptArtifact, stableCanonicalJson } from "../lib/server/open-ena-ai-prompt-governance";
import { generateQwenCandidate, prepareQwenCandidateRequest, QWEN_CANDIDATE, QwenCandidateError, type QwenCandidateResult, type QwenCandidateUsage } from "./lib/open-ena-qwen-candidate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = "tests/fixtures/ai-live-fixed-synthetic-request-20261026.json";
const fixtureSha256 = "06c65f11f455236448275d7327e62e153558e2c8312b81b9310e9e4d4c9fc9dd";
const locales = ["en", "zh-hans", "zh-hant"] as const;
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const criticalFiles = [fixturePath, "scripts/verify-open-ena-qwen-live-matrix.ts", "scripts/lib/open-ena-qwen-candidate.ts", "lib/open-ena/ai-interpretation.ts", "lib/server/open-ena-ai-prompt-governance.ts", "package-lock.json"];
type SourceSnapshot = { candidateGitSha: string; criticalSourceSha256: Record<string, string>; worktreeClean: boolean };
export type QwenMatrixDependencies = { fixtureBytes?: Uint8Array; snapshotSources?: () => SourceSnapshot; generate?: typeof generateQwenCandidate };
type Options = { runNine?: boolean; outputDirectory?: string; apiKey?: string };
const errorCodes = new Set(["invalid-request", "invalid-api-key", "invalid-timeout", "network", "timeout", "http-error", "response-too-large", "invalid-json", "invalid-response", "incomplete-response", "invalid-interpretation", "fixture-mismatch", "missing-api-key", "invalid-output", "output-exists", "source-changed", "dirty-source", "preservation-failed", "credential-detected", "storage-failed", "request-changed", "usage-unverified", "usage-over-budget", "unexpected-error"]);
class MatrixError extends Error { constructor(readonly code: string) { super(code); } }
function fail(code: string): never { throw new MatrixError(code); }
function safeCode(error: unknown) { return error instanceof MatrixError || error instanceof QwenCandidateError ? errorCodes.has(error.code) ? error.code : "unexpected-error" : "unexpected-error"; }
function sourceSnapshot(): SourceSnapshot {
  const git = (args: string[]) => execFileSync("git", ["--no-optional-locks", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  return { candidateGitSha: git(["rev-parse", "HEAD"]), criticalSourceSha256: Object.fromEntries(criticalFiles.map(path => [path, sha256(readFileSync(join(root, path)))])), worktreeClean: git(["status", "--porcelain", "--untracked-files=normal"]) === "" };
}
function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> { const found = record(value); return found !== null && isDeepStrictEqual(Object.keys(found).sort(), [...keys].sort()); }
export function auditQwenPreservation(raw: unknown, accepted: unknown): boolean {
  if (!exactKeys(raw, ["observedPatterns", "contextualQuestions", "limitations"]) || !exactKeys(accepted, Object.keys(raw))) return false;
  if (!Array.isArray(raw.observedPatterns) || !Array.isArray(accepted.observedPatterns) || raw.observedPatterns.length !== accepted.observedPatterns.length) return false;
  const patterns = accepted.observedPatterns;
  if (!raw.observedPatterns.every((item, index) => exactKeys(item, ["statement", "evidenceRefs"]) && exactKeys(patterns[index], ["statement", "evidenceRefs"]) && typeof item.statement === "string" && item.statement.trim() === patterns[index].statement && isDeepStrictEqual(item.evidenceRefs, patterns[index].evidenceRefs))) return false;
  return ["contextualQuestions", "limitations"].every(key => Array.isArray(raw[key]) && Array.isArray(accepted[key]) && isDeepStrictEqual((raw[key] as unknown[]).map(item => typeof item === "string" ? item.trim() : null), accepted[key]));
}
function sensitive(bytes: Uint8Array, apiKey: string): boolean {
  const unsafe = (value: string) => value.includes(apiKey) || /sk-[A-Za-z0-9_-]{8,}/u.test(value);
  const pending: Array<{ value: unknown; depth: number }> = [{ value: Buffer.from(bytes).toString("utf8"), depth: 0 }]; let inspected = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (depth > 16 || ++inspected > 10000) return true;
    if (typeof value === "string") {
      if (unsafe(value)) return true;
      // message.content is itself JSON text; outer parsing alone leaves its escapes intact.
      try { pending.push({ value: JSON.parse(value), depth: depth + 1 }); } catch { /* Plain prose has no additional JSON layer. */ }
    } else if (Array.isArray(value)) for (const item of value) pending.push({ value: item, depth: depth + 1 });
    else if (record(value)) for (const [key, item] of Object.entries(value as Record<string, unknown>)) { if (unsafe(key)) return true; pending.push({ value: item, depth: depth + 1 }); }
  }
  return false;
}
function writePrivate(directory: string, filename: string, bytes: string | Uint8Array) {
  try { writeFileSync(join(directory, filename), bytes, { flag: "wx", mode: 0o600 }); }
  catch { fail("storage-failed"); }
}
function usageAudit(value: QwenCandidateUsage | null | undefined): { usage: QwenCandidateUsage | null; status: "pass" | "unverified" | "fail" } {
  if (!value || ![value.promptTokens, value.completionTokens, value.totalTokens].every(token => Number.isSafeInteger(token) && token >= 0) || value.promptTokens + value.completionTokens !== value.totalTokens) return { usage: null, status: "unverified" };
  const usage = { promptTokens: value.promptTokens, completionTokens: value.completionTokens, totalTokens: value.totalTokens };
  return { usage, status: usage.completionTokens <= 1800 ? "pass" : "fail" };
}
function preparePlan(bytes: Uint8Array, before: SourceSnapshot) {
  if (sha256(bytes) !== fixtureSha256) fail("fixture-mismatch");
  if (QWEN_CANDIDATE.maximumOutputTokens !== 1800 || QWEN_CANDIDATE.timeoutMilliseconds !== 20000 || QWEN_CANDIDATE.model !== "qwen3.7-plus-2026-05-26" || QWEN_CANDIDATE.region !== "cn-beijing") fail("invalid-request");
  const fixture = JSON.parse(Buffer.from(bytes).toString("utf8")) as OpenEnaAiInterpretationRequestV2;
  const prepared = locales.map(locale => {
    const value = prepareQwenCandidateRequest({ ...fixture, locale });
    const approved = getApprovedOpenEnaAiPromptArtifact(fixture.promptVersion, locale);
    if (value.body.messages[0].content !== approved.systemPrompt || value.body.max_tokens !== 1800) fail("request-changed");
    return { ...value, locale, outgoingBodySha256: sha256(JSON.stringify(value.body)), systemPromptSha256: sha256(approved.systemPrompt), approvedArtifactSha256: approved.contentSha256, sourceSchemaSha256: sha256(stableCanonicalJson(value.originalSchema)), transportSchemaSha256: sha256(stableCanonicalJson(value.transportSchema)) };
  });
  const cases = prepared.flatMap(item => [1, 2, 3].map(repetition => ({ id: `${String(locales.indexOf(item.locale) * 3 + repetition).padStart(2, "0")}-${item.locale}`, locale: item.locale, repetition, outgoingBodySha256: item.outgoingBodySha256 })));
  const plan = { schemaVersion: "open-ena-qwen-fixed-nine-v1", candidate: QWEN_CANDIDATE, fixedFixtureSha256: fixtureSha256, evidenceSha256: sha256(stableCanonicalJson(fixture.evidence)), promptVersion: fixture.promptVersion, sources: before, cases, localeContracts: prepared.map(item => ({ locale: item.locale, systemPromptSha256: item.systemPromptSha256, approvedArtifactSha256: item.approvedArtifactSha256, sourceSchemaSha256: item.sourceSchemaSha256, transportSchemaSha256: item.transportSchemaSha256, omittedSchemaKeywords: item.omittedSchemaKeywords })), retries: 0, repairCalls: 0, fallbackCalls: 0, maximumGenerationPosts: 9 };
  return { plan, prepared };
}
type CaseReceipt = {
  id: string; locale: string; repetition: number; outgoingBodySha256: string; status: "PASS" | "FAIL"; errorCode: string | null;
  providerDispatched: boolean; startedAt: string; finishedAt: string; elapsedMilliseconds: number; httpStatus: number | null; finishReason: string | null; returnedModelMatches: boolean;
  usage: QwenCandidateUsage | null; usageAudit: "pass" | "unverified" | "fail"; preservationAudit: "pass" | "unverified" | "fail";
  responseCapture: "complete" | "partial" | "truncated" | "unavailable" | "rejected-sensitive"; rawSha256: string | null; rawBytes: number;
  rawFile: string | null; acceptedFile: string | null; acceptedSha256: string | null;
};
type MatrixReceipt = { status: "PASS" | "FAIL"; candidate: typeof QWEN_CANDIDATE; planSha256: string; before: SourceSnapshot; after: SourceSnapshot | null; sourceInvariant: boolean; attemptedCases: number; providerDispatchedCases: number; acceptedCases: number; preservationPassedCases: number; usagePassedCases: number; cases: CaseReceipt[] };

export async function runQwenFixedNine(options: Options = {}, dependencies: QwenMatrixDependencies = {}) {
  const snapshotSources = dependencies.snapshotSources ?? sourceSnapshot;
  const before = snapshotSources();
  const { plan, prepared } = preparePlan(dependencies.fixtureBytes ?? readFileSync(join(root, fixturePath)), before);
  if (!options.runNine) return { mode: "preflight" as const, plan, receipt: undefined };
  const apiKey = options.apiKey?.trim();
  if (!apiKey) fail("missing-api-key");
  if (!before.worktreeClean) fail("dirty-source");
  const directory = options.outputDirectory;
  if (!directory || !isAbsolute(directory)) fail("invalid-output");
  try { mkdirSync(directory, { mode: 0o700 }); } catch (error) { if (record(error)?.code === "EEXIST") fail("output-exists"); fail("invalid-output"); }
  const planBytes = json(plan); writePrivate(directory, "plan.json", planBytes);
  const cases: CaseReceipt[] = [];
  const generate = dependencies.generate ?? generateQwenCandidate;
  for (const item of plan.cases) {
    const contract = prepared.find(value => value.locale === item.locale)!;
    const entry: CaseReceipt = { ...item, status: "FAIL", errorCode: null, providerDispatched: false, startedAt: new Date().toISOString(), finishedAt: "", elapsedMilliseconds: 0, httpStatus: null, finishReason: null, returnedModelMatches: false, usage: null, usageAudit: "unverified", preservationAudit: "unverified", responseCapture: "unavailable", rawSha256: null, rawBytes: 0, rawFile: null, acceptedFile: null, acceptedSha256: null };
    let result: QwenCandidateResult | undefined, failure: unknown;
    const started = performance.now();
    try { result = await generate(structuredClone(contract.normalizedRequest), { apiKey, timeoutMs: 20000 }); entry.providerDispatched = true; }
    catch (error) { failure = error; entry.errorCode = safeCode(error); if (error instanceof QwenCandidateError) entry.providerDispatched = error.providerDispatched; }
    entry.elapsedMilliseconds = Math.round(performance.now() - started);
    const details = result ?? (failure instanceof QwenCandidateError ? failure : undefined);
    const raw = details?.rawBody;
    try {
      if (raw !== undefined) {
        entry.rawSha256 = sha256(raw); entry.rawBytes = raw.byteLength;
        if (sensitive(raw, apiKey)) { entry.responseCapture = "rejected-sensitive"; fail("credential-detected"); }
        entry.responseCapture = entry.errorCode === "response-too-large" ? "truncated" : ["timeout", "network"].includes(entry.errorCode ?? "") ? "partial" : "complete";
        writePrivate(directory, `${item.id}.raw.bin`, raw); entry.rawFile = `${item.id}.raw.bin`;
      }
      entry.httpStatus = Number.isInteger(details?.httpStatus) && details!.httpStatus! >= 100 && details!.httpStatus! <= 599 ? details!.httpStatus! : null;
      entry.finishReason = ["stop", "length", "content_filter", "tool_calls", "function_call"].includes(details?.finishReason ?? "") ? details!.finishReason! : null;
      entry.returnedModelMatches = details?.responseModel === QWEN_CANDIDATE.model;
      const usage = usageAudit(details?.usage); entry.usage = usage.usage; entry.usageAudit = usage.status;
      if (result) {
        if (sha256(result.outgoingRequestBody) !== item.outgoingBodySha256) fail("request-changed");
        if (!entry.returnedModelMatches || entry.finishReason !== "stop" || entry.httpStatus !== 200 || entry.responseCapture !== "complete") fail("invalid-response");
        let rawContent: unknown;
        try { const envelope = JSON.parse(Buffer.from(result.rawBody).toString("utf8")); rawContent = JSON.parse(envelope.choices[0].message.content); } catch { fail("invalid-json"); }
        entry.preservationAudit = isDeepStrictEqual(rawContent, result.rawInterpretation) && auditQwenPreservation(rawContent, result.interpretation) ? "pass" : "fail";
        if (entry.preservationAudit !== "pass") fail("preservation-failed");
        try { parseInterpretationV2(result.interpretation, collectOpenEnaAiEvidenceIds(contract.normalizedRequest.evidence)); } catch { fail("invalid-interpretation"); }
        if (entry.usageAudit !== "pass") fail(entry.usageAudit === "fail" ? "usage-over-budget" : "usage-unverified");
        const accepted = json(result.interpretation);
        if (sensitive(Buffer.from(accepted), apiKey)) fail("credential-detected");
        writePrivate(directory, `${item.id}.accepted.json`, accepted);
        entry.acceptedFile = `${item.id}.accepted.json`; entry.acceptedSha256 = sha256(accepted); entry.status = "PASS";
      }
    } catch (error) { entry.errorCode = safeCode(error); }
    entry.finishedAt = new Date().toISOString(); cases.push(entry);
    try { writePrivate(directory, `${item.id}.receipt.json`, json(entry)); } catch { entry.status = "FAIL"; entry.errorCode = "storage-failed"; }
  }
  let after: SourceSnapshot | null = null;
  try { after = snapshotSources(); } catch { /* A missing final source snapshot fails the run. */ }
  const sourceInvariant = isDeepStrictEqual(before, after) && after?.worktreeClean === true;
  const acceptedCases = cases.filter(item => item.status === "PASS").length;
  const preservationPassedCases = cases.filter(item => item.preservationAudit === "pass").length;
  const usagePassedCases = cases.filter(item => item.usageAudit === "pass").length;
  const providerDispatchedCases = cases.filter(item => item.providerDispatched).length;
  const receipt: MatrixReceipt = { status: acceptedCases === 9 && preservationPassedCases === 9 && usagePassedCases === 9 && providerDispatchedCases === 9 && sourceInvariant ? "PASS" : "FAIL", candidate: QWEN_CANDIDATE, planSha256: sha256(planBytes), before, after, sourceInvariant, attemptedCases: cases.length, providerDispatchedCases, acceptedCases, preservationPassedCases, usagePassedCases, cases };
  writePrivate(directory, "receipt.json", json(receipt));
  return { mode: "run-nine" as const, plan, receipt };
}

export async function qwenMatrixMain(args = process.argv.slice(2)): Promise<number> {
  try {
    const runNine = args.includes("--run-nine"), outputIndex = args.indexOf("--output");
    const allowed = new Set(["--run-nine", "--preflight", "--output"]);
    if (args.some((arg, index) => !(outputIndex >= 0 && index === outputIndex + 1) && !allowed.has(arg)) || (args.includes("--preflight") && runNine) || (outputIndex >= 0 && (!args[outputIndex + 1] || args[outputIndex + 1].startsWith("--")))) fail("invalid-output");
    const result = await runQwenFixedNine({ runNine, outputDirectory: outputIndex >= 0 ? resolve(args[outputIndex + 1]) : undefined, ...(runNine ? { apiKey: process.env.DASHSCOPE_API_KEY } : {}) });
    console.log(json(result.mode === "preflight" ? result : { mode: result.mode, status: result.receipt.status, candidate: QWEN_CANDIDATE, attemptedCases: result.receipt.attemptedCases, acceptedCases: result.receipt.acceptedCases, preservationPassedCases: result.receipt.preservationPassedCases, usagePassedCases: result.receipt.usagePassedCases, sourceInvariant: result.receipt.sourceInvariant }));
    return result.mode === "preflight" || result.receipt.status === "PASS" ? 0 : 1;
  } catch (error) { console.error(JSON.stringify({ status: "FAIL", errorCode: safeCode(error) })); return 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await qwenMatrixMain();
