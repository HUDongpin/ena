import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";

test("registered credentials normalize email and use independent salted password hashes", async () => {
  assert.ok(existsSync(new URL("../lib/server/open-ena-user-credentials.ts", import.meta.url)), "registered credential implementation must exist");
  const users = await import("../lib/server/open-ena-user-credentials");
  assert.equal(users.normalizeOpenEnaEmail(" Researcher+ENA@Example.ORG "), "researcher+ena@example.org");
  for (const value of ["", "not-email", "one@two", "a\r\n@example.org", "a b@example.org", "a@example.org,other@example.org"]) {
    assert.equal(users.normalizeOpenEnaEmail(value), null);
  }
  for (const value of ["short", "x".repeat(129), "password with\u0000null"]) assert.equal(users.validOpenEnaUserPassword(value), false);
  const password = "synthetic research password 研究";
  assert.equal(users.validOpenEnaUserPassword(password), true);
  const first = await users.hashOpenEnaUserPassword(password);
  const second = await users.hashOpenEnaUserPassword(password);
  assert.equal(first.salt.length, 16); assert.equal(first.hash.length, 32);
  assert.notDeepEqual(first.salt, second.salt); assert.notDeepEqual(first.hash, second.hash);
  assert.equal(await users.verifyOpenEnaUserPassword(password, first), true);
  assert.equal(await users.verifyOpenEnaUserPassword(`${password} `, first), false, "password whitespace must not be normalized");
  assert.equal(await users.verifyOpenEnaUserPassword(password, null), false);
  await assert.rejects(users.hashOpenEnaUserPassword("short"));
});

test("registered credential verification rejects disabled and missing users", async () => {
  assert.ok(existsSync(new URL("../lib/server/open-ena-user-credentials.ts", import.meta.url)));
  const users = await import("../lib/server/open-ena-user-credentials");
  const password = "synthetic registered password";
  const credential = await users.hashOpenEnaUserPassword(password);
  let disabled = false, present = true;
  const query = async (_sql: string, values?: readonly unknown[]) => {
    assert.deepEqual(values, ["one@example.org"]);
    return { rows: present ? [{ id: "f332ad07-2ec7-4c19-a3b2-490a6435af8d", password_salt: credential.salt,
      password_hash: credential.hash, session_version: 2, disabled_at: disabled ? new Date() : null }] : [] };
  };
  assert.deepEqual(await users.verifyRegisteredOpenEnaCredentials(query, " One@Example.Org ", password), {
    userId: "f332ad07-2ec7-4c19-a3b2-490a6435af8d", sessionVersion: 2,
  });
  disabled = true; assert.equal(await users.verifyRegisteredOpenEnaCredentials(query, "one@example.org", password), null);
  present = false; assert.equal(await users.verifyRegisteredOpenEnaCredentials(query, "one@example.org", password), null);
});
