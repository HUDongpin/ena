import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NOVA_FONT_FILES, novaWebFontsEnabled, serveNovaFont } from "@/lib/nova/fonts";
import { dynamic, runtime, GET } from "@/app/api/nova/fonts/[style]/route";

const sample = Buffer.from("wOF2synthetic-route-fixture", "ascii");

test("font delivery is opt-in and accepts only four fixed styles", async () => {
  assert.equal(novaWebFontsEnabled({}), false);
  assert.equal(novaWebFontsEnabled({ ENA_NOVA_FONT_DIRECTORY: "relative/path" }), false);
  assert.equal((await serveNovaFont("sans-roman", {})).status, 404);
  const directory = await mkdtemp(join(tmpdir(), "nova-fonts-"));
  try {
    const env = { ENA_NOVA_FONT_DIRECTORY: directory };
    assert.equal(novaWebFontsEnabled(env), true);
    for (const [style, filename] of Object.entries(NOVA_FONT_FILES)) {
      await writeFile(join(directory, filename), sample);
      const response = await serveNovaFont(style, env);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "font/woff2");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.match(response.headers.get("cache-control")!, /^private,/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), sample);
    }
    for (const style of ["../sans-roman", "../../secret.woff2", "%2e%2e%2fsecret", "__proto__", "constructor", "sans-roman.woff2", "SANS-ROMAN", ""]) {
      const response = await serveNovaFont(style, env);
      assert.equal(response.status, 404, style);
      assert.equal(await response.text(), "Not found");
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("font delivery rejects missing, invalid, oversized, and outside-symlink files without leaking paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nova-fonts-invalid-"));
  const external = await mkdtemp(join(tmpdir(), "nova-fonts-external-"));
  try {
    const env = { ENA_NOVA_FONT_DIRECTORY: directory }; const target = join(directory, NOVA_FONT_FILES["sans-roman"]);
    for (const bytes of [null, Buffer.from("not a font"), Buffer.from("wOF"), Buffer.alloc(2_000_001, 1)]) {
      if (bytes) await writeFile(target, bytes);
      const response = await serveNovaFont("sans-roman", env);
      assert.equal(response.status, 404); assert.equal(await response.text(), "Not found");
    }
    await rm(target); const outside = join(external, "outside.woff2"); await writeFile(outside, sample); await symlink(outside, target);
    assert.equal((await serveNovaFont("sans-roman", env)).status, 404);
  } finally { await rm(directory, { recursive: true, force: true }); await rm(external, { recursive: true, force: true }); }
});

test("the font route uses the dynamic Node handler and preserves opt-in configuration", async () => {
  assert.equal(runtime, "nodejs"); assert.equal(dynamic, "force-dynamic");
  const original = process.env.ENA_NOVA_FONT_DIRECTORY;
  delete process.env.ENA_NOVA_FONT_DIRECTORY;
  try {
    const response = await GET(new Request("https://nova.example/api/nova/fonts/sans-roman"), { params: Promise.resolve({ style: "sans-roman" }) });
    assert.equal(response.status, 404); assert.equal(await response.text(), "Not found");
  } finally { if (original === undefined) delete process.env.ENA_NOVA_FONT_DIRECTORY; else process.env.ENA_NOVA_FONT_DIRECTORY = original; }
});
