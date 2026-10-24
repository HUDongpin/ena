import { isLocale, locales } from "@/lib/i18n";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import { encryptPluginLabText, PLUGIN_LAB_STATUS_COOKIE } from "@/lib/plugin-lab/crypto";
import { readPluginLabMailConfiguration, sendPluginLabVerificationEmail } from "@/lib/plugin-lab/mail";
import { createPluginLabEmailCode, createPluginLabOpaqueToken, isPluginLabOpaqueToken, normalizePluginLabEmail, pluginLabCookie, pluginLabEmailRef, pluginLabSessionCookie, pluginLabWorkflowHash, PLUGIN_LAB_CODE_MAX_AGE, PLUGIN_LAB_LEGACY_COOKIE, PLUGIN_LAB_RESEARCHER_COOKIE, PLUGIN_LAB_RESEARCHER_MAX_AGE } from "@/lib/plugin-lab/workflow-security";
import { createPluginLabRequestSourceRef } from "./plugin-lab-proposal-route";
import { onlyKeys, workflowBody, workflowContext, workflowError, workflowJson, workflowResearcher, type WorkflowDependencies } from "./plugin-lab-workflow-context";

export function createPluginLabEmailRequestHandler(dependencies: WorkflowDependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return async (request: Request): Promise<Response> => {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return workflowError("invalid-origin", 403);
    let body: Record<string, unknown>;
    try { body = await workflowBody(request, 2048); } catch { return workflowError("invalid-request", 400); }
    const email = normalizePluginLabEmail(body.email);
    if (!email) return workflowError("invalid-email", 400, { fieldErrors: { email: "invalid-email" } });
    if (!onlyKeys(body, ["email", "locale"]) || !isLocale(String(body.locale))) return workflowError("invalid-request", 400);
    if (!readPluginLabMailConfiguration(environment)) return workflowError("email-unavailable", 503);
    const context = await workflowContext(dependencies);
    if (!context) return workflowError("service-unavailable", 503);
    const { store, configuration, now } = context;
    const emailRef = pluginLabEmailRef(email, configuration.secret);
    try {
      const source = createPluginLabRequestSourceRef(request, configuration.secret, "status-source", environment);
      if (!await store.consumeRateLimit({ scopeKind: "code-source", scopeRef: source, limit: 20, windowSeconds: 3600 })
        || !await store.consumeRateLimit({ scopeKind: "code-email", scopeRef: emailRef, limit: 5, windowSeconds: 3600 })) return workflowError("rate-limited", 429, { retryAfter: 3600 });
      const challengeId = createPluginLabOpaqueToken();
      const code = createPluginLabEmailCode();
      const saved = await store.putChallenge({
        challengeId, emailRef, emailCipher: encryptPluginLabText(email, configuration.encryptionKey, "v1", `email-contact:${emailRef}`),
        codeHash: pluginLabWorkflowHash("email-code", `${challengeId}:${code}`, configuration.secret), locale: String(body.locale), now,
        expiresAt: new Date(now.getTime() + PLUGIN_LAB_CODE_MAX_AGE * 1000),
      });
      if (!saved) return workflowError("rate-limited", 429, { retryAfter: 60 });
      try {
        await (dependencies.sendCode ? dependencies.sendCode({ email, code, locale: String(body.locale) }) : sendPluginLabVerificationEmail({ email, code, locale: String(body.locale) }, environment));
      } catch {
        await store.invalidateChallenge(challengeId);
        return workflowError("email-unavailable", 503, { retryAfter: 60 });
      }
      return workflowJson({ challengeId, retryAfter: 60, expiresIn: PLUGIN_LAB_CODE_MAX_AGE }, 202);
    } catch { return workflowError("service-unavailable", 503); }
  };
}

export function createPluginLabEmailVerifyHandler(dependencies: WorkflowDependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return async (request: Request): Promise<Response> => {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return workflowError("invalid-origin", 403);
    let body: Record<string, unknown>;
    try { body = await workflowBody(request, 2048); } catch { return workflowError("invalid-code", 400); }
    if (!onlyKeys(body, ["challengeId", "code"]) || !isPluginLabOpaqueToken(body.challengeId) || typeof body.code !== "string" || !/^\d{6}$/u.test(body.code)) return workflowError("invalid-code", 400);
    const context = await workflowContext(dependencies);
    if (!context) return workflowError("service-unavailable", 503);
    const { store, configuration, now } = context;
    try {
      const source = createPluginLabRequestSourceRef(request, configuration.secret, "status-source", environment);
      if (!await store.consumeRateLimit({ scopeKind: "verify-source", scopeRef: source, limit: 30, windowSeconds: 900 })) return workflowError("rate-limited", 429, { retryAfter: 900 });
      const token = createPluginLabOpaqueToken();
      const session = await store.consumeChallenge({ challengeId: body.challengeId, codeHash: pluginLabWorkflowHash("email-code", `${body.challengeId}:${body.code}`, configuration.secret), now, sessionHash: pluginLabWorkflowHash("session", token, configuration.secret), sessionExpiresAt: new Date(now.getTime() + PLUGIN_LAB_RESEARCHER_MAX_AGE * 1000) });
      if (!session) return workflowError("invalid-code", 400);
      // Read the bound encrypted address, never echo an unverified request field.
      const { decryptPluginLabText } = await import("@/lib/plugin-lab/crypto");
      const email = normalizePluginLabEmail(decryptPluginLabText(session.emailCipher, { v1: configuration.encryptionKey }, `email-contact:${session.emailRef}`));
      if (!email || pluginLabEmailRef(email, configuration.secret) !== session.emailRef) return workflowError("service-unavailable", 503);
      const response = workflowJson({ verified: true, email, expiresAt: session.expiresAt });
      response.headers.append("set-cookie", pluginLabSessionCookie(PLUGIN_LAB_RESEARCHER_COOKIE, token));
      response.headers.append("set-cookie", pluginLabSessionCookie(PLUGIN_LAB_LEGACY_COOKIE, "", 0));
      for (const locale of locales) response.headers.append("set-cookie", `${PLUGIN_LAB_STATUS_COOKIE}=; Path=/${locale}/plugins/status; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);
      return response;
    } catch { return workflowError("service-unavailable", 503); }
  };
}

export function createPluginLabSessionHandler(dependencies: WorkflowDependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && !resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return workflowError("invalid-origin", 403);
    const context = await workflowContext(dependencies);
    if (!context) return workflowError("service-unavailable", 503);
    try {
      if (request.method === "GET") {
        const researcher = await workflowResearcher(request, context);
        return researcher ? workflowJson({ email: researcher.email, expiresAt: researcher.expiresAt }) : workflowError("verification-required", 401);
      }
      if (request.method !== "DELETE") return workflowError("invalid-request", 405);
      const token = pluginLabCookie(request.headers, PLUGIN_LAB_RESEARCHER_COOKIE);
      if (isPluginLabOpaqueToken(token)) await context.store.revokeSession(pluginLabWorkflowHash("session", token, context.configuration.secret));
      const response = workflowJson({ signedOut: true });
      response.headers.append("set-cookie", pluginLabSessionCookie(PLUGIN_LAB_RESEARCHER_COOKIE, "", 0));
      response.headers.append("set-cookie", pluginLabSessionCookie(PLUGIN_LAB_LEGACY_COOKIE, "", 0));
      for (const locale of locales) response.headers.append("set-cookie", `${PLUGIN_LAB_STATUS_COOKIE}=; Path=/${locale}/plugins/status; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);
      return response;
    } catch { return workflowError("service-unavailable", 503); }
  };
}
