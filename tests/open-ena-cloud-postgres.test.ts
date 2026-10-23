import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { cleanupOwnedEphemeralPostgres } from "./support/owned-ephemeral-postgres.mjs";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const password = "synthetic registered user password";

test("registered users and cloud projects enforce ownership against real PostgreSQL", { timeout: 60_000 }, async (t) => {
  const migration = new URL("../migrations/010_open_ena_registered_projects.sql", import.meta.url);
  assert.ok(existsSync(migration), "the additive registered-project migration must exist");
  const { createOpenEnaUsersStore } = await import("../lib/server/open-ena-users");
  const { createOpenEnaProjectsStore } = await import("../lib/server/open-ena-projects");
  const prefix = "ena-cloud-test-", rootDirectory = mkdtempSync(join(tmpdir(), prefix)), dataDirectory = join(rootDirectory, "data");
  let started = false, admin: Pool | undefined, app: Pool | undefined;
  try {
    execFileSync("initdb", ["--pgdata", dataDirectory, "--auth", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale"], { stdio: "pipe", timeout: 30_000 });
    const port = await new Promise<number>((resolve, reject) => {
      const server = createServer(); server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { const port = (server.address() as { port: number }).port; server.close((error) => error ? reject(error) : resolve(port)); });
    });
    started = true;
    execFileSync("pg_ctl", ["--pgdata", dataDirectory, "--log", join(rootDirectory, "postgres.log"), "--options", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`, "--wait", "start"], { stdio: "pipe", timeout: 30_000 });
    admin = new Pool({ host: "127.0.0.1", port, user: "postgres", database: "postgres", max: 4 });
    await admin.query("CREATE ROLE openena LOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO openena");
    const sql = readFileSync(migration, "utf8");
    await admin.query(sql);
    app = new Pool({ host: "127.0.0.1", port, user: "openena", database: "postgres", max: 6, statement_timeout: 10_000 });
    const users = createOpenEnaUsersStore(app);
    const projects = createOpenEnaProjectsStore(app, Buffer.alloc(32, 7));
    let a: { id: string; email: string; sessionVersion: number }, b: typeof a;
    const principal = (user: typeof a) => ({ userId: user.id, sessionVersion: user.sessionVersion });
    await t.test("email must be verified before an account exists; activation is one-time", async () => {
      const issued = await users.issueAction({ email: "one@example.org", purpose: "verify", tokenHash: hash("verify-one"), sourceRef: "source-one" });
      assert.equal(issued.kind, "verify");
      assert.equal((await admin!.query("SELECT count(*)::int AS count FROM open_ena_users")).rows[0].count, 0);
      a = await users.completeAction({ purpose: "verify", tokenHash: hash("verify-one"), password });
      assert.equal(a.email, "one@example.org"); assert.equal(a.sessionVersion, 1);
      await assert.rejects(users.completeAction({ purpose: "verify", tokenHash: hash("verify-one"), password }), { code: "invalid-token" });
      await users.issueAction({ email: "two@example.org", purpose: "verify", tokenHash: hash("verify-two"), sourceRef: "source-two" });
      b = await users.completeAction({ purpose: "verify", tokenHash: hash("verify-two"), password });
      assert.notEqual(a.id, b.id);
      const row = (await admin!.query("SELECT password_hash, password_salt FROM open_ena_users WHERE id=$1", [a.id])).rows[0];
      assert.equal(row.password_hash.length, 32); assert.equal(row.password_salt.length, 16);
      const existing = await users.issueAction({ email: "one@example.org", purpose: "verify", tokenHash: hash("already-one"), sourceRef: "source-existing" });
      assert.equal(existing.kind, "existing");
    });
    const id = randomUUID(), snapshot = JSON.stringify({ kind: "synthetic-project", rows: [{ code: "A", value: 1 }] });
    await t.test("account profile requires the current registered-session version", async () => {
      assert.deepEqual(await users.profile(principal(a)), a);
      assert.equal(await users.profile({ userId: a.id, sessionVersion: 999 }), null);
    });
    await t.test("a project is encrypted and visible only to its authenticated owner", async () => {
      const saved = await projects.create(principal(a), { id, title: "Research one", snapshot });
      assert.equal(saved.revision, 1);
      assert.equal((await projects.list(principal(a))).projects.length, 1);
      assert.equal((await projects.list(principal(b))).projects.length, 0);
      assert.equal((await projects.read(principal(a), id)).snapshot, snapshot);
      await assert.rejects(projects.read(principal(b), id), { code: "not-found" });
      await assert.rejects(projects.save(principal(b), id, { title: "stolen", revision: 1, snapshot }), { code: "not-found" });
      const raw = (await admin!.query("SELECT content_ciphertext FROM open_ena_projects WHERE id=$1", [id])).rows[0].content_ciphertext as Buffer;
      assert.equal(raw.includes(Buffer.from("Research one")), false);
      assert.equal(raw.includes(Buffer.from("synthetic-project")), false);
      assert.equal((await app!.query("SELECT id FROM open_ena_projects")).rows.length, 0, "missing RLS owner context must deny every project");
      const client = await app!.connect();
      try {
        await client.query("BEGIN"); await client.query("SELECT set_config('open_ena.user_id',$1,true)", [b.id]);
        assert.equal((await client.query("SELECT id FROM open_ena_projects WHERE id=$1", [id])).rows.length, 0);
        await assert.rejects(client.query("UPDATE open_ena_projects SET owner_id=$1 WHERE id=$2", [b.id, id]).then((r) => assert.equal(r.rowCount, 1)));
      } finally { await client.query("ROLLBACK"); client.release(); }
    });
    await t.test("metadata listing does not require permission to read encrypted project bodies", async () => {
      await admin!.query(`CREATE ROLE cloud_metadata_reader LOGIN NOSUPERUSER NOBYPASSRLS;
        GRANT USAGE ON SCHEMA public TO cloud_metadata_reader;
        GRANT SELECT(id,session_version,disabled_at),UPDATE(id) ON open_ena_users TO cloud_metadata_reader;
        GRANT SELECT(id,owner_id,title,revision,size_bytes,created_at,updated_at,archived_at) ON open_ena_projects TO cloud_metadata_reader;`);
      const metadataPool = new Pool({ host: "127.0.0.1", port, user: "cloud_metadata_reader", database: "postgres", max: 1 });
      try {
        const metadata = createOpenEnaProjectsStore(metadataPool, Buffer.alloc(32, 7));
        const list = await metadata.list(principal(a));
        assert.equal(list.projects.length, 1); assert.equal(list.projects[0].title, "Research one");
      } finally { await metadataPool.end(); }
    });
    await t.test("create retries are idempotent and concurrent stale revisions cannot overwrite", async () => {
      assert.equal((await projects.create(principal(a), { id, title: "Research one", snapshot })).revision, 1);
      const competing = await Promise.allSettled(["first", "second"].map((title) => projects.save(principal(a), id, { title, snapshot, revision: 1 })));
      assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(competing.filter((r) => r.status === "rejected" && r.reason.code === "conflict").length, 1);
      assert.equal((await projects.read(principal(a), id)).revision, 2);
    });
    await t.test("archives remain private and can be restored without deleting content", async () => {
      const archived = await projects.setArchived(principal(a), id, 2, true);
      assert.equal(archived.archived, true); assert.equal(archived.revision, 3);
      assert.equal((await projects.list(principal(a))).projects.length, 0);
      assert.equal((await projects.list(principal(a), true)).projects.length, 1);
      await assert.rejects(projects.setArchived(principal(b), id, 3, false), { code: "not-found" });
      assert.equal((await projects.setArchived(principal(a), id, 3, false)).revision, 4);
      assert.equal((await projects.read(principal(a), id)).snapshot, snapshot);
    });
    await t.test("parallel project creations cannot bypass the account quota", async () => {
      const bounded = createOpenEnaProjectsStore(app!, Buffer.alloc(32, 7), { projects: 1, bytes: 1000, snapshotBytes: 1000 });
      const attempts = await Promise.allSettled([1, 2].map((index) => bounded.create(principal(b), { id: randomUUID(), title: `Quota ${index}`, snapshot })));
      assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(attempts.filter((r) => r.status === "rejected" && r.reason.code === "quota").length, 1);
    });
    await t.test("only the owner can permanently remove an archived project and recover its storage", async () => {
      assert.equal(typeof projects.removeArchived, "function", "archived projects must be removable to recover storage");
      const project = (await projects.list(principal(b))).projects[0];
      await assert.rejects(projects.removeArchived(principal(b), project.id, project.revision), { code: "conflict" });
      const archived = await projects.setArchived(principal(b), project.id, project.revision, true);
      await assert.rejects(projects.removeArchived(principal(a), project.id, archived.revision), { code: "not-found" });
      await assert.rejects(projects.removeArchived(principal(b), project.id, archived.revision - 1), { code: "conflict" });
      await projects.removeArchived(principal(b), project.id, archived.revision);
      const after = await projects.list(principal(b));
      assert.equal(after.projectCount, 0); assert.equal(after.usedBytes, 0);
      await assert.rejects(projects.read(principal(b), project.id), { code: "not-found" });
      assert.equal((await projects.read(principal(a), id)).id, id);
    });
    await t.test("password recovery invalidates old sessions and all old reset links", async () => {
      const old = principal(a);
      await users.issueAction({ email: a.email, purpose: "reset", tokenHash: hash("reset-one"), sourceRef: "reset-source-one" });
      await users.issueAction({ email: a.email, purpose: "reset", tokenHash: hash("reset-two"), sourceRef: "reset-source-two" });
      a = await users.completeAction({ purpose: "reset", tokenHash: hash("reset-one"), password: "a new synthetic password for reset" });
      assert.equal(a.sessionVersion, 2);
      await assert.rejects(projects.list(old), { code: "unauthenticated" });
      await assert.rejects(users.completeAction({ purpose: "reset", tokenHash: hash("reset-two"), password }), { code: "invalid-token" });
      assert.equal((await projects.read(principal(a), id)).snapshot, snapshot);
    });
    await t.test("expired actions and over-limit email requests fail without activating an account", async () => {
      await users.issueAction({ email: "expired@example.org", purpose: "verify", tokenHash: hash("expired"), sourceRef: "expiry-source" });
      await admin!.query("UPDATE open_ena_account_actions SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' WHERE token_hash=$1", [hash("expired")]);
      await assert.rejects(users.completeAction({ purpose: "verify", tokenHash: hash("expired"), password }), { code: "invalid-token" });
      await users.issueAction({ email: "rate@example.org", purpose: "verify", tokenHash: hash("rate-1"), sourceRef: "rate-source-1" });
      await users.issueAction({ email: "rate@example.org", purpose: "verify", tokenHash: hash("rate-2"), sourceRef: "rate-source-2" });
      await users.issueAction({ email: "rate@example.org", purpose: "verify", tokenHash: hash("rate-3"), sourceRef: "rate-source-3" });
      await assert.rejects(users.issueAction({ email: "rate@example.org", purpose: "verify", tokenHash: hash("rate-4"), sourceRef: "rate-source-4" }), { code: "rate-limited" });
    });
    await t.test("reapplying the additive migration preserves registered users and project data", async () => {
      await admin!.query(sql);
      assert.equal((await projects.read(principal(a), id)).snapshot, snapshot);
      assert.equal((await admin!.query("SELECT count(*)::int AS count FROM open_ena_users")).rows[0].count, 2);
    });
  } finally {
    await app?.end(); await admin?.end();
    await cleanupOwnedEphemeralPostgres({ rootDirectory, dataDirectory, rootPrefix: prefix, startAttempted: started });
  }
});
