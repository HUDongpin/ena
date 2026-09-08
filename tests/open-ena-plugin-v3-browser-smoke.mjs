// Native Plugin Lab convergence regression, using an owned local runtime only.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServedBrowserV3 } from "./helpers/open-ena-served-browser-v3.mjs";
import { prepareNativeFixtureV3, runNativeFixtureV3, nativeFixtureIdentitiesV3 } from "./helpers/open-ena-native-browser-fixture-v3.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(root, "output/playwright/plugin-v3");
mkdirSync(outputRoot, { recursive: true });
const directory = mkdtempSync(join(outputRoot, "run-"));
const credentials = { username: `plugin_${randomBytes(12).toString("hex")}`, password: randomBytes(24).toString("hex"), secret: randomBytes(32).toString("hex") };
const redact = value => Object.values(credentials).reduce((text, secret) => text.replaceAll(secret, "[redacted]"), String(value));
const record = { status: "running", directory, checks: [], screenshots: [] };
const save = () => writeFileSync(join(directory, "plugin-policy.json"), JSON.stringify(record, null, 2) + "\n");
const patterns = [[1,1,0,0,0],[1,0,1,0,0],[1,0,0,1,0],[1,0,0,0,1],[0,1,1,0,0],[0,1,0,1,0],[0,1,0,0,1],[0,0,1,1,0],[0,0,1,0,1],[0,0,0,1,1]];
const csv = ["Group,Name,Conversation,CODE_A,CODE_B,CODE_C,CODE_D,CODE_E"];
for (const [groupIndex, group] of ["SYNTHETIC_BASELINE", "SYNTHETIC_SCAFFOLDED"].entries()) {
  for (let unit = 0; unit < 8; unit++) for (let turn = 0; turn < 3; turn++) csv.push([group, `UNIT_${unit}`, `CONVERSATION_${unit}`, ...patterns[(unit * 3 + turn + groupIndex * 4) % patterns.length]].join(","));
}
let runtime;
try {
  runtime = await createServedBrowserV3({ root, directory: join(directory, "runtime"), credentials, redact, disableBrowserCache: true });
  const page = runtime.page;
  await page.addInitScript(() => {
    const audit = { snapshots: 0, receiptHashes: 0, holdHashes: false, releases: [] };
    window.__pluginPolicyAudit = audit;
    const freeze = Object.freeze;
    Object.freeze = function(value) {
      if (value?.schemaVersion === "ena.hk/3d-presenter-snapshot/v1") audit.snapshots++;
      return freeze(value);
    };
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = function(algorithm, data) {
      const result = digest(algorithm, data);
      const text = new TextDecoder().decode(data);
      if (text.includes('"schemaVersion":"ena.hk/scientific-result/v1"')) {
        audit.receiptHashes++;
        if (audit.holdHashes) return result.then(bytes => new Promise(resolve => audit.releases.push(() => resolve(bytes))));
      }
      return result;
    };
  });
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  const mode = name => rail.getByRole("button", { name, exact: true }).click();
  const tab = name => page.getByRole("tab", { name: new RegExp(`^${name}(,|$)`) }).click();
  const view = name => page.locator(".ena-visual-toolbar").getByRole("button", { name: new RegExp(name) }).click();
  const receiptButton = page.getByRole("button", { name: "Plugin receipt ↓", exact: true });
  const figure = () => page.locator('figure[data-ena-plugin-id="ena-hk/3d-ena"]');
  const waitReady = () => page.waitForFunction(() => {
    const figures = [...document.querySelectorAll('figure[data-ena-plugin-id="ena-hk/3d-ena"]')];
    return figures.length === 1 && figures.every(f => f.querySelector('[data-ena-plot-ready="true"]'));
  }, null, { timeout: 60000 });
  const counts = () => page.evaluate(() => ({ snapshots: window.__pluginPolicyAudit.snapshots, hashes: window.__pluginPolicyAudit.receiptHashes, requests: window.__openEnaNativeAudit.requests.length }));
  const geometry = () => figure().evaluate(f => {
    const canvas = f.querySelector('[data-ena-plotly-root="true"]');
    return canvas.data.map(trace => ({ role: trace.meta.role, x: Array.from(trace.x ?? []), y: Array.from(trace.y ?? []), z: Array.from(trace.z ?? []) }));
  });
  const shot = async name => {
    const path = join(directory, `${name}.png`);
    await page.screenshot({ path, fullPage: true });
    record.screenshots.push({ path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") });
  };
  await runtime.stage("authenticate and run the synthetic native model", async () => {
    await page.goto(`${runtime.baseUrl}/en/open-ena`, { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox", { name: "Account name" }).fill(credentials.username);
    await page.getByRole("textbox", { name: "Password" }).fill(credentials.password);
    await runtime.drainAssetReads("login assets before sign-in");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await rail.waitFor({ timeout: 30000 });
    await mode("Data");
    await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({ name: "synthetic-plugin-convergence.csv", mimeType: "text/csv", buffer: Buffer.from(csv.join("\n") + "\n") });
    await prepareNativeFixtureV3(page);
    await runNativeFixtureV3(page);
    record.identity = await nativeFixtureIdentitiesV3(page);
    await mode("Plot Tools");
    const groups = page.getByTestId("open-ena-ona-descriptive-group-controls").getByRole("combobox");
    await groups.nth(0).selectOption("");
    await groups.nth(1).selectOption("");
    await view("3D ENA");
    await waitReady();
    await receiptButton.waitFor();
    assert.equal(await figure().getAttribute("data-ena-plugin-display"), "current");
    const download = page.waitForEvent("download");
    await receiptButton.click();
    const file = await download;
    const path = join(directory, "current-plugin-receipt.json");
    await file.saveAs(path);
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(receipt.parentResultBindingSha256, receipt.postPluginResultBindingSha256);
    record.initialReceipt = receipt;
    record.currentGeometry = await geometry();
    record.currentCounts = await counts();
    assert.ok(record.currentCounts.snapshots > 0 && record.currentCounts.hashes > 0);
    await shot("current-native-3d");
    record.checks.push("current native 3D uses the trusted plugin and exports a source-bound receipt");
  });
  await runtime.stage("invalidate while a genuine receipt hash is pending", async () => {
    await page.evaluate(() => { window.__pluginPolicyAudit.holdHashes = true; });
    await view("2D ENA");
    await view("3D ENA");
    await waitReady();
    await page.waitForFunction(() => window.__pluginPolicyAudit.releases.length > 0);
    await mode("Model");
    await tab("Windows");
    const rows = page.getByRole("group", { name: "Backward context", exact: true }).getByRole("textbox", { name: "Rows", exact: true });
    const before = await counts();
    await rows.fill("0");
    await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "stale");
    await page.evaluate(() => { const audit = window.__pluginPolicyAudit; audit.holdHashes = false; for (const release of audit.releases.splice(0)) release(); });
    await waitReady();
    assert.equal(await figure().getAttribute("data-ena-plugin-display"), "historical");
    assert.equal(await receiptButton.count(), 0);
    assert.equal(await page.getByRole("button", { name: "Download Model", exact: true }).isEnabled(), false);
    assert.deepEqual(await geometry(), record.currentGeometry, "the exact fitted historical geometry must remain on screen");
    const after = await counts();
    assert.equal(after.snapshots, before.snapshots, "stale rendering must not dispatch a plugin snapshot");
    assert.equal(after.requests, before.requests, "invalidating a draft must not rerun jENA");
    record.staleCounts = after;
    await shot("historical-native-3d");
    record.checks.push("pending receipt cannot reappear after invalidation; historical geometry is unchanged; current model export is disabled");
    await rows.fill("5");
    await page.getByRole("button", { name: "Run model", exact: true }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === "Run model" && !button.disabled));
    assert.equal(await figure().getAttribute("data-ena-plugin-display"), "historical", "restoring the same draft does not restore currentness");
    assert.equal((await counts()).snapshots, after.snapshots);
    await mode("Plot Tools");
    await view("2D ENA");
    await view("3D ENA");
    await waitReady();
    assert.equal((await counts()).snapshots, after.snapshots, "reopening historical 3D must not start a new plugin run");
    assert.equal(await receiptButton.count(), 0);
    record.checks.push("same-configuration ABA and reopening historical 3D do not restart plugins");
  });
  await runtime.stage("explicit rerun restores current plugin execution and export", async () => {
    await mode("Model");
    await tab("Windows");
    await runNativeFixtureV3(page);
    await waitReady();
    await receiptButton.waitFor();
    assert.equal(await figure().getAttribute("data-ena-plugin-display"), "current");
    assert.equal(await page.getByRole("button", { name: "Download Model", exact: true }).isEnabled(), true);
    const after = await counts();
    assert.ok(after.snapshots > record.staleCounts.snapshots);
    assert.equal(after.requests, record.staleCounts.requests + 1);
    record.finalCounts = after;
    await shot("rerun-current-native-3d");
    record.checks.push("one explicit model rerun restores current plugin execution and exports");
  });
  await runtime.drainAssetReads("final current native assets");
  assert.deepEqual(runtime.receipt.pageErrors, []);
  record.status = "pass";
  save();
  await runtime.close();
  console.log(JSON.stringify({ status: "pass", directory, checks: record.checks.length }));
} catch (error) {
  record.status = "fail";
  record.failure = redact(error.stack ?? error);
  save();
  if (runtime) {
    await runtime.page.locator("body").ariaSnapshot().then(text => writeFileSync(join(directory, "failure-aria.txt"), redact(text))).catch(() => {});
    await runtime.page.screenshot({ path: join(directory, "failure.png"), fullPage: true }).catch(() => {});
    await runtime.close(error).catch(cleanup => { record.cleanupFailure = redact(cleanup.stack ?? cleanup); save(); });
  }
  console.error(JSON.stringify({ status: "fail", directory, failure: record.failure }));
  process.exitCode = 1;
}
