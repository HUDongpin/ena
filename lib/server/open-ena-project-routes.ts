import { isOpenEnaRegisteredPrincipal, type OpenEnaAuthEnvironment, type OpenEnaPrincipal } from "../open-ena-auth";
import { resolveOpenEnaRequestOrigin } from "../open-ena-auth-request";
import { OPEN_ENA_CLOUD_LIMITS, openEnaCloudProjectTitle } from "../open-ena/cloud-project-contract";
import { validateOpenEnaCloudSnapshotEnvelope, openEnaCloudSnapshotText } from "../open-ena/cloud-workspace-envelope";
import { classifyProductionOpenEnaSessionTokenAny } from "./open-ena-auth-security-store";
import { getOpenEnaCloudPool, openEnaCloudEnabled, openEnaProjectKey, OpenEnaCloudError } from "./open-ena-cloud-db";
import { createOpenEnaProjectsStore } from "./open-ena-projects";
import { assertOpenEnaCloudFields, openEnaCloudFailure, openEnaCloudJson, openEnaCloudSessionCookie, readOpenEnaCloudJson } from "./open-ena-cloud-http";

type Dependencies = { environment?: OpenEnaAuthEnvironment; store?: ReturnType<typeof createOpenEnaProjectsStore>;
  authenticate?: (request: Request) => Promise<OpenEnaPrincipal | null> };

export function createOpenEnaProjectHandler(dependencies: Dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return async (request: Request, projectId?: string) => {
    if (request.method !== "GET" && !resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) {
      return openEnaCloudJson({ error: "invalid-origin" }, 403);
    }
    try {
      if (!openEnaCloudEnabled(environment)) throw new OpenEnaCloudError("unavailable");
      let principal: OpenEnaPrincipal | null;
      if (dependencies.authenticate) principal = await dependencies.authenticate(request);
      else {
        const verdict = await classifyProductionOpenEnaSessionTokenAny(openEnaCloudSessionCookie(request), Date.now(), environment);
        if (!["authenticated", "unauthenticated"].includes(verdict.outcome)) throw new OpenEnaCloudError("unavailable");
        principal = verdict.outcome === "authenticated" ? verdict.principal : null;
      }
      if (!principal) throw new OpenEnaCloudError("unauthenticated");
      if (!isOpenEnaRegisteredPrincipal(principal)) return openEnaCloudJson({ error: "registered-account-required" }, 403);
      // This is a consistency guard, never an authorization source. It stops a stale tab
      // from silently using a different account's newly replaced browser cookie.
      if (request.headers.get("x-open-ena-account") !== principal.userId) return openEnaCloudJson({ error: "account-changed" }, 409);
      const key = openEnaProjectKey(environment);
      if (!key) throw new OpenEnaCloudError("unavailable");
      const store = dependencies.store ?? createOpenEnaProjectsStore(getOpenEnaCloudPool(environment), key);
      const owner = { userId: principal.userId, sessionVersion: principal.sessionVersion };
      if (request.method === "GET") return openEnaCloudJson(projectId
        ? await store.read(owner, projectId)
        : await store.list(owner, new URL(request.url).searchParams.get("archived") === "true"));
      if (request.method === "POST" || request.method === "PUT") {
        if ((request.method === "POST") === Boolean(projectId)) return openEnaCloudJson({ error: "not-found" }, 404);
        const body = await readOpenEnaCloudJson(request, OPEN_ENA_CLOUD_LIMITS.snapshotBytes);
        const create = request.method === "POST";
        assertOpenEnaCloudFields(body, create ? ["id", "title", "snapshot"] : ["revision", "title", "snapshot"],
          create ? ["id", "title", "snapshot"] : ["revision", "title", "snapshot"]);
        const title = openEnaCloudProjectTitle(body.title);
        if (!title || (create && typeof body.id !== "string") || (!create && (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1))) throw new OpenEnaCloudError("invalid-input");
        let snapshot: string;
        try { snapshot = openEnaCloudSnapshotText(await validateOpenEnaCloudSnapshotEnvelope(body.snapshot)); }
        catch { throw new OpenEnaCloudError("invalid-input"); }
        return openEnaCloudJson(create
          ? await store.create(owner, { id: body.id as string, title, snapshot })
          : await store.save(owner, projectId!, { revision: body.revision as number, title, snapshot }), create ? 201 : 200);
      }
      if (request.method === "PATCH" && projectId) {
        const body = await readOpenEnaCloudJson(request, 4096);
        assertOpenEnaCloudFields(body, ["revision", "title", "archived"], ["revision"]);
        if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1
          || Object.hasOwn(body, "archived") === Object.hasOwn(body, "title")) throw new OpenEnaCloudError("invalid-input");
        if (Object.hasOwn(body, "archived")) {
          if (typeof body.archived !== "boolean") throw new OpenEnaCloudError("invalid-input");
          return openEnaCloudJson(await store.setArchived(owner, projectId, body.revision as number, body.archived));
        }
        const title = openEnaCloudProjectTitle(body.title);
        if (!title) throw new OpenEnaCloudError("invalid-input");
        const saved = await store.read(owner, projectId);
        return openEnaCloudJson(await store.save(owner, projectId, { title, revision: body.revision as number, snapshot: saved.snapshot }));
      }
      if (request.method === "DELETE" && projectId) {
        const body = await readOpenEnaCloudJson(request, 4096);
        assertOpenEnaCloudFields(body, ["revision"], ["revision"]);
        if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new OpenEnaCloudError("invalid-input");
        await store.removeArchived(owner, projectId, body.revision as number);
        return openEnaCloudJson({ ok: true });
      }
      return openEnaCloudJson({ error: "method-not-allowed" }, 405);
    } catch (error) { return openEnaCloudFailure(error); }
  };
}
