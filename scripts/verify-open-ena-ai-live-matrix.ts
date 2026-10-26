import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { generateLunaInterpretation, LunaClientError, OPEN_ENA_AI_MAX_RESPONSE_BYTES } from "../lib/server/deepseek-client";
import { parseOpenEnaAiInterpretationRequestV2, collectOpenEnaAiEvidenceIds } from "../lib/open-ena/ai-interpretation";
import { getApprovedOpenEnaAiPromptArtifact } from "../lib/server/open-ena-ai-prompt-governance";

// Explicitly bounded acceptance run: three consecutive calls per locale, one
// fixed synthetic evidence set, one provider dispatch per call, no retries.
const [fixtureFile, directoryArgument, mode] = process.argv.slice(2);
assert.ok(fixtureFile && directoryArgument, "Usage: script <fixed-synthetic-request.json> <new-output-directory> [--run-nine]");
assert.ok(mode === undefined || mode === "--run-nine");
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const originalBytes = await readFile(fixtureFile);
const original = parseOpenEnaAiInterpretationRequestV2(JSON.parse(originalBytes.toString("utf8")));
const evidenceHash = digest(JSON.stringify(original.evidence));
const locales = ["en", "zh-hans", "zh-hant"] as const;
const plan = locales.flatMap(locale => Array.from({ length: 3 }, (_, index) => {
  const request = parseOpenEnaAiInterpretationRequestV2({ ...original, locale });
  assert.equal(digest(JSON.stringify(request.evidence)), evidenceHash);
  return { locale, repeat: index + 1, request, requestSha256: digest(JSON.stringify(request)),
    promptSha256: digest(getApprovedOpenEnaAiPromptArtifact(request.promptVersion, locale).systemPrompt) };
}));
assert.equal(plan.length, 9);
const sourceFiles = ["lib/server/deepseek-client.ts", "lib/server/open-ena-ai-provider-projection.ts", "lib/open-ena/ai-interpretation.ts"];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, digest(await readFile(file))])));
const candidateSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const setup = { candidateSha, fixtureSha256: digest(originalBytes), evidenceSha256: evidenceHash,
  sourceHashes, model: "deepseek-flash", timeoutMilliseconds: 20_000, maximumOutputTokens: 1_800,
  cases: plan.map(({ request: _request, ...entry }) => entry), retries: 0, deployment: false };
if (mode !== "--run-nine") {
  console.log(JSON.stringify({ mode: "preflight-only", ...setup }, null, 2));
  process.exit(0);
}

const apiKey = process.env.DEEPSEEK_API_KEY;
assert.ok(apiKey, "A process-memory DEEPSEEK_API_KEY is required");
execFileSync("git", ["diff", "--quiet", "HEAD", "--", ...sourceFiles]);
const directory = resolve(directoryArgument);
await mkdir(directory, { mode: 0o700 }); // A new directory is required; never replace a previous run.
const receipt: Record<string, unknown> & { cases: Record<string, unknown>[] } = {
  schemaVersion: "open-ena-fixed-nine-provider-check.v1", synthetic: true,
  ...setup, startedAt: new Date().toISOString(), cases: [], status: "running",
};
await writeFile(join(directory, "plan.json"), JSON.stringify(setup, null, 2) + "\n", { mode: 0o600, flag: "wx" });

async function captureBounded(response: Response, timeoutMilliseconds = 20_000): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const read = async (): Promise<Uint8Array | null> => { try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > OPEN_ENA_AI_MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch { return null; } };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>(resolveDeadline => {
    timer = setTimeout(() => {
      // Do not await tee cancellation: the other branch may already have closed
      // after rejecting the HTTP status, while this branch's cancel still waits.
      void reader.cancel().catch(() => undefined);
      resolveDeadline(null);
    }, timeoutMilliseconds);
  });
  try { return await Promise.race([read(), deadline]); }
  finally { clearTimeout(timer); reader.releaseLock(); }
}

const requestHashes = new Map<string, string>();
for (const planned of plan) {
  const entry: Record<string, unknown> = { locale: planned.locale, repeat: planned.repeat,
    requestSha256: planned.requestSha256, startedAt: new Date().toISOString(), accepted: false };
  let dispatches = 0;
  const caseDeadline = Date.now() + 20_000;
  const capture: { pending: Promise<Uint8Array | null> | null } = { pending: null };
  let accepted: Awaited<ReturnType<typeof generateLunaInterpretation>> | null = null;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.deepseek.com");
    assert.ok(["/responses", "/user/balance"].includes(url.pathname));
    if (url.pathname === "/responses") {
      dispatches += 1;
      assert.equal(dispatches, 1, "No repair dispatch or implicit retry is permitted");
      const outgoing = String(init?.body);
      const outgoingHash = digest(outgoing);
      const previous = requestHashes.get(planned.locale);
      if (previous) assert.equal(outgoingHash, previous, "All three requests in a locale must be identical");
      requestHashes.set(planned.locale, outgoingHash);
      entry.outgoingRequestSha256 = outgoingHash;
    }
    const response = await fetch(input, init);
    if (url.pathname === "/responses") {
      entry.httpStatus = response.status;
      capture.pending = captureBounded(response.clone(), Math.max(1, caseDeadline - Date.now()));
    }
    return response;
  };
  try {
    accepted = await generateLunaInterpretation(planned.request, {
      environment: { OPEN_ENA_AI_ENABLED: "true", DEEPSEEK_API_KEY: apiKey, OPEN_ENA_AI_MODEL: "deepseek-flash" },
      fetch: fetcher, timeoutMs: 20_000, reservationMicroUsd: 10_000,
    });
    entry.accepted = true;
    entry.usage = accepted.usage;
  } catch (error) {
    entry.errorCode = error instanceof LunaClientError ? error.code : "validation-runner-error";
    entry.providerDispatched = error instanceof LunaClientError ? error.providerDispatched : dispatches > 0;
    entry.usage = error instanceof LunaClientError ? error.usage : null;
  }
  const raw: Uint8Array | null = await (capture.pending ?? Promise.resolve(null));
  entry.responseCapture = raw ? "complete" : "unavailable";
  if (raw) {
    const text = new TextDecoder().decode(raw);
    const containsSecret: boolean = text.includes(apiKey) || /sk-[A-Za-z0-9_-]{15,}/u.test(text);
    entry.responseBytes = raw.byteLength;
    entry.responseSha256 = digest(raw);
    if (!containsSecret) {
      await writeFile(join(directory, `${planned.locale}-${planned.repeat}-synthetic-response.json`), raw, { mode: 0o600, flag: "wx" });
    }
    try {
      const body = JSON.parse(text);
      entry.responseStatus = ["completed", "incomplete", "failed", "in_progress"].includes(body.status) ? body.status : "unknown";
      entry.outputTokens = typeof body.usage?.output_tokens === "number" ? body.usage.output_tokens : null;
      if (accepted) {
        assert.equal(containsSecret, false);
        const texts = body.output.filter((item: any) => item.type === "message" && item.role === "assistant")
          .flatMap((item: any) => item.content.filter((part: any) => part.type === "output_text").map((part: any) => part.text));
        assert.equal(texts.length, 1);
        const before = JSON.parse(texts[0]);
        const after = accepted.response.interpretation;
        assert.equal(after.observedPatterns.length, before.observedPatterns.length, "Observation ordinals must remain stable");
        const evidenceIds = collectOpenEnaAiEvidenceIds(planned.request.evidence);
        before.observedPatterns.forEach((pattern: any, index: number) => {
          assert.equal(after.observedPatterns[index].statement, pattern.statement.trim());
          assert.deepEqual(after.observedPatterns[index].evidenceRefs, [...new Set(pattern.evidenceRefs)]);
          assert.ok(pattern.evidenceRefs.every((id: string) => evidenceIds.has(id)));
        });
        const notes = [...(before.limitations ?? []), ...["disclosure", "limitationNote", "missingnessDisclosure", "responseFormatNote", "supplementalNote"]
          .filter(key => typeof before[key] === "string" && before[key].trim()).map(key => before[key])];
        assert.ok(notes.every(note => after.limitations.includes(note.trim())), "Every disclosure must be retained");
        entry.preservationAudit = "pass";
        entry.patternCount = after.observedPatterns.length;
        entry.limitationCount = after.limitations.length;
        entry.acceptedResponseSha256 = digest(JSON.stringify(accepted.response));
        await writeFile(join(directory, `${planned.locale}-${planned.repeat}-accepted.json`), JSON.stringify(accepted.response, null, 2) + "\n", { mode: 0o600, flag: "wx" });
      }
    } catch {
      if (accepted) { entry.accepted = false; entry.preservationAudit = "fail"; }
    }
  } else if (accepted) { entry.accepted = false; entry.preservationAudit = "unverified"; }
  entry.responseDispatches = dispatches;
  entry.finishedAt = new Date().toISOString();
  receipt.cases.push(entry);
  await writeFile(join(directory, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(entry)); // Bounded metrics and hashes only; never provider text.
}
assert.equal(receipt.cases.length, 9);
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), candidateSha);
for (const file of sourceFiles) assert.equal(digest(await readFile(file)), sourceHashes[file]);
receipt.accepted = receipt.cases.filter(entry => entry.accepted).length;
receipt.status = receipt.accepted === 9 && receipt.cases.every(entry => entry.responseDispatches === 1) ? "pass" : "fail";
receipt.finishedAt = new Date().toISOString();
await writeFile(join(directory, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ status: receipt.status, accepted: receipt.accepted, attempted: 9, retries: 0 }));
if (receipt.status !== "pass") process.exitCode = 1;
