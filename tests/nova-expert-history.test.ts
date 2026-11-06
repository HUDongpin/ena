import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Pool } from "pg";
import NovaExpertInbox from "../components/nova/NovaExpertInbox";
import { createNovaStore } from "../lib/nova/store";
import { encryptPluginLabText } from "../lib/plugin-lab/crypto";
import type { NovaArtifactVersion, NovaSession, NovaRunStatus } from "../lib/nova/types";

const key = Buffer.alloc(32, 23);
const files = (content: string) => [{ path: "src/plugin.ts", content }];
const checks = [{ name: "compile", passed: true, detail: "Synthetic passing check" }];
function artifact(id: string, version: number, runId = "run"): NovaArtifactVersion {
  return { id, version, runId, createdAt: `2026-11-03T10:0${version}:00.000Z`, files: files(id), checks,
    manifest: { schemaVersion: "open-ena.nova-draft/v1", name: "Synthetic", version: "0.1.0", kind: "presenter", entry: "src/plugin.ts", changesAnalysis: false, networkAccess: false },
    output: { title: "Synthetic", exports: ["json"] }, sourceHash: "a".repeat(64), fixtureHash: "b".repeat(64), status: "draft" };
}
function fixture(status: NovaRunStatus = "ready"): NovaSession {
  return { id: "session", title: "Synthetic expert history", locale: "en", createdAt: "2026-11-03T09:00:00Z", updatedAt: "2026-11-03T10:04:00Z", messages: [],
    runs: [{ id: "run", sessionId: "session", status, model: { key: "qwen-max", provider: "qwen", label: "Synthetic", apiModel: "unused", version: "unused", available: true }, effort: "medium", createdAt: "2026-11-03T10:00:00Z", updatedAt: "2026-11-03T10:04:00Z", messageId: "message", baseArtifactId: "v3", stepCount: 2, repairCount: 0, draftFiles: files("v4"), draftChecks: checks }],
    artifacts: [artifact("v3", 3), artifact("v4", 4)], activeArtifactId: "v4",
    expertRequests: [{ id: "request", runId: "run", artifactId: "v3", question: "Change presentation", context: "Synthetic", status: "answered", notificationStatus: "sent", createdAt: "2026-11-03T10:03:10Z", respondedAt: "2026-11-03T10:03:30Z", response: "Use blue labels" }] };
}
const router: AppRouterInstance = { bfcacheId: "synthetic", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
async function project(session: NovaSession) {
  const chunks = JSON.stringify(session).match(/[\s\S]{1,16000}/gu)!;
  const document_cipher = chunks.map((chunk, i) => encryptPluginLabText(chunk, key, "v1", `nova-session:${session.id}:${i}:${chunks.length}`));
  const client = { async query(sql: string) {
    if (sql.includes("WITH page AS MATERIALIZED")) return { rows: [{ request_id: "request", session_id: session.id, request_cursor: 1, document_cipher }] };
    assert.match(sql, /^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/); return { rows: [] };
  }, release() {} };
  // Only the database transport is substituted: real decryption, projection and UI.
  const pool = { async connect() { return client; } } as unknown as Pool;
  const store = createNovaStore(pool, { databaseUrl: "postgresql://synthetic.invalid/unused", encryptionKey: key, keyVersion: "v1", secret: "s".repeat(40) });
  const page = await store.listExpertRequests({ view: "history" });
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(NovaExpertInbox, { page, csrf: "unused", locale: "en" })));
  return { item: page.requests[0], html };
}

test("a successful changed v4 is displayed without claiming unfinished or unattached", async () => {
  const { item, html } = await project(fixture());
  assert.doesNotMatch(html, /Unfinished run evidence|has not been attached as a new versioned artifact/);
  assert.equal(item.artifact?.id, "v3", "request evidence remains bound to the original version");
  assert.match(html, /Current run status<\/dt><dd>ready/);
  assert.match(html, /Latest saved version for this run<\/dt><dd>v4/);
  assert.match(html, /Saved working files and checks/);
});

test("history selects the latest version of the referenced run, not the active session version", async () => {
  const session = fixture();
  session.artifacts = [artifact("v4", 4), artifact("v3", 3), artifact("unrelated", 5, "other-run")];
  session.activeArtifactId = "unrelated";
  const { html } = await project(session);
  assert.match(html, /Latest saved version for this run<\/dt><dd>v4/);
  assert.doesNotMatch(html, /<dd>v5/);
});

for (const status of ["queued", "building", "testing", "waiting-user", "waiting-expert", "failed", "cancelled"] as const) {
  test(`history reports ${status} truthfully while retaining failed working checks`, async () => {
    const session = fixture(status); session.artifacts = [artifact("v3", 3)];
    session.runs[0].draftChecks = [{ name: "compile", passed: false, detail: "synthetic syntax error" }];
    const { html } = await project(session);
    assert.match(html, new RegExp(`Current run status</dt><dd>${status}`));
    assert.match(html, /synthetic syntax error/);
    assert.doesNotMatch(html, /has not been attached as a new versioned artifact/);
  });
}

test("an unchanged successful continuation still exposes its new version", async () => {
  const session = fixture(); session.artifacts[1].files = session.artifacts[0].files; session.runs[0].draftFiles = session.artifacts[0].files;
  const { html } = await project(session);
  assert.match(html, /Latest saved version for this run<\/dt><dd>v4/);
  assert.doesNotMatch(html, /Unfinished run evidence/);
});

test("missing run and saved versions are reported as unavailable, without inferring failure", async () => {
  const session = fixture(); session.runs = []; session.artifacts = []; session.activeArtifactId = null; session.expertRequests[0].artifactId = null;
  const { html } = await project(session);
  assert.match(html, /Current run status<\/dt><dd>Unavailable/);
  assert.match(html, /Latest saved version for this run<\/dt><dd>None available/);
});
