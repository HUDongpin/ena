import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { OpenEnaCloudError } from "../lib/server/open-ena-cloud-db";
import { captureOpenEnaCloudWorkspace, defaultOpenEnaCloudPresentation } from "../lib/open-ena/cloud-workspace";
import { createWorkspaceStateV3 } from "../components/open-ena/model-v3/workspace-controller";

const userId = "f332ad07-2ec7-4c19-a3b2-490a6435af8d", projectId = "a332ad07-2ec7-4c19-a3b2-490a6435af8d";
const principal = { userId, sessionVersion: 1, principalRef: `u_${userId}`, jti: projectId, issuedAtSeconds: 1, expiresAtSeconds: 99999 };
const environment = { OPEN_ENA_CLOUD_PROJECTS_ENABLED: "true", OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk", OPEN_ENA_ADDITIONAL_ORIGINS: "https://www.open-ena.com", OPEN_ENA_PROJECT_ENCRYPTION_KEY: "a".repeat(64) };
const req = (method: string, body?: unknown, origin = "https://www.ena.hk") => new Request(`${origin}/api/open-ena/projects`, {
  method, headers: { origin, "content-type": "application/json", "x-open-ena-account": userId }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

test("an old tab cannot read or save into a different account after another tab signs in", async () => {
  const { createOpenEnaProjectHandler } = await import("../lib/server/open-ena-project-routes");
  const otherId = "b332ad07-2ec7-4c19-a3b2-490a6435af8d";
  let reads = 0;
  const handler = createOpenEnaProjectHandler({ environment, authenticate: async () => ({ ...principal, userId: otherId, principalRef: `u_${otherId}` }),
    store: { list: async () => { reads++; return { projects: [] }; } } as never });
  const response = await handler(req("GET"));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "account-changed" });
  assert.equal(reads, 0);
});

test("project routes derive ownership exclusively from a verified registered session", async () => {
  assert.ok(existsSync(new URL("../lib/server/open-ena-project-routes.ts", import.meta.url)), "owned project routes must exist");
  const { createOpenEnaProjectHandler } = await import("../lib/server/open-ena-project-routes");
  let writes = 0;
  const store = { create: async (owner: unknown, input: unknown) => { writes++; assert.deepEqual(owner, { userId, sessionVersion: 1 }); return input; } } as never;
  const snapshot = await captureOpenEnaCloudWorkspace({ state: createWorkspaceStateV3(), currentPlan: null, presentation: defaultOpenEnaCloudPresentation() });
  const body = { id: projectId, title: "Private study", snapshot };
  assert.equal((await createOpenEnaProjectHandler({ environment, store, authenticate: async () => null })(req("POST", body))).status, 401);
  assert.equal((await createOpenEnaProjectHandler({ environment, store, authenticate: async () => ({ principalRef: "legacy", jti: projectId, issuedAtSeconds: 1, expiresAtSeconds: 99999 }) })(req("POST", body))).status, 403);
  const handler = createOpenEnaProjectHandler({ environment, store, authenticate: async () => principal });
  assert.equal((await handler(req("POST", { ...body, ownerId: "forged-owner" }))).status, 400);
  assert.equal((await handler(req("POST", body, "https://evil.example"))).status, 403);
  assert.equal(writes, 0);
  for (const origin of ["https://www.ena.hk", "https://www.open-ena.com"]) assert.equal((await handler(req("POST", body, origin))).status, 201);
  assert.equal(writes, 2);
});

test("project errors are bounded and successful private reads cannot be cached", async () => {
  assert.ok(existsSync(new URL("../lib/server/open-ena-project-routes.ts", import.meta.url)));
  const { createOpenEnaProjectHandler } = await import("../lib/server/open-ena-project-routes");
  const handler = createOpenEnaProjectHandler({ environment, authenticate: async () => principal, store: {
    list: async () => ({ projects: [] }), read: async () => { throw new OpenEnaCloudError("not-found"); },
    setArchived: async () => { throw new OpenEnaCloudError("conflict"); },
  } as never });
  const response = await handler(req("GET"));
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("vary")!, /Cookie/u);
  assert.equal((await handler(req("GET"), projectId)).status, 404);
  const conflict = await handler(req("PATCH", { revision: 1, archived: true }), projectId);
  assert.equal(conflict.status, 409); assert.deepEqual(await conflict.json(), { error: "conflict" });
  assert.equal((await handler(req("PATCH", { revision: 1, archived: true, title: "ambiguous" }), projectId)).status, 400);
});

test("invalid snapshots cannot replace an existing project", async () => {
  assert.ok(existsSync(new URL("../lib/server/open-ena-project-routes.ts", import.meta.url)));
  const { createOpenEnaProjectHandler } = await import("../lib/server/open-ena-project-routes");
  let writes = 0;
  const handler = createOpenEnaProjectHandler({ environment, authenticate: async () => principal, store: { save: async () => { writes++; } } as never });
  const snapshot = await captureOpenEnaCloudWorkspace({ state: createWorkspaceStateV3(), currentPlan: null, presentation: defaultOpenEnaCloudPresentation() });
  const response = await handler(req("PUT", { title: "Study", revision: 1, snapshot: { ...snapshot, integritySha256: "0".repeat(64) } }), projectId);
  assert.equal(response.status, 400); assert.equal(writes, 0);
});
