import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

test("the real workspace bundles without an output path for existing browser regression harnesses", async () => {
  const result = await build({
    stdin: {
      contents: 'import OpenEnaWorkspace from "./components/open-ena/OpenEnaWorkspace"; console.log(OpenEnaWorkspace);',
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  assert.equal(result.outputFiles.length, 1, "existing harnesses consume one in-memory JavaScript bundle");
  assert.ok(result.outputFiles[0].text.length > 0);
  assert.ok(Object.keys(result.metafile.inputs).every(path => !/node_modules\/next\//.test(path)),
    "the standalone workspace must not acquire a Next router runtime through attribution links");
});
