import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as workbench from "../components/open-ena/OpenEnaLongitudinalWorkbenchV3";
import {
  estimateOpenEnaLongitudinalExecutionV3,
  OpenEnaLongitudinalExecutionClientErrorV3,
} from "../lib/open-ena/longitudinal-v3-client";
import type { Locale } from "../lib/i18n";
import { validOpenEnaLongitudinalRequestV3 } from "./helpers/open-ena-longitudinal-v3-fixture";

const decision = validOpenEnaLongitudinalRequestV3(500_000, 200).then(estimateOpenEnaLongitudinalExecutionV3);
const component = readFileSync(new URL("../components/open-ena/OpenEnaLongitudinalWorkbenchV3.tsx", import.meta.url), "utf8");

function recoveryCopy(locale: Locale, failure: OpenEnaLongitudinalExecutionClientErrorV3, now = Date.now()) {
  const getCopy = Reflect.get(workbench, "getOpenEnaLongitudinalV3RecoveryCopy");
  assert.equal(typeof getCopy, "function", "the recovery UI needs localized, trusted error-code guidance");
  return (getCopy as (locale: Locale, failure: OpenEnaLongitudinalExecutionClientErrorV3, now: number) => {
    message: string; retryWaitSeconds: number; retryEnabled: boolean;
  })(locale, failure, now);
}

async function failure(status: number, serverCode: string, retryNotBefore: number | null = null) {
  return new OpenEnaLongitudinalExecutionClientErrorV3("REMOTE_SUBMISSION_FAILED", "untrusted server text", await decision, {
    canContinueLocally: true, canDisableInference: true, httpStatus: status, serverCode, retryNotBefore,
  });
}

for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
  test(`${locale} recovery uses localized known reasons, never server text`, async () => {
    const messages: string[] = [];
    for (const [status, code] of [[401, "AUTHENTICATION_REQUIRED"], [429, "RATE_LIMITED"], [400, "INVALID_LONGITUDINAL_TASK"], [403, "INVALID_REQUEST_ORIGIN"], [400, "PRIVACY_BOUNDARY_VIOLATION"], [413, "DERIVED_PAYLOAD_TOO_LARGE"], [503, "REMOTE_SERVICE_UNAVAILABLE"]] as const) {
      const copy = recoveryCopy(locale, await failure(status, code));
      assert.doesNotMatch(copy.message, /untrusted server text|AUTHENTICATION_REQUIRED|RATE_LIMITED|INVALID_LONGITUDINAL_TASK/);
      if (locale !== "en") assert.match(copy.message, /[\p{Script=Han}]/u);
      assert.equal(copy.retryEnabled, status === 429 || status === 503);
      messages.push(copy.message);
    }
    assert.equal(new Set(messages).size, messages.length, "different recovery causes need different instructions");
  });
}

test("rate-limit copy counts down from the received deadline and never resets on a rerender", async () => {
  const received = 2_000_000;
  const error = await failure(429, "RATE_LIMITED", received + 60_000);
  const first = recoveryCopy("zh-hant", error, received);
  assert.equal(first.retryWaitSeconds, 60);
  assert.equal(first.retryEnabled, false);
  assert.match(first.message, /60/);
  const later = recoveryCopy("zh-hant", error, received + 35_000);
  assert.equal(later.retryWaitSeconds, 25);
  assert.equal(later.retryEnabled, false);
  assert.match(later.message, /25/);
  const ready = recoveryCopy("zh-hant", error, received + 60_000);
  assert.equal(ready.retryWaitSeconds, 0);
  assert.equal(ready.retryEnabled, true);
});

test("unknown structured codes use safe generic guidance", async () => {
  const copy = recoveryCopy("en", await failure(500, "PRIVATE_SERVER_CODE"));
  assert.doesNotMatch(copy.message, /PRIVATE_SERVER_CODE|untrusted/);
  assert.equal(copy.retryEnabled, true);
});

test("remote recovery renders localized guidance and a guarded retry action", () => {
  assert.equal(/<p>\{remoteFailure\.message\}<\/p>/.test(component), false);
  assert.equal(/remoteFailure\.canRetryRemote\s*\?/.test(component), true);
  assert.equal(/disabled=\{!recoveryCopy\.retryEnabled\}/.test(component), true);
  assert.equal(/data-trajectory-recovery="sign-in"[\s\S]*?target="_blank"[\s\S]*?rel="noopener noreferrer"/.test(component), true);
});
