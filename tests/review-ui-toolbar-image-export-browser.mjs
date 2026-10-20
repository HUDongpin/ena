import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

// A real Workspace and native compiler/run/binding pipeline; delay only the
// browser's image decode or PNG delivery, never any scientific validation.
const fixture = await readFile("tests/open-ena-model-v3-workspace-browser.mjs", "utf8");
const entry = fixture.split("const entry = `")[1].split("`;\nconst bundle")[0]
  .replace("job.resolve({result,sourceWitness:null})", "job.resolve({result,sourceWitness:await fitReferenceSourceV3(plan)})")
  .replace("createRoot(document.getElementById('root')).render(", "const root=createRoot(document.getElementById('root'));window.unmountWorkspace=()=>root.unmount();root.render(");
const bundle = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd() },
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent" });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const cases = ["decode", "blob"].flatMap(boundary => ["unchanged", "display-only", "scientific-edit", "edit-and-undo", "unmount"].map(scenario => ({ boundary, scenario })));
  cases.push({ boundary: "none", scenario: "initial-stale" });
  for (const artifact of ["reference", "current-analysis", "model", "data-view"]) for (const control of [false, true]) cases.push({ boundary: "digest", scenario: artifact + (control ? "-control" : "") });
  for (const { boundary, scenario } of cases) {
    if (process.env.REVIEW_EXPORT_SCENARIO && !scenario.startsWith(process.env.REVIEW_EXPORT_SCENARIO)) continue;
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    // Only the page itself is intercepted. Native blob: SVG decoding remains real.
    await page.route("http://localhost:32148/", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' }));
    await page.goto("http://localhost:32148/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole("button", { name: "Model", exact: true }).click();
    await page.getByTestId("open-ena-run-model").click();
    await page.waitForFunction(() => window.jobs.length === 1);
    await page.evaluate(() => window.resolveRun(0));
    await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]').dataset.resultStatus === "current");
    if (boundary === "digest") {
      const control = scenario.endsWith("-control");
      const artifact = scenario.replace(/-control$/u, "");
      if (artifact === "data-view") {
        await page.getByRole("button", { name: "Stats & Export", exact: true }).click();
        await page.getByText("Local identity-bearing bound Data View", { exact: true }).click();
      }
      await page.evaluate(() => {
        window.confirm = () => true;
        window.imageDownloads = [];
        HTMLAnchorElement.prototype.click = function () { window.imageDownloads.push(this.download); };
        const digest = crypto.subtle.digest.bind(crypto.subtle);
        let hold = true;
        window.pendingDigests = 0;
        window.releaseDigest = null;
        crypto.subtle.digest = async (...args) => {
          window.pendingDigests++;
          try {
            if (hold) { hold = false; await new Promise(resolve => { window.releaseDigest = resolve; }); }
            return await digest(...args);
          } finally { window.pendingDigests--; }
        };
      });
      if (artifact !== "model" && artifact !== "data-view") await page.locator(".ena-artifacts-disclosure > summary").click();
      const trigger = artifact === "reference" ? page.getByRole("button", { name: "Export Reference", exact: true })
        : artifact === "current-analysis" ? page.getByTestId("open-ena-export-current-analysis")
        : artifact === "data-view" ? page.getByRole("button", { name: "Export current Data View", exact: true })
        : page.locator(".ena-download-model-button");
      await trigger.click();
      await page.waitForFunction(() => typeof window.releaseDigest === "function");
      await page.evaluate(control => { if (!control) window.unmountWorkspace(); window.releaseDigest(); }, control);
      await page.waitForFunction(() => window.pendingDigests === 0);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const downloads = await page.evaluate(() => window.imageDownloads);
      const expected = control ? 1 : 0;
      results.push({ boundary, scenario, actualDownloads: downloads.length, expectedDownloads: expected, errors, passed: downloads.length === expected && errors.length === 0 });
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
      continue;
    }
    if (scenario === "initial-stale") {
      await page.getByRole("tab", { name: /Codes,/ }).click();
      await page.getByRole("button", { name: "Exclude all selected Codes", exact: true }).click();
      const svgDisabled = await page.getByRole("button", { name: "Export SVG", exact: true }).isDisabled();
      const pngDisabled = await page.getByRole("button", { name: "Export PNG", exact: true }).isDisabled();
      results.push({ boundary, scenario, svgDisabled, pngDisabled, errors, passed: svgDisabled && pngDisabled && errors.length === 0 });
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
      continue;
    }
    await page.evaluate(boundary => {
      window.confirm = () => true;
      window.imageDownloads = [];
      window.imageReleased = false;
      window.imageBarrier = null;
      window.imageRevoked = [];
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = value => { window.imageRevoked.push(value); return revoke(value); };
      const imageBlobs = new Map();
      const createObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => { const url = createObjectURL(blob); imageBlobs.set(url, blob); return url; };
      HTMLAnchorElement.prototype.click = function () {
        const blob = imageBlobs.get(this.href);
        window.imageDownloads.push({ name: this.download, type: blob?.type, size: blob?.size });
      };
      if (boundary === "blob") {
        const toBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
          return toBlob.call(this, blob => {
            window.imageBarrier = () => { callback(blob); window.imageReleased = true; };
          }, ...args);
        };
      } else {
        const NativeImage = window.Image;
        window.Image = function (...args) {
          const image = new NativeImage(...args);
          let assigned;
          Object.defineProperty(image, "onload", { set(callback) { assigned = callback; }, get() { return assigned; } });
          image.addEventListener("load", event => { window.imageBarrier = () => { assigned?.call(image, event); window.imageReleased = true; }; });
          return image;
        };
      }
    }, boundary);
    await page.getByRole("button", { name: "Export PNG", exact: true }).click();
    await page.waitForFunction(() => typeof window.imageBarrier === "function");
    if (scenario === "unmount") await page.evaluate(() => window.unmountWorkspace());
    else if (scenario !== "unchanged") {
      await page.getByRole("tab", { name: /Codes,/ }).click();
      if (scenario === "display-only") await page.getByRole("button", { name: "Hide A node", exact: true }).click();
      else {
        await page.getByRole("button", { name: "Exclude all selected Codes", exact: true }).click();
        if (scenario === "edit-and-undo") await page.getByRole("button", { name: "Undo Code exclusion", exact: true }).click();
        assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status"), "stale");
      }
    }
    await page.evaluate(() => window.imageBarrier());
    await page.waitForFunction(() => window.imageReleased && window.imageRevoked.length > 0);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const downloads = await page.evaluate(() => window.imageDownloads);
    const expected = scenario === "unchanged" || scenario === "display-only" ? 1 : 0;
    const actualPngs = downloads.every(file => file.name.endsWith("-plot.png") && file.type === "image/png" && file.size > 100);
    const passed = downloads.length === expected && actualPngs && errors.length === 0;
    results.push({ boundary, scenario, expectedDownloads: expected, actualDownloads: downloads.length, actualPngs, errors, passed });
    console.log(JSON.stringify(results.at(-1)));
    await page.close();
  }
} finally { await browser.close(); }
if (process.env.REVIEW_RESULT_PATH) await writeFile(process.env.REVIEW_RESULT_PATH, JSON.stringify(results, null, 2));
assert.ok(results.every(result => result.passed), "stale or unmounted current export actions must not output files");
