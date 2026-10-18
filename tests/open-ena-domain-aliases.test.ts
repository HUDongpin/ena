import assert from "node:assert/strict";
import test from "node:test";
import { openEnaRequestOriginConfigurationReady, resolveOpenEnaRequestOrigin } from "../lib/open-ena-auth-request";

const environment = {
  NODE_ENV: "production",
  OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk",
  OPEN_ENA_ALLOWED_ORIGINS: "https://ena.hk",
  OPEN_ENA_ADDITIONAL_ORIGINS: "https://www.open-ena.com,https://open-ena.com",
};

test("domain aliases extend the existing production origins without replacing them", () => {
  assert.equal(openEnaRequestOriginConfigurationReady(environment), true);
  for (const origin of ["https://www.ena.hk", "https://ena.hk", "https://www.open-ena.com", "https://open-ena.com"]) {
    assert.equal(resolveOpenEnaRequestOrigin(new Headers({ origin }), "https://deployment.vercel.app", environment), origin);
  }
});

test("domain aliases grant only exact configured origins and never trust forwarded hosts", () => {
  for (const origin of ["https://www.open-ena.com.evil.test", "https://evil.open-ena.com", "http://www.open-ena.com"]) {
    const headers = new Headers({ origin, "x-forwarded-host": "www.open-ena.com", "x-forwarded-proto": "https" });
    assert.equal(resolveOpenEnaRequestOrigin(headers, "https://www.open-ena.com", environment), null);
  }
  assert.equal(resolveOpenEnaRequestOrigin(new Headers({ "x-forwarded-host": "www.open-ena.com" }), "https://www.open-ena.com", environment), null);
});

test("malformed additional origins fail closed for the whole production configuration", () => {
  for (const value of ["", "https://www.open-ena.com,", "https://www.open-ena.com/path", "https://user:pass@www.open-ena.com"]) {
    const invalid = { ...environment, OPEN_ENA_ADDITIONAL_ORIGINS: value };
    assert.equal(openEnaRequestOriginConfigurationReady(invalid), false);
    assert.equal(resolveOpenEnaRequestOrigin(new Headers({ origin: "https://www.ena.hk" }), "https://www.ena.hk", invalid), null);
  }
});
