import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runQwenFixedNine, auditQwenPreservation, type QwenMatrixDependencies } from "../scripts/verify-open-ena-qwen-live-matrix";

const fixtureBytes = readFileSync("tests/fixtures/ai-live-fixed-synthetic-request-20261026.json");
const apiKey = "synthetic-memory-only-candidate-key";
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const snapshot = () => ({ candidateGitSha: "a".repeat(40), criticalSourceSha256: { "fixture.json": sha256(fixtureBytes) }, worktreeClean: true });
const interpretation = () => ({ observedPatterns: [{ statement: "  The two aggregate groups differ descriptively.  ", evidenceRefs: ["descriptive-primary", "descriptive-secondary"] }], contextualQuestions: [" What sampling conditions apply? "], limitations: [" No causal conclusion follows. "] });

async function successful(request: Parameters<NonNullable<QwenMatrixDependencies["generate"]>>[0]) {
  const { prepareQwenCandidateRequest, QWEN_CANDIDATE } = await import("../scripts/lib/open-ena-qwen-candidate");
  const rawInterpretation = interpretation();
  const accepted = { observedPatterns: rawInterpretation.observedPatterns.map(item => ({ ...item, statement: item.statement.trim() })), contextualQuestions: rawInterpretation.contextualQuestions.map(item => item.trim()), limitations: rawInterpretation.limitations.map(item => item.trim()) };
  const rawBody = Buffer.from(JSON.stringify({ model: QWEN_CANDIDATE.model, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(rawInterpretation) } }], usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } }));
  return { interpretation: accepted, rawInterpretation, usage: { promptTokens: 20, completionTokens: 30, totalTokens: 50 }, rawBody, responseModel: QWEN_CANDIDATE.model, finishReason: "stop", httpStatus: 200, outgoingRequestBody: JSON.stringify(prepareQwenCandidateRequest(request).body) };
}

async function fixture(run: (directory: string, deps: QwenMatrixDependencies) => Promise<void>) {
  const parent = mkdtempSync(join(tmpdir(), "ena-qwen-matrix-"));
  try { await run(join(parent, "new-run"), { fixtureBytes, snapshotSources: snapshot, generate: successful }); }
  finally { rmSync(parent, { recursive: true, force: true }); }
}

test("default preflight freezes nine cases and never invokes generation or reads a key", async () => fixture(async (directory, deps) => {
  let calls = 0;
  const result = await runQwenFixedNine({ outputDirectory: directory }, { ...deps, generate: async () => { calls++; throw new Error("must not dispatch"); } });
  assert.equal(result.mode, "preflight"); assert.equal(calls, 0); assert.equal(existsSync(directory), false);
  assert.deepEqual(result.plan.cases.map(item => item.locale), ["en", "en", "en", "zh-hans", "zh-hans", "zh-hans", "zh-hant", "zh-hant", "zh-hant"]);
  assert.equal(result.plan.fixedFixtureSha256, "06c65f11f455236448275d7327e62e153558e2c8312b81b9310e9e4d4c9fc9dd");
  assert.equal(result.plan.candidate.maximumOutputTokens, 1800);
  assert.equal(result.plan.candidate.timeoutMilliseconds, 20000);
}));

test("run-nine rejects changed fixture bytes and missing key before generation", async () => fixture(async (directory, deps) => {
  let calls = 0; const generate: NonNullable<QwenMatrixDependencies["generate"]> = async request => { calls++; return successful(request); };
  await assert.rejects(runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, generate, fixtureBytes: Buffer.concat([fixtureBytes, Buffer.from(" ")]) }), { code: "fixture-mismatch" });
  await assert.rejects(runQwenFixedNine({ runNine: true, outputDirectory: directory }, { ...deps, generate }), { code: "missing-api-key" });
  assert.equal(calls, 0); assert.equal(existsSync(directory), false);
}));

test("nine calls preserve order and same-locale body hashes with private artifacts", async () => fixture(async (directory, deps) => {
  const locales: string[] = [];
  const result = await runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, generate: async request => { locales.push(request.locale); return successful(request); } });
  assert.equal(result.receipt?.status, "PASS"); assert.equal(result.receipt?.attemptedCases, 9);
  assert.equal(result.receipt?.acceptedCases, 9); assert.equal(result.receipt?.preservationPassedCases, 9);
  assert.ok(result.receipt?.cases.every(item => Number.isFinite(Date.parse(item.startedAt)) && Date.parse(item.finishedAt) >= Date.parse(item.startedAt)));
  assert.deepEqual(locales, result.plan.cases.map(item => item.locale));
  for (const locale of ["en", "zh-hans", "zh-hant"]) assert.equal(new Set(result.plan.cases.filter(item => item.locale === locale).map(item => item.outgoingBodySha256)).size, 1);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  for (const file of readdirSync(directory)) assert.equal(statSync(join(directory, file)).mode & 0o777, 0o600, file);
  assert.equal(readdirSync(directory).filter(file => file.endsWith(".raw.bin")).length, 9);
  assert.equal(readdirSync(directory).filter(file => file.endsWith(".accepted.json")).length, 9);
  const publicReceipt = readFileSync(join(directory, "receipt.json"), "utf8");
  assert.ok(!publicReceipt.includes("The two aggregate groups")); assert.ok(!publicReceipt.includes(apiKey)); assert.ok(!publicReceipt.includes("costMicroUsd"));
}));

test("a failed case is recorded with allowlisted metadata and all remaining cases are attempted once", async () => fixture(async (directory, deps) => {
  let calls = 0;
  const result = await runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, generate: async request => {
    if (++calls === 2) { const { QwenCandidateError } = await import("../scripts/lib/open-ena-qwen-candidate"); throw new QwenCandidateError("http-error", { providerDispatched: true, httpStatus: 503, usage: { promptTokens: 4, completionTokens: 1, totalTokens: 5 }, rawBody: Buffer.from('{"error":{"message":"private upstream prose"}}') }); }
    return successful(request);
  } });
  assert.equal(calls, 9); assert.equal(result.receipt?.status, "FAIL"); assert.equal(result.receipt?.acceptedCases, 8);
  const failed = result.receipt!.cases[1]; assert.equal(failed.errorCode, "http-error"); assert.equal(failed.httpStatus, 503); assert.equal(failed.usage?.totalTokens, 5); assert.equal(failed.responseCapture, "complete");
  assert.ok(!JSON.stringify(result.receipt).includes("private upstream prose"));
}));

test("preservation rejects reference drop, pattern splitting, reordering and disclosure deletion", () => {
  const raw = interpretation();
  const valid = { observedPatterns: raw.observedPatterns.map(item => ({ ...item, statement: item.statement.trim() })), contextualQuestions: raw.contextualQuestions.map(item => item.trim()), limitations: raw.limitations.map(item => item.trim()) };
  assert.equal(auditQwenPreservation(raw, valid), true);
  for (const changed of [
    { ...valid, observedPatterns: [{ ...valid.observedPatterns[0], evidenceRefs: ["descriptive-primary"] }] },
    { ...valid, observedPatterns: [...valid.observedPatterns, ...valid.observedPatterns] },
    { ...valid, observedPatterns: [{ ...valid.observedPatterns[0], evidenceRefs: [...valid.observedPatterns[0].evidenceRefs].reverse() }] },
    { ...valid, limitations: [] },
  ]) assert.equal(auditQwenPreservation(raw, changed), false);
  assert.equal(auditQwenPreservation({ ...raw, responseFormatNote: "Must remain visible" }, valid), false);
});

test("changed accepted content makes a live case fail its preservation gate", async () => fixture(async (directory, deps) => {
  const result = await runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, generate: async request => { const value = await successful(request); value.interpretation.observedPatterns[0].evidenceRefs.pop(); return value; } });
  assert.equal(result.receipt?.status, "FAIL"); assert.equal(result.receipt?.acceptedCases, 0); assert.equal(result.receipt?.preservationPassedCases, 0);
  assert.ok(result.receipt?.cases.every(item => item.errorCode === "preservation-failed"));
  assert.equal(readdirSync(directory).filter(file => file.endsWith(".accepted.json")).length, 0);
}));

test("existing output is never overwritten and no generation begins", async () => fixture(async (directory, deps) => {
  writeFileSync(directory, "keep-existing-byte-for-byte", { mode: 0o600 }); let calls = 0;
  await assert.rejects(runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, generate: async request => { calls++; return successful(request); } }), { code: "output-exists" });
  assert.equal(readFileSync(directory, "utf8"), "keep-existing-byte-for-byte"); assert.equal(calls, 0);
}));

test("raw responses containing the in-memory key or a credential pattern never reach disk", async () => fixture(async (directory, deps) => {
  let calls = 0;
  const result = await runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, generate: async request => { const value = await successful(request); value.rawBody = Buffer.from(JSON.stringify({ leaked: ++calls % 2 ? apiKey : "sk-syntheticcredentialpattern123456789" })); return value; } });
  assert.equal(calls, 9); assert.equal(result.receipt?.status, "FAIL");
  assert.ok(result.receipt?.cases.every(item => item.errorCode === "credential-detected" && item.responseCapture === "rejected-sensitive"));
  assert.equal(readdirSync(directory).filter(file => file.endsWith(".raw.bin") || file.endsWith(".accepted.json")).length, 0);
  for (const name of readdirSync(directory)) { const text = readFileSync(join(directory, name), "utf8"); assert.ok(!text.includes(apiKey)); assert.ok(!text.includes("sk-synthetic")); }
}));

test("truncated error bytes remain explicitly truncated and cannot count as accepted", async () => fixture(async (directory, deps) => {
  const { QwenCandidateError } = await import("../scripts/lib/open-ena-qwen-candidate");
  const result = await runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, generate: async () => { throw new QwenCandidateError("response-too-large", { providerDispatched: true, httpStatus: 200, rawBody: Buffer.from("partial") }); } });
  assert.equal(result.receipt?.status, "FAIL"); assert.equal(result.receipt?.attemptedCases, 9);
  assert.ok(result.receipt?.cases.every(item => item.responseCapture === "truncated" && item.errorCode === "response-too-large"));
}));

test("source drift fails the receipt after all nine cases without leaking exception text", async () => fixture(async (directory, deps) => {
  let snapshots = 0;
  const result = await runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, snapshotSources: () => ({ ...snapshot(), candidateGitSha: ++snapshots > 1 ? "b".repeat(40) : "a".repeat(40) }) });
  assert.equal(result.receipt?.attemptedCases, 9); assert.equal(result.receipt?.status, "FAIL"); assert.equal(result.receipt?.sourceInvariant, false);
}));

test("missing or excessive usage prevents complete nine-case acceptance", async () => fixture(async (directory, deps) => {
  let calls = 0;
  const result = await runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, generate: async request => ({ ...await successful(request), usage: ++calls % 2 ? null : { promptTokens: 20, completionTokens: 1801, totalTokens: 1821 } }) });
  assert.equal(calls, 9); assert.equal(result.receipt?.status, "FAIL"); assert.equal(result.receipt?.acceptedCases, 0);
  assert.deepEqual(result.receipt?.cases.map(item => item.usageAudit), ["unverified", "fail", "unverified", "fail", "unverified", "fail", "unverified", "fail", "unverified"]);
}));

test("a raw artifact collision preserves its bytes and does not repeat the case", async () => fixture(async (directory, deps) => {
  let calls = 0;
  const result = await runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, generate: async request => { if (++calls === 1) writeFileSync(join(directory, "01-en.raw.bin"), "existing-proof", { flag: "wx", mode: 0o600 }); return successful(request); } });
  assert.equal(calls, 9); assert.equal(result.receipt?.status, "FAIL"); assert.equal(result.receipt?.cases[0].errorCode, "storage-failed");
  assert.equal(readFileSync(join(directory, "01-en.raw.bin"), "utf8"), "existing-proof");
}));

test("timeout prefixes stay partial and untrusted exception prose stays out of receipts", async () => fixture(async (directory, deps) => {
  const { QwenCandidateError } = await import("../scripts/lib/open-ena-qwen-candidate"); let calls = 0;
  const result = await runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, generate: async () => { if (++calls === 1) throw new Error("private provider text " + apiKey); throw new QwenCandidateError("timeout", { providerDispatched: true, httpStatus: 200, rawBody: Buffer.from("partial") }); } });
  assert.equal(calls, 9); assert.equal(result.receipt?.cases[0].errorCode, "unexpected-error");
  assert.ok(result.receipt?.cases.slice(1).every(item => item.responseCapture === "partial"));
  assert.ok(!JSON.stringify(result.receipt).includes(apiKey)); assert.ok(!JSON.stringify(result.receipt).includes("private provider text"));
}));

test("escaped credentials inside provider message JSON are rejected before raw persistence", async () => fixture(async (directory, deps) => {
  const { generateQwenCandidate, QWEN_CANDIDATE } = await import("../scripts/lib/open-ena-qwen-candidate"); let calls = 0;
  const unsafe = { ...interpretation(), limitations: [apiKey] };
  const nested = JSON.stringify(unsafe).replace(apiKey, "\\u0073" + apiKey.slice(1));
  const raw = JSON.stringify({ model: QWEN_CANDIDATE.model, choices: [{ finish_reason: "stop", message: { role: "assistant", content: nested } }], usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } });
  assert.equal(raw.includes(apiKey), false);
  const result = await runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, generate: request => generateQwenCandidate(request, { apiKey, fetch: async () => { calls++; return new Response(raw, { status: 200 }); } }) });
  assert.equal(calls, 9); assert.equal(result.receipt?.status, "FAIL");
  assert.ok(result.receipt?.cases.every(item => item.errorCode === "credential-detected" && item.responseCapture === "rejected-sensitive"));
  assert.equal(readdirSync(directory).filter(file => file.endsWith(".raw.bin") || file.endsWith(".accepted.json")).length, 0);
}));

test("uninspectably deep JSON fails closed before writing a raw response", async () => fixture(async (directory, deps) => {
  let deep: unknown = "safe text"; for (let index = 0; index < 20; index++) deep = { nested: deep };
  const result = await runQwenFixedNine({ runNine: true, outputDirectory: directory, apiKey }, { ...deps, generate: async request => ({ ...await successful(request), rawBody: Buffer.from(JSON.stringify(deep)) }) });
  assert.equal(result.receipt?.status, "FAIL"); assert.ok(result.receipt?.cases.every(item => item.responseCapture === "rejected-sensitive"));
  assert.equal(readdirSync(directory).filter(file => file.endsWith(".raw.bin")).length, 0);
}));
