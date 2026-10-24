import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as realDelay } from "node:timers/promises";
import { readPluginLabMailConfiguration, sendPluginLabVerificationEmail, buildPluginLabNotification } from "@/lib/plugin-lab/mail";

const environment = {
  ENA_PLUGIN_LAB_SMTP_HOST: "smtp.example.org",
  ENA_PLUGIN_LAB_SMTP_PORT: "587",
  ENA_PLUGIN_LAB_SMTP_USER: "sender",
  ENA_PLUGIN_LAB_SMTP_PASSWORD: "test-password",
  ENA_PLUGIN_LAB_MAIL_FROM: "plugins@example.org",
  ENA_PLUGIN_LAB_OPERATOR_EMAIL: "operator@example.org",
  OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk",
};

test("SMTP configuration requires authenticated TLS and an approved sender", () => {
  const config = readPluginLabMailConfiguration(environment);
  assert.equal(config?.port, 587);
  assert.equal(config?.secure, false);
  assert.equal(config?.requireTLS, true);
  assert.equal(readPluginLabMailConfiguration({ ...environment, ENA_PLUGIN_LAB_SMTP_PASSWORD: "" }), null);
  assert.equal(readPluginLabMailConfiguration({ ...environment, ENA_PLUGIN_LAB_SMTP_PORT: "25" }), null);
  assert.equal(readPluginLabMailConfiguration({ ...environment, ENA_PLUGIN_LAB_MAIL_FROM: "a@example.org\nBcc:x@example.org" }), null);
});

test("existing ENA Resend settings supply SMTP without copying the provider key", () => {
  const config = readPluginLabMailConfiguration({ RESEND_API_KEY: "synthetic-key", OPEN_ENA_ACCOUNT_MAIL_FROM: "Open ENA <accounts@mail.open-ena.com>", ENA_PLUGIN_LAB_OPERATOR_EMAIL: "operator@example.org", ENA_PLUGIN_LAB_SMTP_PORT: "", ENA_PLUGIN_LAB_MAIL_FROM: "" });
  assert.equal(config?.host, "smtp.resend.com");
  assert.equal(config?.port, 465);
  assert.equal(config?.user, "resend");
  assert.equal(config?.from, "accounts@mail.open-ena.com");
});

test("a loopback preview can use an alternate SMTP port while still requiring TLS", () => {
  const config = readPluginLabMailConfiguration({ ...environment, ENA_PLUGIN_LAB_SMTP_PORT: "14587", OPEN_ENA_PUBLIC_ORIGIN: "http://127.0.0.1:3344" });
  assert.equal(config?.port, 14587);
  assert.equal(config?.requireTLS, true);
  assert.equal(readPluginLabMailConfiguration({ ...environment, OPEN_ENA_PUBLIC_ORIGIN: "http://ena.hk" }), null);
});

test("verification email is localized and verifies SMTP recipient acceptance", async () => {
  let message: Record<string, unknown> = {};
  await sendPluginLabVerificationEmail({ email: "reader@example.org", code: "012345", locale: "zh-hans" }, environment, async (mail) => { message = mail; return { accepted: ["reader@example.org"], rejected: [] }; });
  assert.match(String(message.subject), /验证码/u);
  assert.match(String(message.text), /012345/u);
  assert.match(String(message.text), /10/u);
  await assert.rejects(() => sendPluginLabVerificationEmail({ email: "reader@example.org", code: "012345", locale: "en" }, environment, async () => ({ accepted: [], rejected: ["reader@example.org"] })), /accepted/u);
});

test("SMTP sending has an absolute deadline even when the transport never settles", { timeout: 1000 }, async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const sending = sendPluginLabVerificationEmail({ email: "reader@example.org", code: "012345", locale: "en" }, environment, () => new Promise(() => undefined));
  const result = sending.then(() => "unexpected success", (error: Error) => error.message);
  context.mock.timers.tick(15_001);
  assert.match(await Promise.race([result, realDelay(50, "deadline missing")]), /timed out/u);
});

test("notifications contain a normal status link and no proposal content", () => {
  const result = buildPluginLabNotification({ proposalId: "plg_AAAAAAAAAAAAAAAAAAAAAA", kind: "status", locale: "zh-hant", target: "researcher" }, "https://www.ena.hk");
  assert.match(result.text, /https:\/\/www\.ena\.hk\/zh-hant\/plugins\/status/u);
  assert.doesNotMatch(result.text, /\?token=|accessCode|privateDetails/u);
  assert.match(result.subject, /提案/u);
});
