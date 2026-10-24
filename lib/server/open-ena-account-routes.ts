import { createHash, randomBytes } from "node:crypto";
import { isLocale } from "../i18n";
import type { OpenEnaAuthEnvironment } from "../open-ena-auth";
import { resolveOpenEnaRequestOrigin } from "../open-ena-auth-request";
import { createOpenEnaUsersStore } from "./open-ena-users";
import { normalizeOpenEnaEmail, validOpenEnaUserPassword } from "./open-ena-user-credentials";
import { getOpenEnaCloudPool, openEnaCloudEnabled, OpenEnaCloudError } from "./open-ena-cloud-db";
import { openEnaAccountMailReady, sendOpenEnaAccountMail, type OpenEnaAccountEmail } from "./open-ena-account-mail";
import { assertOpenEnaCloudFields, openEnaCloudFailure, openEnaCloudJson, readOpenEnaCloudJson } from "./open-ena-cloud-http";
import { openEnaLoginSourceRef, readTrustedClientAddress } from "./open-ena-trusted-client-ip";

export type OpenEnaAccountAction = "register" | "forgot-password" | "verify" | "reset-password";
type Dependencies = { environment?: OpenEnaAuthEnvironment; users?: ReturnType<typeof createOpenEnaUsersStore>;
  sendMail?: (email: OpenEnaAccountEmail) => Promise<void> };

export function createOpenEnaAccountPostHandler(action: OpenEnaAccountAction, dependencies: Dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return async (request: Request) => {
    const origin = resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment);
    if (!origin) return openEnaCloudJson({ error: "invalid-origin" }, 403);
    try {
      if (!openEnaCloudEnabled(environment) || (action === "register" && environment.OPEN_ENA_REGISTRATION_ENABLED !== "true")) throw new OpenEnaCloudError("unavailable");
      const body = await readOpenEnaCloudJson(request, 4096);
      if (action === "register" || action === "forgot-password") {
        assertOpenEnaCloudFields(body, ["email", "locale"], ["email"]);
        const email = normalizeOpenEnaEmail(body.email);
        if (!email) throw new OpenEnaCloudError("invalid-input");
        if (!openEnaAccountMailReady(environment)) throw new OpenEnaCloudError("unavailable");
        const client = readTrustedClientAddress(request.headers, environment);
        const sourceRef = client.ok ? openEnaLoginSourceRef(client.address, environment) : null;
        if (!sourceRef) return openEnaCloudJson({ error: "unattributed" }, 403);
        const locale = typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "en";
        const token = randomBytes(32).toString("base64url"), purpose = action === "register" ? "verify" : "reset";
        const users = dependencies.users ?? createOpenEnaUsersStore(getOpenEnaCloudPool(environment));
        const issued = await users.issueAction({ email, purpose, sourceRef, tokenHash: createHash("sha256").update(token).digest("hex") });
        const link = new URL(`/${locale}/open-ena/account`, origin);
        if (issued.kind === "verify" || issued.kind === "reset") link.hash = new URLSearchParams({ action: issued.kind, token }).toString();
        else if (issued.kind === "existing") link.pathname = `/${locale}/open-ena`;
        await (dependencies.sendMail ?? ((value) => sendOpenEnaAccountMail(value, environment)))({ ...issued, link: link.toString(), locale });
        return openEnaCloudJson({ ok: true }, 202);
      }
      assertOpenEnaCloudFields(body, ["token", "password"], ["token", "password"]);
      if (typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(body.token)) throw new OpenEnaCloudError("invalid-token");
      if (!validOpenEnaUserPassword(body.password)) throw new OpenEnaCloudError("invalid-input");
      const users = dependencies.users ?? createOpenEnaUsersStore(getOpenEnaCloudPool(environment));
      await users.completeAction({ purpose: action === "verify" ? "verify" : "reset",
        tokenHash: createHash("sha256").update(body.token).digest("hex"), password: body.password });
      return openEnaCloudJson({ ok: true });
    } catch (error) { return openEnaCloudFailure(error); }
  };
}
