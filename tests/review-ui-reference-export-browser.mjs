import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

// Exercise the real Workspace, Reference minting and browser digest boundary.
// The source fixture is synthetic and every browser request is intercepted.
const fixture = await readFile("tests/open-ena-model-v3-workspace-browser.mjs", "utf8");
const entry = fixture.split("const entry = `")[1].split("`;\nconst bundle")[0]
  .replace("job.resolve({result,sourceWitness:null})", "job.resolve({result,sourceWitness:await fitReferenceSourceV3(plan)})");
const bundle = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd() },
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent" });
const browser = await chromium.launch({ headless: true });
try {
  for (const scenario of ["unchanged", "display-only", "scientific-edit", "edit-and-undo"]) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      assert.equal(new URL(route.request().url()).origin, "http://localhost:32147");
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
    });
    await page.goto("http://localhost:32147/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole("button", { name: "Model", exact: true }).click();
    await page.getByTestId("open-ena-run-model").click();
    await page.waitForFunction(() => window.jobs.length === 1);
    await page.evaluate(() => window.resolveRun(0));
    await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]').dataset.resultStatus === "current");
    await page.locator(".ena-artifacts-disclosure > summary").click();
    await page.evaluate(() => {
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      window.reviewDownloads = [];
      HTMLAnchorElement.prototype.click = function () { window.reviewDownloads.push(this.download); };
      let hold = true;
      window.reviewPendingDigests = 0;
      window.reviewReleaseDigest = null;
      crypto.subtle.digest = async (...args) => {
        window.reviewPendingDigests++;
        try {
          if (hold) {
            hold = false;
            await new Promise(resolve => { window.reviewReleaseDigest = resolve; });
          }
          return await digest(...args);
        } finally { window.reviewPendingDigests--; }
      };
    });
    await page.getByRole("button", { name: "Export Reference", exact: true }).click();
    await page.waitForFunction(() => typeof window.reviewReleaseDigest === "function");
    await page.getByRole("tab", { name: /Codes,/ }).click();
    if (scenario === "display-only") {
      await page.getByRole("button", { name: "Hide A node", exact: true }).click();
    } else if (scenario === "scientific-edit" || scenario === "edit-and-undo") {
      await page.getByRole("button", { name: "Exclude all selected Codes", exact: true }).click();
      if (scenario === "edit-and-undo") await page.getByRole("button", { name: "Undo Code exclusion", exact: true }).click();
      assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status"), "stale");
    }
    await page.evaluate(() => window.reviewReleaseDigest());
    await page.waitForFunction(() => window.reviewPendingDigests === 0);
    // Allow the event handler's continuation to settle after the final digest.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const downloads = await page.evaluate(() => window.reviewDownloads);
    assert.equal(downloads.length, scenario === "unchanged" || scenario === "display-only" ? 1 : 0,
      `${scenario}: only a still-current Reference export may download after hashing`);
    assert.deepEqual(errors, []);
    console.log(`${scenario}: Reference export lease PASS`);
    await page.close();
  }
} finally { await browser.close(); }
