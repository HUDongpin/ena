import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServedBrowserV3 } from "./helpers/open-ena-served-browser-v3.mjs";

const root = process.cwd();
const directory = resolve(process.env.OPEN_ENA_STALE_LAYOUT_ARTIFACT_DIR ?? "output/playwright/stale-plot-layout");
const credentials = { username: "stale_layout_local_test", password: "synthetic_stale_layout_test_2026", secret: "synthetic_stale_layout_secret_0123456789abcdef" };
const redact = value => Object.values(credentials).reduce((text, secret) => text.replaceAll(secret, "[redacted]"), String(value));
const selectors = '[data-testid="open-ena-group-comparison-plot"], [data-testid="open-ena-group-primary-plot"], [data-testid="open-ena-group-secondary-plot"]';
const summary = { status: "running", cases: [] };
mkdirSync(directory, { recursive: true });
let runtime, failure;
try {
  runtime = await createServedBrowserV3({ root, directory: directory + "-runtime", credentials, redact, disableBrowserCache: true });
  const page = runtime.page;
  await page.addInitScript(() => {
    window.__staleLayoutAudit = { runs: 0 };
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...rest) {
      if (message?.kind === "run-open-ena-plan-v3") window.__staleLayoutAudit.runs++;
      return send.call(this, message, ...rest);
    };
  });
  await runtime.stage("load public teaching sample", async () => {
    await page.goto(`${runtime.baseUrl}/en/open-ena`, { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox", { name: "Account name" }).fill(credentials.username);
    await page.getByRole("textbox", { name: "Password" }).fill(credentials.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Load sample", exact: true }).click();
    await page.getByTestId("open-ena-group-comparison-plot").waitFor();
  });
  const geometry = () => page.locator(selectors).evaluateAll(plots => plots.map(svg => {
    const box = svg.getBoundingClientRect();
    return {
      id: svg.getAttribute("data-testid"), viewport: { x: box.x, y: box.y, width: box.width, height: box.height }, viewBox: svg.getAttribute("viewBox"),
      nodes: [...svg.querySelectorAll("[data-ena-code]")].map(node => ({ code: node.getAttribute("data-ena-code"), position: node.parentElement.getAttribute("transform"), radius: node.getAttribute("r") })),
      edges: [...svg.querySelectorAll("[data-ena-edge]")].map(line => line.outerHTML),
      labels: [...svg.querySelectorAll("[data-ena-label-position]")].map(label => [label.textContent, label.getAttribute("transform")]),
    };
  }));
  await runtime.stage("circle-minus excludes and undoes Group without changing the 2D plots", async () => {
    const group = page.getByRole("combobox", { name: "Create Sample / Group", exact: true });
    const exclude = page.getByRole("button", { name: "Exclude group configuration", exact: true });
    const originalGroup = await group.inputValue();
    assert.equal(originalGroup, "condition");
    const before = await geometry();
    await page.locator(selectors).evaluateAll(plots => { window.__excludePlotNodes = plots; });
    await page.screenshot({ path: join(directory, "before-group-exclusion.png"), fullPage: true });
    for (let cycle = 1; cycle <= 2; cycle++) {
      await exclude.click();
      const undo = page.getByRole("button", { name: "Undo Group exclusion", exact: true });
      await undo.waitFor();
      assert.equal(await group.inputValue(), "", "circle-minus must actually remove the Group setting");
      assert.equal(await exclude.isDisabled(), true, "no Group remains to exclude twice");
      assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status"), "stale");
      assert.equal(await page.getByRole("button", { name: "Download Model", exact: true }).isDisabled(), true);
      assert.deepEqual(await geometry(), before, "Group exclusion must preserve all three plot frames, geometry and labels");
      assert.equal(await page.locator(".open-ena-main-svg").count(), 0, "Group exclusion must not mount the oversized fallback");
      assert.equal(await page.locator(selectors).evaluateAll(plots => plots.length === 3 && plots.every((plot, index) => plot === window.__excludePlotNodes[index])), true);
      if (cycle === 1) await page.screenshot({ path: join(directory, "after-group-exclusion.png"), fullPage: true });
      await undo.click();
      assert.equal(await group.inputValue(), originalGroup);
      assert.equal(await exclude.isEnabled(), true);
      assert.equal(await undo.count(), 0);
      assert.deepEqual(await geometry(), before, "Undo must restore the setting without resizing the plots");
      assert.equal(await page.evaluate(() => window.__staleLayoutAudit.runs), 1, "exclude and undo cannot rerun science");
    }
    await page.screenshot({ path: join(directory, "after-group-exclusion-undo.png"), fullPage: true });
    summary.groupExclusion = { status: "PASS", cycles: 2, originalGroup, excludedGroup: "No Group", plotGeometryPreserved: true, plotInstancesPreserved: true, undoRestoresGroup: true, analysisRuns: 1 };
    summary.cases.push("circle-minus excludes and undoes Group twice while preserving all 2D plots");
  });
  await runtime.stage("retain 2D plots after Unit edit", async () => {
    // Preserve a deliberate zoom and label adjustment, not just default settings.
    await page.getByRole("button", { name: "Comparison Plot: Zoom In", exact: true }).click();
    const text = page.getByTestId("open-ena-group-comparison-plot").locator("[data-ena-label-position]").filter({ hasText: /^strategy$/ }).locator("text");
    const box = await text.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 28, box.y + box.height / 2 - 14, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('[data-ena-node-layout-overrides="1"]'));
    summary.before = await geometry();
    assert.equal(summary.before.length, 3);
    await page.screenshot({ path: join(directory, "before-unit-edit.png"), fullPage: true });
    await page.locator(selectors).evaluateAll(plots => { window.__retainedPlotNodes = plots; });
    await page.getByRole("button", { name: "Add or remove Unit fields fields", exact: true }).click();
    await page.getByRole("region", { name: "Unit fields", exact: true }).getByRole("checkbox", { name: "condition", exact: true }).check();
    await page.getByRole("button", { name: "Add or remove Unit fields fields", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "stale");
    summary.after = await geometry();
    await page.screenshot({ path: join(directory, "after-unit-edit.png"), fullPage: true });
    assert.equal(summary.after.length, 3, "editing Units must retain the 2D triptych instead of switching to an oversized legacy plot");
    assert.deepEqual(summary.after, summary.before, "stale state must preserve plot dimensions, scale, nodes, edges and text positions");
    assert.equal(await page.locator(selectors).evaluateAll(plots => plots.every((plot, index) => plot === window.__retainedPlotNodes[index])), true, "scientific edits must not remount the plot or discard zoom");
    assert.equal(await page.locator(".open-ena-main-svg").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Download Model", exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__staleLayoutAudit.runs), 1);
    summary.cases.push("Unit edit preserves 2D triptych and disables current model download");
  });
  await runtime.stage("stale display selection and view switching", async () => {
    await page.getByRole("navigation", { name: "Analysis modes" }).getByRole("button", { name: "Plot Tools", exact: true }).click();
    await page.getByRole("button", { name: "Switch Plots", exact: true }).last().click();
    assert.equal(await page.locator(selectors).count(), 3);
    await page.getByRole("button", { name: "3D ENA", exact: true }).click();
    for (const id of ["open-ena-3d-comparison-plot", "open-ena-3d-primary-plot", "open-ena-3d-secondary-plot"]) {
      await page.getByTestId(id).locator('[data-ena-plotly-root="true"]').waitFor();
    }
    await page.getByRole("button", { name: "2D ENA", exact: true }).click();
    assert.equal(await page.locator(selectors).count(), 3);
    assert.equal(await page.evaluate(() => window.__staleLayoutAudit.runs), 1);
    summary.cases.push("stale group swap and 2D/3D switch retain triptych without rerunning science");
  });
  await runtime.stage("rebuild restores current result in the same layout", async () => {
    await page.getByRole("navigation", { name: "Analysis modes" }).getByRole("button", { name: "Model", exact: true }).click();
    await page.getByRole("button", { name: "Rebuild model", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current");
    assert.equal(await page.locator(selectors).count(), 3);
    assert.equal(await page.getByRole("button", { name: "Download Model", exact: true }).isEnabled(), true);
    assert.equal(await page.evaluate(() => window.__staleLayoutAudit.runs), 2);
    summary.cases.push("explicit rebuild restores current status and model download");
  });
  summary.status = "PASS";
} catch (error) {
  failure = error;
  summary.status = "FAIL";
  summary.error = redact(error.stack ?? error);
  process.exitCode = 1;
} finally {
  if (runtime) await runtime.close(failure);
  writeFileSync(join(directory, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ status: summary.status, cases: summary.cases, error: summary.error }));
}
