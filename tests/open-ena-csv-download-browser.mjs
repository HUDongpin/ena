import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

// Exercise the actual final download boundary without changing its visibility
// in production. CSV serializers and artifact hashes stay upstream of this seam.
const bundle = await build({
  stdin: {
    contents: `import { downloadText } from './components/open-ena/OpenEnaWorkspace';
      import { rowsToCsv } from './lib/open-ena/export';
      import { parseCsv } from './lib/open-ena/csv';
      window.downloadText = downloadText; window.rowsToCsv = rowsToCsv; window.parseCsv = parseCsv;`,
    loader: "ts", resolveDir: process.cwd(),
  },
  plugins: [{ name: "expose-download-boundary", setup(builder) {
    builder.onLoad({ filter: /OpenEnaWorkspace\.tsx$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nexport { downloadText };`, loader: "tsx",
    }));
  } }],
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><main></main>" }));
  await page.goto("http://localhost:32192/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    const create = URL.createObjectURL;
    window.downloadTypes = [];
    URL.createObjectURL = blob => { window.downloadTypes.push(blob.type); return create(blob); };
  });
  const csv = await page.evaluate(() => window.rowsToCsv([
    { "參與者": "中文 café 👩‍🔬", "A → B": 1.5, "引號": 'a,"b"', "多行": "line 1\nline 2" },
  ]));
  assert.equal(csv.startsWith("\ufeff"), false, "internal rowsToCsv remains BOM-free");
  for (const [filename, type, contents] of [
    ["result.csv", "text/csv;charset=utf-8", csv],
    ["bound-data-view.csv", "text/csv", csv],
    ["native-contrast-edges.csv", "text/csv", csv],
    ["ona-aggregate-edges.csv", "text/csv", csv],
    ["original.csv", "text/csv", `\ufeff${csv}`],
  ]) {
    const waiting = page.waitForEvent("download");
    await page.evaluate(args => window.downloadText(...args), [filename, contents, type]);
    const download = await waiting;
    const bytes = await readFile(await download.path());
    assert.equal(download.suggestedFilename(), filename);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${filename}: Excel UTF-8 signature`);
    assert.equal(bytes.subarray(3).toString("utf8"), csv, `${filename}: exactly one BOM and unchanged content`);
    assert.equal(await page.evaluate(() => window.downloadTypes.at(-1)), "text/csv;charset=utf-8");
    const reparsed = await page.evaluate(text => window.parseCsv(text, { name: "roundtrip.csv", sizeBytes: new TextEncoder().encode(text).length, source: "upload" }), bytes.toString("utf8"));
    assert.deepEqual(reparsed.headers, ["參與者", "A → B", "引號", "多行"]);
    assert.equal(reparsed.rows[0]["參與者"], "中文 café 👩‍🔬");
    assert.equal(reparsed.rows[0]["多行"], "line 1\nline 2");
  }
  for (const [filename, type, text] of [
    ["result.json", "application/json;charset=utf-8", '{"中文":"café"}\n'],
    ["plot.svg", "image/svg+xml;charset=utf-8", '<svg><text>中文 →</text></svg>'],
    ["methods.md", "text/markdown", "# 中文\n"],
  ]) {
    const waiting = page.waitForEvent("download");
    await page.evaluate(args => window.downloadText(...args), [filename, text, type]);
    const bytes = await readFile(await (await waiting).path());
    assert.deepEqual(bytes, Buffer.from(text), `${filename}: non-CSV bytes unchanged`);
    assert.equal(await page.evaluate(() => window.downloadTypes.at(-1)), type);
  }
  assert.deepEqual(errors, []);
  console.log("CSV final browser downloads: UTF-8 BOM, Chinese/Unicode, reimport and unchanged non-CSV bytes PASS");
} finally { await browser.close(); }
