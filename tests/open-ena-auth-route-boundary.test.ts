import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import * as loginRoute from "../app/api/open-ena/login/route";
import * as logoutRoute from "../app/api/open-ena/logout/route";

for (const [name, route] of [["login", loginRoute], ["logout", logoutRoute]] as const) {
  test(`${name} exposes only supported Next route exports`, () => {
    assert.deepEqual(Object.keys(route).sort(), ["POST", "dynamic", "runtime"]);
    assert.equal(route.runtime, "nodejs");
    assert.equal(route.dynamic, "force-dynamic");
  });

  test(`${name} POST retains origin rejection through the production adapter`, async () => {
    // A missing Origin is always rejected before configuration, credentials or DB access.
    const response = await route.POST(new NextRequest(`https://example.invalid/api/open-ena/${name}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "locale=en",
    }));
    assert.equal(response.status, 403);
    assert.equal(await response.text(), "Invalid request origin");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("location"), null);
  });
}
