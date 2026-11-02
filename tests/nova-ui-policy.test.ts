import assert from "node:assert/strict";
import test from "node:test";
import { novaWrite, novaWriteAmbiguous, parseNovaPreferences, novaRunBusy, novaFileChanges, appendNovaContext, novaSessionIdFromSearch, novaDraftSelection, NOVA_WORKING_DRAFT } from "@/components/nova/client";
import { getNovaCopy } from "@/components/nova/copy";
import { locales } from "@/lib/i18n";
import type { NovaArtifactVersion, NovaSession } from "@/lib/nova/types";

test("an ambiguous mutation retains route, exact payload, key, and owning account", () => {
  let count = 0; const makeKey = () => `key-${++count}`;
  const first = novaWrite(null, "/sessions/a/messages", { content: "Build a view" }, "one@example.org", makeKey);
  first.ambiguous = true;
  assert.equal(novaWrite(first, first.path, { content: "Build a view" }, first.owner, makeKey), first);
  assert.throws(() => novaWrite(first, "/sessions/b/messages", { content: "Build a view" }, first.owner, makeKey), /pending-write/);
  assert.throws(() => novaWrite(first, first.path, { content: "Changed" }, first.owner, makeKey), /pending-write/);
  assert.throws(() => novaWrite(first, first.path, { content: "Build a view" }, "two@example.org", makeKey), /identity-changed/);
  assert.equal(count, 1);
  assert.equal(novaWriteAmbiguous(503, "unavailable"), true);
  assert.equal(novaWriteAmbiguous(401, "researcher-required"), false);
  assert.equal(novaWriteAmbiguous(409, "idempotency-in-progress"), true);
  assert.equal(novaWriteAmbiguous(409, "idempotency-conflict"), true);
  assert.equal(novaWriteAmbiguous(503, "provider-not-configured"), false);
  assert.equal(novaWriteAmbiguous(503, "runtime-not-configured"), false);
});

test("saved preference parsing returns only validated model and effort, never chat fields", () => {
  assert.deepEqual(parseNovaPreferences(JSON.stringify({ modelKey: "qwen-max", effort: "medium", messages: ["private"], email: "secret@example.org" })), { modelKey: "qwen-max", effort: "medium" });
  for (const value of [null, "{", JSON.stringify({ modelKey: "unlisted", effort: "medium" }), JSON.stringify({ modelKey: "qwen-max", effort: "infinite" })]) assert.equal(parseNovaPreferences(value), null);
});

test("only executing statuses disable sending a follow-up", () => {
  for (const status of ["queued", "planning", "building", "testing"] as const) assert.equal(novaRunBusy(status), true);
  for (const status of ["ready", "failed", "cancelled", "waiting-user", "waiting-expert"] as const) assert.equal(novaRunBusy(status), false);
  assert.equal(novaRunBusy(undefined), false);
});

test("version comparison includes removed files and preserves literal source text", () => {
  const previous = { files: [{ path: "a.ts", content: "old" }, { path: "removed.ts", content: "deleted" }, { path: "same.ts", content: "same" }] } as NovaArtifactVersion;
  const current = { files: [{ path: "a.ts", content: "<script>literal</script>" }, { path: "added.ts", content: "new" }, { path: "same.ts", content: "same" }] } as NovaArtifactVersion;
  const diff = novaFileChanges(current, previous);
  assert.deepEqual(diff.map(({path,status}) => ({path,status})), [{ path: "a.ts", status: "changed" }, { path: "added.ts", status: "added" }, { path: "removed.ts", status: "removed" }, { path: "same.ts", status: "unchanged" }]);
  assert.equal(diff[0].after, "<script>literal</script>");
  assert.equal(diff[2].after, undefined);
});

test("Chinese interfaces are localized and all other site languages declare English fallback", () => {
  for (const locale of locales) {
    const copy = getNovaCopy(locale);
    assert.equal(copy.contentFallback, !["en", "zh-hans", "zh-hant"].includes(locale));
    assert.ok(copy.newSession && copy.preview && copy.statuses["waiting-expert"]);
    if (copy.contentFallback) assert.ok(copy.fallbackNotice);
  }
  assert.notEqual(getNovaCopy("zh-hans").greeting, getNovaCopy("en").greeting);
  assert.notEqual(getNovaCopy("zh-hant").greeting, getNovaCopy("en").greeting);
});

test("pasted context stays literal bounded draft text and never truncates an existing message", () => {
  assert.equal(appendNovaContext("Build a view", "  Reference: https://example.org  ", "Context"), "Build a view\n\nContext:\nReference: https://example.org");
  assert.equal(appendNovaContext("Keep this draft", " ", "Context"), "Keep this draft");
  assert.equal(appendNovaContext("a".repeat(11995), "additional text", "Context"), null);
  assert.equal(appendNovaContext("", "<script>literal</script>", "Context"), "Context:\n<script>literal</script>");
});

test("task URL references accept one opaque UUID and reject content or traversal", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(novaSessionIdFromSearch(`?session=${id}&view=preview`), id);
  assert.equal(novaSessionIdFromSearch(`?session=${id.toUpperCase()}`), id);
  for (const value of ["", "?session=", "?session=private%20chat", "?session=../../secrets", `?session=${id}&session=${id}`, "?session=00000000-0000-0000-0000-000000000000"]) assert.equal(novaSessionIdFromSearch(value), null);
});

test("unfinished files and checks remain a distinct selection from a previous checked artifact", () => {
  const artifact = { id: "checked", files: [{ path: "src/plugin.ts", content: "checked source" }], checks: [{ name: "Compile", passed: true, detail: "checked" }] } as NovaArtifactVersion;
  const session = { artifacts: [artifact], activeArtifactId: artifact.id, runs: [{ id: "latest", status: "failed", draftFiles: [{ path: "src/plugin.ts", content: "unfinished source" }], draftChecks: [{ name: "Compile", passed: false, detail: "syntax error" }] }] } as NovaSession;
  const current = novaDraftSelection(session, null);
  assert.equal(current.isWorking, true); assert.equal(current.artifact, undefined); assert.equal(current.selectedId, NOVA_WORKING_DRAFT);
  assert.equal(current.workingRun?.draftChecks?.[0].passed, false);
  const previous = novaDraftSelection(session, artifact.id);
  assert.equal(previous.isWorking, false); assert.equal(previous.artifact, artifact);
  assert.equal(previous.artifact?.checks[0].passed, true);
  session.runs[0].draftFiles = [{ path: "src/plugin.ts", content: "edited source" }]; session.runs[0].draftChecks = [];
  assert.deepEqual(novaDraftSelection(session, NOVA_WORKING_DRAFT).workingRun?.draftChecks, []);
  session.runs[0].status = "ready";
  assert.equal(novaDraftSelection(session, NOVA_WORKING_DRAFT).artifact, artifact);
  assert.equal(novaDraftSelection(session, NOVA_WORKING_DRAFT).isWorking, false);
});

test("requesting expert review of an already checked artifact retains its checked preview", () => {
  const files = [{ path: "src/plugin.ts", content: "checked source" }];
  const artifact = { id: "checked", runId: "reviewing", files } as NovaArtifactVersion;
  const session: NovaSession = {
    id: "session", title: "Reviewing checked draft", locale: "en", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", messages: [], expertRequests: [], artifacts: [artifact], activeArtifactId: artifact.id,
    runs: [{ id: "reviewing", sessionId: "session", status: "waiting-expert", model: { key: "qwen-max", provider: "qwen", label: "Fixture", apiModel: "fixture", version: "fixture", available: true }, effort: "medium", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", messageId: "message", baseArtifactId: null, stepCount: 1, repairCount: 0, draftFiles: files, draftChecks: [] }],
  };
  assert.equal(novaDraftSelection(session, null).isWorking, false);
  assert.equal(novaDraftSelection(session, null).artifact, artifact);
  session.runs[0].draftChecks = [{ name: "Recheck", passed: false, detail: "Same source failed the new check" }];
  assert.equal(novaDraftSelection(session, null).isWorking, true);
  assert.equal(novaDraftSelection(session, null).artifact, undefined);
  session.runs[0].draftChecks = [];
  session.runs[0].draftFiles = [{ path: "src/plugin.ts", content: "unreviewed changes" }];
  assert.equal(novaDraftSelection(session, null).isWorking, true);
});
