// Test-process preload only. This is never imported by the application.
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname } from "node:path";
import { tmpdir } from "node:os";

const file = process.env.OPEN_ENA_TEST_MAIL_FILE;
if (!file || dirname(dirname(file)) !== tmpdir() || !basename(dirname(file)).startsWith("ena-cloud-browser-")) {
  throw new Error("The mail recorder requires its owned temporary fixture directory.");
}
const original = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url !== "https://api.resend.com/emails") return original(input, options);
  const headers = new Headers(options?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (headers.get("authorization") !== "Bearer re_synthetic_cloud_fixture_only_20261024") throw new Error("The test mail recorder refuses non-synthetic credentials.");
  const raw = typeof options?.body === "string" ? options.body : input instanceof Request ? await input.clone().text() : "";
  const payload = JSON.parse(raw);
  if (!Array.isArray(payload.to) || payload.to.some((email) => !email.endsWith("@example.test"))) throw new Error("The test mail recorder only accepts synthetic recipients.");
  appendFileSync(file, `${JSON.stringify({ id: randomUUID(), createdAt: new Date().toISOString(), ...payload })}\n`, { mode: 0o600 });
  return Response.json({ id: randomUUID() });
};
