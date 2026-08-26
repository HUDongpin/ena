import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const helperPath = join(process.cwd(), "tests", "support", "safe-playwright-cli-error.mjs");

test("a Playwright CLI failure never retains secret-bearing child-process arguments", async () => {
  assert.equal(existsSync(helperPath), true, "the safe Playwright CLI error helper is missing");

  const loadModule = new Function("moduleUrl", "return import(moduleUrl)") as (
    moduleUrl: string,
  ) => Promise<{
    createSafePlaywrightCliError: (input: {
      caught: unknown;
      label: string;
      redact: (value: unknown) => string;
    }) => Error;
  }>;
  const { createSafePlaywrightCliError } = await loadModule(pathToFileURL(helperPath).href);
  const fixtureSecret = "fixture-production-password-that-must-not-escape";
  const caught = Object.assign(new Error(`spawn failed with ${fixtureSecret}`), {
    stdout: `stdout included ${fixtureSecret}`,
    stderr: `stderr included ${fixtureSecret}`,
    spawnargs: ["run-code", `password=${fixtureSecret}`],
  });
  const safeError = createSafePlaywrightCliError({
    caught,
    label: "fixture phase",
    redact: (value) => String(value ?? "").replaceAll(fixtureSecret, "[redacted-password]"),
  });
  const rendered = [safeError.name, safeError.message, safeError.stack, String(safeError.cause ?? "")]
    .join("\n");

  assert.doesNotMatch(rendered, new RegExp(fixtureSecret, "u"));
  assert.match(safeError.message, /\[redacted-password\]/u);
  assert.equal(Object.hasOwn(safeError, "cause"), false);
});
