#!/usr/bin/env node
// Served production integration gate. Observations never confer compiler or result authority.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { expectedLoginPrefetchCancellation } from "./helpers/open-ena-models-v3-browser-custody.mjs";
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(process.env.OPEN_ENA_MODELS_V3_ARTIFACT_ROOT ?? tmpdir(), "task37-models-v3-"));
const gitPointer = statSync(join(root, ".git")).isDirectory() ? join(root, ".git") : readFileSync(join(root, ".git"), "utf8").trim().replace(/^gitdir: /u, "");
const gitArgs = ["--no-optional-locks", `--git-dir=${resolve(root, gitPointer)}`, `--work-tree=${root}`, "-c", `core.worktree=${root}`, "-c", "core.fsmonitor=false"];
const git = (...args) => execFileSync("git", [...gitArgs, ...args], { cwd: root, encoding: "utf8" }).trim();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = (name, value) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n");
function sourceManifest() {
    const stages = new Map(git("ls-files", "--stage", "-z").split("\0").filter(Boolean).map(entry => { const [metadata, path] = entry.split("\t"); return [path, metadata]; }));
    const files = [...new Set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0"))].filter(Boolean).sort();
    return files.map(path => { const stage = stages.get(path) ?? ""; if (stage.startsWith("160000 "))
        return { path, mode: "160000", gitlinkOid: stage.split(" ")[1] }; assert.ok(statSync(join(root, path)).isFile(), `unsupported source entry ${path}`); return { path, mode: (statSync(join(root, path)).mode & 0o777).toString(8), sha256: hash(readFileSync(join(root, path))) }; });
}
function treeManifest(path, prefix = "") {
    return readdirSync(path).sort().flatMap(name => { const relative = join(prefix, name); const full = join(path, name); return statSync(full).isDirectory() ? treeManifest(full, relative) : [{ path: relative, sha256: hash(readFileSync(full)) }]; });
}
const credentials = { username: `task37_${randomBytes(12).toString("hex")}`, password: randomBytes(32).toString("hex"), secret: randomBytes(32).toString("hex"), account: `task37_${randomBytes(12).toString("hex")}` };
const redact = value => Object.values(credentials).reduce((text, secret) => text.replaceAll(secret, "[redacted]"), String(value)).replace(/(postgresql:\/\/)[^\s]+/gu, "$1[redacted]");
const receipt = { status: "running", directory, sourceGitSha: git("rev-parse", "HEAD"), parentGitSha: git("rev-parse", "HEAD^"), node: process.version, npm: execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(), npmPath: execFileSync("which", ["npm"], { encoding: "utf8" }).trim(), harnessPid: process.pid, harnessParentPid: process.ppid, journeys: [], screenshots: [], errors: [], zoomMechanism: "CSS zoom: 2; reflow evidence, not native browser zoom", visualInspection: { status: "pending", actor: "agent" } };
const env = { ...process.env, NEXT_DIST_DIR: ".next", OPEN_ENA_USERNAME: credentials.username, OPEN_ENA_PASSWORD: credentials.password, OPEN_ENA_SESSION_SECRET: credentials.secret, OPEN_ENA_ACCOUNT_ID: credentials.account, OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS: "1", NEXT_TELEMETRY_DISABLED: "1", npm_config_cache: join(directory, "npm-cache") };
async function port() { return new Promise((yes, no) => { const server = createServer(); server.once("error", no); server.listen(0, "127.0.0.1", () => { const value = server.address().port; server.close(error => error ? no(error) : yes(value)); }); }); }
let database, databaseRunning = false, server, browser, page, serverLog = "";
const assetReads = [];
receipt.servedAssets = [];
const loginTiming = {};
const requestStarts = new WeakMap();
const failedRequests = [];
receipt.expectedNavigationCancellations = [];
receipt.failedRequests = failedRequests;
receipt.loginViewport = { width: 390, height: 844 };
receipt.workspaceViewport = { width: 1440, height: 960 };
async function startDatabase() {
    database = join(directory, "postgres");
    execFileSync("initdb", ["--pgdata", database, "--auth", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale"], { stdio: "ignore" });
    const value = await port();
    execFileSync("pg_ctl", ["--pgdata", database, "--log", join(directory, "postgres.log"), "--options", `-h 127.0.0.1 -p ${value} -c unix_socket_directories=`, "--wait", "start"], { stdio: "ignore" });
    databaseRunning = true;
    execFileSync("psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--host", "127.0.0.1", "--port", String(value), "--username", "postgres", "--dbname", "postgres", "--file", join(root, "migrations/002_open_ena_auth_security.sql")], { stdio: "ignore" });
    return `postgresql://postgres@127.0.0.1:${value}/postgres`;
}
async function child(command, args, environment, logName) {
    const processChild = spawn(command, args, { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    processChild.stdout.on("data", bytes => { output += redact(bytes); });
    processChild.stderr.on("data", bytes => { output += redact(bytes); });
    const code = await new Promise((yes, no) => { processChild.once("error", no); processChild.once("exit", yes); });
    writeFileSync(join(directory, logName), output);
    assert.equal(code, 0, `${logName} exited ${code}`);
    return { command: [command, ...args], pid: processChild.pid, parentPid: process.pid, exitCode: code, log: logName };
}
async function stopServer() {
    if (!server || server.exitCode !== null)
        return;
    server.kill("SIGTERM");
    await Promise.race([new Promise(done => server.once("exit", done)), new Promise(done => setTimeout(done, 5000))]);
    if (server.exitCode === null && server.signalCode === null) {
        server.kill("SIGKILL");
        await new Promise(done => server.once("exit", done));
    }
    receipt.server.stopped = true;
}
const button = name => page.getByRole("button", { name, exact: true });
const tab = name => page.getByRole("tab", { name: new RegExp(`^${name}(,|$)`) });
async function mode(name) { await page.getByRole("navigation", { name: "Analysis modes" }).getByRole("button", { name, exact: true }).click(); }
async function shot(name, fullPage = true) { const path = join(directory, `${name}.png`); await page.screenshot({ path, fullPage }); receipt.screenshots.push({ path, sha256: hash(readFileSync(path)) }); }
async function journey(id, name, action) { const entry = { id, name, status: "running" }; receipt.journeys.push(entry); console.log(`Journey ${id}: ${name}`); entry.evidence = await action(); entry.status = "pass"; console.log(`Journey ${id}: PASS`); json("receipt.json", receipt); }
async function dump(name) { writeFileSync(join(directory, `${name}.txt`), await page.locator("body").innerText()); writeFileSync(join(directory, `${name}-aria.txt`), await page.locator("body").ariaSnapshot()); }
async function current() { await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current", null, { timeout: 60000 }); }
async function lastRun() { return page.evaluate(() => { const response = window.__task37WorkerAudit.filter(x => x.direction === "response" && x.message.kind === "result-v3").at(-1); const request = window.__task37WorkerAudit.find(x => x.direction === "request" && x.message.id === response?.message.id); return { request: request?.message, response: response?.message }; }); }
async function run(label) {
    const before = await page.evaluate(() => window.__task37WorkerAudit.filter(x => x.message.kind === "result-v3").length);
    await button("Run model").click();
    await page.waitForFunction(n => window.__task37WorkerAudit.filter(x => x.message.kind === "result-v3").length > n, before, { timeout: 60000 });
    await current();
    const audit = await lastRun();
    assert.equal(audit.request.kind, "run-open-ena-plan-v3");
    assert.equal(audit.response.executionPlanSha256, audit.response.result.binding.executionPlanSha256);
    assert.equal(audit.response.executionPlanSha256, audit.request.plan.header.executionPlanSha256);
    assert.equal(audit.response.result.binding.datasetSha256, audit.request.plan.header.datasetSha256);
    json(`run-${label}.json`, audit);
    return audit;
}
async function download(name, filename) { const pending = page.waitForEvent("download"); await button(name).click(); const item = await pending; const path = join(directory, filename); await item.saveAs(path); return { path, value: JSON.parse(readFileSync(path, "utf8")), sha256: hash(readFileSync(path)) }; }
async function layout(label) {
    const metrics = await page.evaluate(() => { const list = document.querySelector('[role="tablist"][aria-label="Model configuration"]'); const active = list?.querySelector('[aria-selected="true"]'); const panel = document.querySelector('[role="tabpanel"]'); const first = panel?.firstElementChild; return { width: innerWidth, scroll: document.documentElement.scrollWidth, tabTop: active?.getBoundingClientRect().top, listTop: list?.getBoundingClientRect().top, childGap: first && panel ? first.getBoundingClientRect().top - panel.getBoundingClientRect().top : null, panelHeight: panel?.getBoundingClientRect().height }; });
    assert.ok(metrics.scroll <= metrics.width + 1, `${label}: horizontal document overflow ${JSON.stringify(metrics)}`);
    assert.ok(Math.abs(metrics.tabTop - metrics.listTop) <= 2, `${label}: active tab top gray gap`);
    assert.ok(metrics.childGap >= 0 && metrics.childGap <= 17, `${label}: vacated panel height`);
    return metrics;
}
async function waitForScrollSettlement(locator) {
    await locator.evaluate(node => new Promise(resolve => {
        const started = performance.now(); let previous = node.getBoundingClientRect(); let stable = 0;
        const frame = () => { const now = node.getBoundingClientRect(); stable = Math.abs(now.top - previous.top) < 0.25 && Math.abs(now.left - previous.left) < 0.25 ? stable + 1 : 0; previous = now;
            if ((stable >= 8 && performance.now() - started >= 180) || performance.now() - started > 1800) resolve(); else requestAnimationFrame(frame); };
        requestAnimationFrame(frame);
    }));
}
async function assertReachable(locator, label) {
    const readScrollChain = node => { const chain = []; for (let p = node; p; p = p.parentElement) { const style = getComputedStyle(p); chain.push({ element: p.className || p.tagName, overflowY: style.overflowY, overscroll: style.overscrollBehaviorY, scrollTop: p.scrollTop, scrollHeight: p.scrollHeight, clientHeight: p.clientHeight }); } return chain; };
    const scrollBefore = await locator.evaluate(readScrollChain);
    await locator.focus();
    // Actual sequential keyboard navigation invokes the browser's normal scroll-to-focus.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await page.waitForFunction(node => { const r = node.getBoundingClientRect(); return document.activeElement === node && r.top >= -2 && r.bottom <= innerHeight + 2; }, await locator.elementHandle(), { timeout: 1500 }).catch(() => {});
    await waitForScrollSettlement(locator);
    const fieldValue = await locator.evaluate(node => "value" in node ? node.value : null);
    const wheelActions = [];
    const viewport = page.viewportSize();
    for (let attempt = 0; attempt < 3; attempt++) {
        const r = await locator.boundingBox();
        if (!r || r.x < 0 || r.x + r.width > viewport.width || (r.y >= -2 && r.y + r.height <= viewport.height + 2)) break;
        const deltaY = r.y < 0 ? r.y - 64 : r.y + r.height - viewport.height + 64;
        // Scroll over the middle of the visible panel, avoiding the fixed bottom Data View bar.
        await page.mouse.move(Math.min(viewport.width - 2, Math.max(2, r.x + 5)), viewport.height / 2);
        await page.mouse.wheel(0, deltaY);
        wheelActions.push({ deltaY });
        await page.waitForFunction(node => { const box = node.getBoundingClientRect(); return box.top >= -2 && box.bottom <= innerHeight + 2; }, await locator.elementHandle(), { timeout: 1000 }).catch(() => {});
        await waitForScrollSettlement(locator);
        const afterWheel = await locator.boundingBox();
        if (afterWheel && (afterWheel.y < -2 || afterWheel.y + afterWheel.height > viewport.height + 2)) {
            const key = afterWheel.y < 0 ? "PageUp" : "PageDown";
            await page.keyboard.press(key); wheelActions.push({ keyboardScroll: key });
            await page.waitForFunction(node => { const box = node.getBoundingClientRect(); return box.top >= -2 && box.bottom <= innerHeight + 2; }, await locator.elementHandle(), { timeout: 1000 }).catch(() => {});
        }
        await waitForScrollSettlement(locator);
        assert.equal(await locator.evaluate(node => "value" in node ? node.value : null), fieldValue, `${label}: ordinary scrolling must not edit the field`);
    }
    const geometry = await locator.evaluate(node => {
        const r = node.getBoundingClientRect();
        const clippedBy = [];
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent), p = parent.getBoundingClientRect();
            if (/(hidden|clip|auto|scroll)/.test(style.overflowX) && (r.left < p.left - 2 || r.right > p.right + 2)) clippedBy.push({ element: parent.className || parent.tagName, axis: "x", left: p.left, right: p.right });
            if (/(hidden|clip|auto|scroll)/.test(style.overflowY) && (r.top < p.top - 2 || r.bottom > p.bottom + 2)) clippedBy.push({ element: parent.className || parent.tagName, axis: "y", top: p.top, bottom: p.bottom });
        }
        return { focused: document.activeElement === node, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight, clippedBy };
    });
    const measurement = { label, wheelActions, scrollBefore, scrollAfter: await locator.evaluate(readScrollChain), ...geometry };
    (receipt.reachabilityAttempts ??= []).push(measurement);
    assert.equal(geometry.focused, true, `${label}: native keyboard focus`);
    assert.ok(geometry.left >= -2 && geometry.right <= geometry.width + 2 && geometry.top >= -2 && geometry.bottom <= geometry.height + 2, `${label}: outside visible viewport ${JSON.stringify(geometry)}`);
    assert.deepEqual(geometry.clippedBy, [], `${label}: clipped by scrolling ancestor`);
    return measurement;
}
async function strictSourceBoundaries() {
    // Ordinary source upload is typed by explicit researcher actions, never a test config injection.
    await mode("Data");
    const codeNames = ["goal", "evidence", "strategy", "tradeoff", "revision"];
    const source = readFileSync(join(root, "public/data/academy/ena-design-talk-sample.csv"), "utf8").trimEnd().split("\n");
    const csv = source.map((line, index) => index === 0 ? `${line},fraction,negative,logical,nonfinite` : `${line},${index % 2 ? "0.5" : "1.25"},-1,${index % 2 ? "true" : "false"},Infinity`).join("\n") + "\n";
    const path = join(directory, "strict-source-boundaries.csv");
    writeFileSync(path, csv);
    const input = page.getByLabel("Open coded CSV or XLSX", { exact: true });
    await input.setInputFiles(path);
    await page.getByRole("button", { name: "Cancel source preparation", exact: true }).waitFor();
    await page.waitForFunction(node => node.contains(document.activeElement), await page.getByRole("dialog").elementHandle());
    await page.keyboard.press("Escape");
    await page.waitForFunction(node => node === document.activeElement, await input.elementHandle());
    assert.equal(await input.evaluate(node => node === document.activeElement), true);
    await input.setInputFiles(path);
    for (const column of [...codeNames, "line_number", "fraction", "negative", "nonfinite"])
        await page.getByRole("combobox", { name: `Source type: ${column}`, exact: true }).selectOption("number");
    await page.getByRole("combobox", { name: "Source type: logical", exact: true }).selectOption("boolean");
    assert.equal(await button("Confirm types and create typed XLSX").isDisabled(), true, "nonfinite numeric input must block source typing");
    await page.getByRole("combobox", { name: "Source type: nonfinite", exact: true }).selectOption("text");
    const runsBefore = await page.evaluate(() => window.__task37WorkerAudit.length);
    await button("Confirm types and create typed XLSX").click();
    await tab("Units").waitFor();
    assert.equal(await page.evaluate(() => window.__task37WorkerAudit.length), runsBefore, "ordinary upload cannot autorun");
    await button("Add or remove Unit fields fields").click();
    await page.getByRole("region", { name: "Unit fields", exact: true }).getByLabel("team_id", { exact: true }).check();
    await button("Add or remove Unit fields fields").click();
    await page.getByRole("combobox", { name: "Create Sample / Group", exact: true }).selectOption("condition");
    await tab("Horizons").click();
    await button("Add or remove Horizon identity fields").click();
    await page.getByRole("region", { name: "Horizon identity", exact: true }).getByLabel("conversation_id", { exact: true }).check();
    await button("Add or remove Horizon identity fields").click();
    await tab("Codes").click();
    await page.getByRole("toolbar", { name: "Code actions" }).getByRole("button", { name: "Manage Codes", exact: true }).click();
    for (const code of codeNames)
        await page.getByLabel(`Select ${code} as a Code`, { exact: true }).check();
    assert.equal(await page.getByLabel("Select fraction as a Code", { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel("Select negative as a Code", { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel("Select nonfinite as a Code", { exact: true }).isDisabled(), true);
    await page.getByLabel("Select logical as a Code", { exact: true }).check();
    await button("Close Code manager").click();
    await tab("Windows").click();
    await page.getByRole("combobox", { name: "Window", exact: true }).selectOption("MovingStanzaWindow");
    await page.getByLabel("Use source order", { exact: true }).check();
    await button("Review source-order statement").click();
    await button("Accept statement").click();
    await page.getByRole("group", { name: "Backward context", exact: true }).getByLabel("Rows", { exact: true }).fill("3");
    const binary = await run("strict-binary-number-and-boolean");
    await page.getByLabel("Frequency", { exact: true }).check();
    assert.equal(await button("Run model").isDisabled(), true, "Boolean Code cannot silently coerce to frequency");
    await tab("Codes").click();
    await button("Exclude logical Code").click();
    await page.getByRole("toolbar", { name: "Code actions" }).getByRole("button", { name: "Manage Codes", exact: true }).click();
    assert.equal(await page.getByLabel("Select negative as a Code", { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel("Select nonfinite as a Code", { exact: true }).isDisabled(), true);
    await page.getByLabel("Select fraction as a Code", { exact: true }).check();
    await button("Close Code manager").click();
    const frequency = await run("strict-frequency-decimals");
    await tab("Windows").click();
    await page.getByLabel("Binary", { exact: true }).check();
    assert.equal(await button("Run model").isDisabled(), true, "fraction must not silently coerce to Binary");
    await page.getByLabel("Frequency", { exact: true }).check();
    assert.notEqual(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status"), "current", "ABA configuration edits cannot revive the earlier result");
    await run("strict-frequency-after-aba");
    return { sourceFileSha256: hash(readFileSync(path)), ordinaryImportAutorun: false, nonfiniteTypingBlocked: true, negativeAndTextRejected: true, binary: binary.response.result.binding, frequency: frequency.response.result.binding };
}
async function journeys() {
    await journey(1, "teaching sample and actual Worker", async () => { await mode("Data"); await button("Load teaching sample").click(); await current(); const audit = await lastRun(); json("teaching-sample-worker.json", audit); assert.equal(audit.response.kind, "result-v3"); return { executionPlanSha256: audit.response.executionPlanSha256 }; });
    await mode("Model");
    await tab("Units").click();
    await dump("initial-model");
    await shot("desktop-initial");
    await journey(2, "active tab top geometry", async () => layout("desktop Units"));
    await journey(3, "Horizons and Windows removed controls and height", async () => {
        const evidence = {};
        for (const name of ["Horizons", "Windows"]) {
            await tab(name).click();
            assert.equal(await page.getByRole("tabpanel").getByText(/Transmodal/).count(), 0);
            evidence[name] = await layout(name);
        }
        return evidence;
    });
    await journey(4, "Units toolbar and exact Group visibility restore", async () => {
        await tab("Units").click();
        const toolbar = page.getByRole("toolbar", { name: "Group actions" });
        assert.equal(await toolbar.getByRole("button").count(), 4);
        await button("Open all group display options").click();
        const groups = page.locator('details.ena-group-display-group');
        assert.equal(await groups.count(), 2);
        await page.waitForFunction(() => [...document.querySelectorAll('details.ena-group-display-group')].every(node => node.open));
        assert.deepEqual(await groups.evaluateAll(nodes => nodes.map(node => node.open)), [true, true]);
        const switches = page.getByRole("switch");
        assert.ok(await switches.count() > 1);
        await switches.first().uncheck();
        const before = await switches.evaluateAll(nodes => nodes.map(node => ({ label: node.getAttribute("aria-label"), checked: node.checked })));
        const identity = (await lastRun()).response.result.binding;
        await button("Hide all group layers").click();
        assert.equal(await button("Restore all group layers").getAttribute("aria-pressed"), "true");
        await button("Restore all group layers").click();
        assert.deepEqual(await switches.evaluateAll(nodes => nodes.map(node => ({ label: node.getAttribute("aria-label"), checked: node.checked }))), before);
        assert.deepEqual((await lastRun()).response.result.binding, identity);
        await current();
        await button("Collapse all group option panels").click();
        await page.waitForFunction(() => [...document.querySelectorAll('details.ena-group-display-group')].every(node => !node.open));
        assert.equal(await page.locator('details.ena-group-display-group[open]').count(), 0);
        await button("Open all group display options").click();
        await shot("desktop-group-options");
        return { preferences: before, scientificResultSha256: identity.scientificResultSha256 };
    });
    await journey(5, "Means Group exclusion preserves rotation without fallback", async () => {
        await tab("Windows").click();
        await page.getByRole("combobox", { name: /^Projection & Rotation/ }).selectOption("means");
        await tab("Units").click();
        await page.getByRole("combobox", { name: "Negative level", exact: true }).selectOption({ index: 1 });
        await page.getByRole("combobox", { name: "Positive level", exact: true }).selectOption({ index: 2 });
        const fit = await run("means-before-exclude");
        assert.equal(fit.response.result.configuration.analysis.rotation.type, "means");
        await button("Exclude group configuration").click();
        assert.equal(await page.getByRole("combobox", { name: "Create Sample / Group", exact: true }).inputValue(), "");
        assert.equal(await button("Run model").isDisabled(), true);
        await tab("Windows").click();
        assert.equal(await page.getByRole("combobox", { name: /^Projection & Rotation/ }).inputValue(), "means");
        await tab("Units").click();
        await shot("desktop-means-group-required");
        await button("Undo Group exclusion").click();
        const restored = await run("means-group-undo");
        assert.deepEqual(restored.response.result.configuration, fit.response.result.configuration);
        return { configuration: restored.response.result.configuration, noFallback: true };
    });
    let emptyConfiguration;
    await journey(6, "Codes Hide restore and Exclude all selected Codes", async () => {
        await tab("Codes").click();
        const result = (await lastRun()).response.result.binding;
        await button("Hide goal node").click();
        await button("Hide all code nodes").click();
        await button("Restore all code nodes").click();
        assert.equal(await button("Show goal node").count(), 1);
        assert.deepEqual((await lastRun()).response.result.binding, result);
        await current();
        const draft = await download("Export draft", "before-exclude-codes.json");
        emptyConfiguration = draft.value;
        await button("Exclude all selected Codes").click();
        await page.getByRole("heading", { name: "No codes selected", exact: true }).waitFor();
        assert.equal(await button("Run model").isDisabled(), true);
        await shot("desktop-empty-codes");
        return { beforeDraftSha256: draft.sha256, displayOnlyIdentity: result.scientificResultSha256 };
    });
    await journey(7, "empty Codes survives rerender then exact Undo", async () => {
        await tab("Windows").click();
        await tab("Codes").click();
        await button("About Codes settings").click();
        await page.getByRole("dialog").press("Escape");
        const empty = await download("Export draft", "empty-codes-rerender.json");
        assert.deepEqual(empty.value.draft.codes, []);
        await page.getByRole("heading", { name: "No codes selected", exact: true }).waitFor();
        await button("Undo Code exclusion").click();
        const undo = await download("Export draft", "undo-codes.json");
        assert.deepEqual(undo.value, emptyConfiguration);
        return { emptyDraftSha256: empty.sha256, exactUndo: true };
    });
    await journey(8, "Endpoint Moving and Conversation with both weightings", async () => {
        await mode("Data");
        await button("Load trajectory sample").click();
        await current();
        await mode("Model");
        await tab("Windows").click();
        await page.getByRole("combobox", { name: "Model", exact: true }).selectOption("EndPoint");
        await page.getByRole("combobox", { name: /^Projection & Rotation/ }).selectOption("svd");
        const runs = [];
        for (const window of ["MovingStanzaWindow", "Conversation"])
            for (const weighting of ["Binary", "Frequency"]) {
                await page.getByRole("combobox", { name: "Window", exact: true }).selectOption(window);
                await page.getByLabel(weighting, { exact: true }).check();
                if (window === "MovingStanzaWindow") {
                    await page.getByLabel("Use source order", { exact: true }).check();
                    await button("Review source-order statement").click();
                    await button("Accept statement").click();
                }
                const audit = await run(`endpoint-${window}-${weighting}`);
                assert.equal(audit.response.result.configuration.window.type, window);
                assert.equal(audit.response.result.configuration.weighting.type, weighting.toLowerCase());
                runs.push(audit.response.result.binding);
            }
        return runs;
    });
    await journey(9, "all six Standard model-window combinations and explicit orders", async () => {
        await mode("Data");
        await button("Load trajectory sample").click();
        await current();
        await mode("Model");
        await tab("Windows").click();
        const evidence = [];
        for (const model of ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"])
            for (const window of ["Conversation", "MovingStanzaWindow"]) {
                await page.getByRole("combobox", { name: "Model", exact: true }).selectOption(model);
                await page.getByRole("combobox", { name: "Window", exact: true }).selectOption(window);
                if (window === "MovingStanzaWindow") {
                    await page.getByLabel("Use source order", { exact: true }).check();
                    await button("Review source-order statement").click();
                    await page.getByRole("dialog", { name: "Review source-order statement" }).getByRole("button", { name: "Accept statement" }).click();
                }
                const audit = await run(`six-${model}-${window}`);
                assert.equal(audit.response.result.configuration.analysis.model.type, model);
                assert.equal(audit.response.result.configuration.window.type, window);
                if (window === "MovingStanzaWindow")
                    assert.equal(audit.response.result.configuration.window.rowOrder.kind, "source-order-confirmed");
                if (model !== "EndPoint")
                    assert.ok(audit.request.plan.horizonOrdering);
                evidence.push({ model, window, binding: audit.response.result.binding, horizonOrdering: audit.request.plan.horizonOrdering, rowOrdering: audit.request.plan.rowOrdering });
            }
        return evidence;
    });
    await journey(10, "finite and Infinity, invalid raw input cannot adopt stale result", async () => {
        const back = page.getByRole("group", { name: "Backward context", exact: true });
        const forward = page.getByRole("group", { name: "Forward context", exact: true });
        await back.getByLabel("Rows", { exact: true }).fill("1");
        await forward.getByLabel("Rows", { exact: true }).fill("0");
        const finite = await run("finite-1-0");
        for (const [target, invalid] of [[back, "0"], [back, "1.5"], [forward, "-1"], [forward, "1e2"]]) {
            const rows = target.getByLabel("Rows", { exact: true });
            const prior = await rows.inputValue();
            const count = await page.evaluate(() => window.__task37WorkerAudit.length);
            await rows.fill(invalid);
            assert.equal(await rows.getAttribute("aria-invalid"), "true");
            assert.equal(await button("Run model").isDisabled(), true);
            assert.notEqual(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status"), "current");
            await tab("Codes").click();
            await tab("Windows").click();
            assert.equal(await page.getByRole("group", { name: await target.getAttribute("id") === await back.getAttribute("id") ? "Backward context" : "Forward context", exact: true }).count(), 1);
            assert.equal(await page.evaluate(() => window.__task37WorkerAudit.length), count);
            await rows.fill(prior);
        }
        await back.getByLabel("Entire Horizon", { exact: true }).check();
        const backward = await run("backward-infinity");
        assert.equal(backward.response.result.configuration.window.backward.kind, "infinity");
        await forward.getByLabel("Entire Horizon", { exact: true }).check();
        const both = await run("both-infinity");
        assert.equal(both.response.result.configuration.window.forward.kind, "infinity");
        await back.getByLabel("Finite", { exact: true }).check();
        const ahead = await run("forward-infinity");
        assert.equal(ahead.response.result.configuration.window.backward.value, 1);
        await forward.getByLabel("Finite", { exact: true }).check();
        return { finite: finite.response.result.binding, backward: backward.response.result.binding, both: both.response.result.binding, forward: ahead.response.result.binding };
    });
    await journey(11, "Means Endpoint actual Reference export/import and three fixed-source targets", async () => {
        await page.getByRole("combobox", { name: "Model", exact: true }).selectOption("EndPoint");
        await page.getByRole("combobox", { name: "Window", exact: true }).selectOption("Conversation");
        await page.getByRole("combobox", { name: /^Projection & Rotation/ }).selectOption("means");
        await tab("Units").click();
        await page.getByRole("combobox", { name: "Negative level", exact: true }).selectOption({ index: 1 });
        await page.getByRole("combobox", { name: "Positive level", exact: true }).selectOption({ index: 2 });
        const source = await run("reference-means-source");
        assert.equal(source.response.result.executionProvenance.projection.type, "means");
        const file = await download("Export Reference", "means-reference.json");
        assert.equal(file.value.schemaVersion, 2);
        assert.equal(file.value.fit.method, "means");
        await mode("Data");
        await page.getByLabel("Import configuration, result or Reference", { exact: true }).setInputFiles(file.path);
        await page.getByRole("dialog", { name: "Review imported artifact" }).waitFor();
        await button("Add Reference").click();
        await mode("Model");
        await tab("Windows").click();
        assert.equal(await page.getByRole("combobox", { name: /^Projection & Rotation/ }).inputValue(), "means");
        await page.getByRole("combobox", { name: /^Projection & Rotation/ }).selectOption("reference");
        await page.getByRole("combobox", { name: "Reference source", exact: true }).selectOption({ index: 1 });
        const targets = [];
        for (const model of ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"]) {
            await page.getByRole("combobox", { name: "Model", exact: true }).selectOption(model);
            const audit = await run(`reference-target-${model}`);
            assert.equal(audit.response.result.binding.referenceContentSha256, file.value.contentSha256);
            assert.equal(audit.response.result.binding.referenceId, file.value.referenceId);
            assert.deepEqual(audit.response.result.set.rotation.rotationMatrix, source.response.result.set.rotation.rotationMatrix);
            assert.deepEqual(audit.response.result.set.rotation.nodes, source.response.result.set.rotation.nodes);
            targets.push({ model, binding: audit.response.result.binding });
        }
        await shot("desktop-reference");
        return { source: source.response.result.binding, referenceFileSha256: file.sha256, contentSha256: file.value.contentSha256, targets };
    });
    await journey(12, "two Standard ONA roundtrips preserve independent drafts, order and mask", async () => {
        const standard = await download("Export draft", "standard-before-family.json");
        await tab("Codes").click();
        await page.getByRole("radio", { name: /^Ordered Network Analysis/ }).check();
        await tab("Units").click();
        await button("Add or remove Unit fields fields").click();
        const unitRegion = page.getByRole("region", { name: "Unit fields", exact: true });
        await unitRegion.getByLabel("Group", { exact: true }).check();
        await unitRegion.getByLabel("Speaker", { exact: true }).check();
        await button("Add or remove Unit fields fields").click();
        await page.getByRole("combobox", { name: "Create Sample / Group", exact: true }).selectOption("Group");
        await tab("Horizons").click();
        await button("Add or remove Horizon identity fields").click();
        await page.getByRole("region", { name: "Horizon identity", exact: true }).getByLabel("Period", { exact: true }).check();
        await button("Add or remove Horizon identity fields").click();
        await tab("Codes").click();
        await page.getByRole("toolbar", { name: "Code actions" }).getByRole("button", { name: "Manage Codes", exact: true }).click();
        for (const code of ["TE", "EX", "IN", "RE", "SP", "TP"])
            await page.getByLabel(`Select ${code} as a Code`, { exact: true }).check();
        await button("Close Code manager").click();
        await button("Initialize explicit all-enabled mask").click();
        await page.getByLabel("TE → EX", { exact: true }).uncheck();
        await button("Reorder TE").focus();
        await page.keyboard.press("Alt+ArrowDown");
        const displayOrder = await page.getByRole("button", { name: /^Reorder / }).evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
        await tab("Windows").click();
        await page.getByRole("group", { name: "Backward context", exact: true }).getByLabel("Rows", { exact: true }).fill("3");
        await page.getByLabel("Use source order", { exact: true }).check();
        await button("Review source-order statement").click();
        await button("Accept statement").click();
        const onaRun = await run("ona-independent");
        assert.equal(onaRun.response.result.configuration.analysisFamily, "ona");
        const ona = await download("Export draft", "ona-before-family.json");
        for (let round = 1; round <= 2; round++) {
            await tab("Codes").click();
            await page.getByRole("radio", { name: /^Standard ENA/ }).check();
            assert.deepEqual((await download("Export draft", `standard-round-${round}.json`)).value, standard.value);
            await page.getByRole("radio", { name: /^Ordered Network Analysis/ }).check();
            assert.deepEqual((await download("Export draft", `ona-round-${round}.json`)).value, ona.value);
            assert.equal(await page.getByLabel("TE → EX", { exact: true }).isChecked(), false);
            assert.deepEqual(await page.getByRole("button", { name: /^Reorder / }).evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label"))), displayOrder);
        }
        await page.getByRole("radio", { name: /^Standard ENA/ }).check();
        return { standardSha256: standard.sha256, onaSha256: ona.sha256, onaRun: onaRun.response.result.binding, displayOrder, roundtrips: 2 };
    });
    await journey(13, "keyboard tabs, Help dialog, Undo and live announcements", async () => {
        await tab("Units").focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(await tab("Horizons").getAttribute("aria-selected"), "true");
        await page.keyboard.press("End");
        assert.equal(await tab("Codes").getAttribute("aria-selected"), "true");
        const help = button("About Codes settings");
        await help.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
        await page.keyboard.press("Escape");
        await page.waitForFunction(node => node === document.activeElement, await help.elementHandle());
        assert.equal(await help.evaluate(node => node === document.activeElement), true);
        await button("Exclude all selected Codes").focus();
        await page.keyboard.press("Enter");
        assert.ok((await page.getByRole("status", { name: "Model status" }).innerText()).includes("incomplete"));
        await button("Undo Code exclusion").focus();
        await page.keyboard.press("Enter");
        await run("keyboard-undo");
        assert.ok((await page.getByRole("status", { name: "Model status" }).innerText()).includes("Current result"));
        await shot("desktop-keyboard-focus");
        return { focusReturned: true, keyboardUndo: true, modelStatus: await page.getByRole("status", { name: "Model status" }).innerText() };
    });
    receipt.strictDomainBoundaries = await strictSourceBoundaries();
    await journey(14, "narrow and CSS 200 percent zoom reflow", async () => {
        const evidence = [];
        for (const setup of [{ name: "narrow", width: 390, height: 844, zoom: 1 }, { name: "css-zoom-200", width: 1440, height: 960, zoom: 2 }]) {
            await page.setViewportSize({ width: setup.width, height: setup.height });
            await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, setup.zoom);
            for (const name of ["Units", "Horizons", "Windows", "Codes"]) {
                await tab(name).click();
                evidence.push({ mode: setup.name, tab: name, ...await layout(`${setup.name} ${name}`) });
                const controls = page.getByRole("tabpanel").locator("button:visible:enabled, input:not([type=radio]):visible:enabled, input[type=radio]:checked:visible:enabled, select:visible:enabled");
                for (let index = 0; index < await controls.count(); index++) evidence.push(await assertReachable(controls.nth(index), `${setup.name} ${name} control ${index}`));
                evidence.push(await assertReachable(button("Run model"), `${setup.name} Run model`));
                if (name === "Units") {
                    await button("Hide all group layers").click(); evidence.push(await assertReachable(button("Restore all group layers"), `${setup.name} Restore Groups`)); await button("Restore all group layers").click();
                }
                if (name === "Codes") {
                    await button("Hide all code nodes").click(); evidence.push(await assertReachable(button("Restore all code nodes"), `${setup.name} Restore Codes`)); await button("Restore all code nodes").click();
                    await button("Exclude all selected Codes").click(); evidence.push(await assertReachable(button("Undo Code exclusion"), `${setup.name} Undo Codes`)); await page.keyboard.press("Enter"); await run(`${setup.name}-undo-reachability`);
                }
            }
            for (const control of ["Download Model", "Export SVG", "Export PNG"]) evidence.push(await assertReachable(button(control), `${setup.name} ${control}`));
            const plotActions = page.locator(".ena-official-plot-actions button:visible:enabled");
            for (let index = 0; index < await plotActions.count(); index++) evidence.push(await assertReachable(plotActions.nth(index), `${setup.name} plot action ${index}`));
            const plotLayout = await page.evaluate(() => ({
                panels: [...document.querySelectorAll(".ena-set-side-plots > figure")].map(node => ({ width: node.getBoundingClientRect().width, label: node.querySelector("h3")?.textContent })),
                captions: [...document.querySelectorAll(".ena-set-plot-heading p, .ena-persistent-plot-tools label")].filter(node => node.getBoundingClientRect().width > 0).map(node => { const r = node.getBoundingClientRect(); return { text: node.textContent, left: r.left, right: r.right, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }; })
            }));
            receipt.plotLayoutChecks ??= []; receipt.plotLayoutChecks.push({ mode: setup.name, ...plotLayout });
            for (const panel of plotLayout.panels) assert.ok(panel.width >= 250, `${setup.name}: unreadably narrow plot panel ${JSON.stringify(panel)}`);
            for (const caption of plotLayout.captions) { assert.ok(caption.left >= -2 && caption.right <= setup.width + 2, `${setup.name}: clipped plot caption/label ${JSON.stringify(caption)}`); if (caption.clientWidth > 0) assert.ok(caption.scrollWidth <= caption.clientWidth + 2, `${setup.name}: plot text is horizontally clipped ${JSON.stringify(caption)}`); }
            const toolControls = page.locator(".ena-persistent-plot-tools button:visible:enabled, .ena-persistent-plot-tools input:visible:enabled, .ena-persistent-plot-tools select:visible:enabled");
            for (let index = 0; index < await toolControls.count(); index++) evidence.push(await assertReachable(toolControls.nth(index), `${setup.name} Plot Tools control ${index}`));
            await shot(`${setup.name}-plot-controls`, false);
            await shot(setup.name);
            await tab("Windows").click();
            await shot(`${setup.name}-windows`);
            await assertReachable(page.getByRole("combobox", { name: /^Projection & Rotation/ }), `${setup.name} visible lower Windows fields`);
            await shot(`${setup.name}-windows-controls`, false);
        }
        await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
        await page.setViewportSize({ width: 1440, height: 960 });
        return evidence;
    });
    await page.waitForLoadState("networkidle");
    await journey(15, "zero unexpected errors and document overflow", async () => { for (const event of failedRequests) {
        if (expectedLoginPrefetchCancellation(event, loginTiming))
            receipt.expectedNavigationCancellations.push({ ...event, reason: "public-shell RSC prefetch started before login and cancelled within login navigation" });
        else
            receipt.errors.push(event);
    } receipt.failedRequests = failedRequests; assert.deepEqual(receipt.errors, []); return { errors: receipt.errors, finalLayout: await layout("final desktop") }; });
}
try {
    mkdirSync(directory, { recursive: true });
    const sourceBefore = sourceManifest();
    json("source-before.json", sourceBefore);
    receipt.sourceContentSha256 = hash(JSON.stringify(sourceBefore));
    receipt.build = await child("npm", ["run", "build"], env, "build.log");
    assert.deepEqual(sourceManifest(), sourceBefore, "source content changed during build");
    const buildManifest = treeManifest(join(root, ".next")).filter(x => !x.path.startsWith("cache/") && !x.path.startsWith("diagnostics/") && x.path !== "trace" && x.path !== "trace-build");
    json("build-files.json", buildManifest);
    receipt.build.contentSha256 = hash(JSON.stringify(buildManifest));
    receipt.build.buildId = readFileSync(join(root, ".next/BUILD_ID"), "utf8").trim();
    const databaseUrl = await startDatabase();
    const serverPort = await port();
    const baseURL = `http://127.0.0.1:${serverPort}`;
    server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(serverPort)], { cwd: root, env: { ...env, OPEN_ENA_AUTH_DATABASE_URL: databaseUrl, OPEN_ENA_PUBLIC_ORIGIN: baseURL, OPEN_ENA_ALLOWED_ORIGINS: baseURL }, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", value => { serverLog += redact(value); });
    server.stderr.on("data", value => { serverLog += redact(value); });
    receipt.server = { pid: server.pid, parentPid: process.pid, baseURL, ownership: "new direct child; next start from just-built assigned checkout", stopped: false };
    json("receipt.json", receipt);
    for (let i = 0; i < 360; i++) {
        try {
            if ((await fetch(baseURL + "/en/open-ena", { redirect: "manual" })).status < 500)
                break;
        }
        catch { }
        if (i === 359)
            throw Error("owned server readiness timeout");
        await new Promise(done => setTimeout(done, 250));
    }
    const { chromium } = await import("playwright");
    const metadata = JSON.parse(readFileSync(join(dirname(require.resolve("playwright-core/package.json")), "browsers.json"), "utf8")).browsers.find(x => x.name === "chromium");
    assert.equal(metadata.revision, "1234");
    assert.equal(require("playwright/package.json").version, "1.62.1");
    browser = await chromium.launch({ headless: true });
    receipt.browser = { version: browser.version(), revision: metadata.revision, packageVersion: "1.62.1", executablePath: chromium.executablePath() };
    assert.equal(browser.version(), metadata.browserVersion);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    await context.addInitScript(() => {
        window.__task37WorkerAudit = [];
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            constructor(...args) { super(...args); this.addEventListener("message", event => { if (["result-v3", "error"].includes(event.data?.kind))
                window.__task37WorkerAudit.push({ direction: "response", message: structuredClone(event.data) }); }); }
            postMessage(message, ...args) { if (message?.kind === "run-open-ena-plan-v3")
                window.__task37WorkerAudit.push({ direction: "request", message: structuredClone(message) }); return super.postMessage(message, ...args); }
        };
    });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("response", response => {
        const path = new URL(response.url()).pathname;
        if (loginTiming.finishedAt && path.startsWith("/_next/static/") && response.ok())
            assetReads.push((async () => {
                const bytes = await response.body();
                const localPath = path.replace("/_next/", "");
                const digest = hash(bytes);
                assert.equal(digest, hash(readFileSync(join(root, ".next", localPath))), `served asset differs from built checkout: ${path}`);
                receipt.servedAssets.push({ path, sha256: digest, bytes: bytes.length });
            })().catch(error => { receipt.errors.push({ kind: "asset-custody", text: redact(error.message), path }); }));
    });
    page.on("console", message => { if (message.type() === "error")
        receipt.errors.push({ kind: "console", text: redact(message.text()) }); });
    page.on("pageerror", error => receipt.errors.push({ kind: "pageerror", text: redact(error.message) }));
    page.on("request", request => requestStarts.set(request, Date.now()));
    page.on("requestfailed", request => {
        const event = { kind: "requestfailed", text: redact(request.failure()?.errorText ?? "unknown"), path: new URL(request.url()).pathname, method: request.method(), resourceType: request.resourceType(), navigation: request.isNavigationRequest(), rsc: request.headers()["rsc"] ?? null, prefetch: request.headers()["next-router-prefetch"] ?? null, startedAt: requestStarts.get(request), failedAt: Date.now() };
        failedRequests.push(event);
    });
    page.on("dialog", dialog => dialog.accept());
    await page.goto(baseURL + "/en/open-ena", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.getByRole("textbox", { name: "Account name" }).fill(credentials.username);
    await page.getByRole("textbox", { name: "Password" }).fill(credentials.password);
    loginTiming.startedAt = Date.now();
    await button("Sign in").click();
    await page.getByRole("navigation", { name: "Analysis modes" }).waitFor({ timeout: 30000 });
    await page.waitForLoadState("networkidle");
    loginTiming.finishedAt = Date.now();
    receipt.loginTiming = loginTiming;
    await page.setViewportSize({ width: 1440, height: 960 });
    await journeys();
    await Promise.all(assetReads);
    assert.ok(receipt.servedAssets.some(asset => asset.path.endsWith(".js")));
    assert.deepEqual(receipt.errors, []);
    assert.deepEqual(sourceManifest(), sourceBefore);
    json("source-after.json", sourceManifest());
    assert.deepEqual(treeManifest(join(root, ".next")).filter(x => !x.path.startsWith("cache/") && !x.path.startsWith("diagnostics/") && x.path !== "trace" && x.path !== "trace-build"), buildManifest, "built content changed during served journey");
    receipt.status = "pass";
    writeFileSync(join(directory, "server.log"), serverLog);
}
catch (error) {
    receipt.status = "fail";
    receipt.failure = redact(error.stack);
    if (page && await page.locator('[data-testid="open-ena-workspace-v3"]').count()) {
        await dump("failure-ui").catch(() => { });
        await shot("failure").catch(() => { });
        json("failure-worker.json", await page.evaluate(() => window.__task37WorkerAudit).catch(() => []));
    }
    console.error(redact(error.stack));
    process.exitCode = 1;
}
finally {
    await browser?.close();
    await stopServer();
    if (databaseRunning)
        execFileSync("pg_ctl", ["--pgdata", database, "--wait", "--mode", "fast", "stop"], { stdio: "ignore" });
    if (databaseRunning) {
        assert.equal(database, join(directory, "postgres"));
        rmSync(database, { recursive: true });
        databaseRunning = false;
    }
    writeFileSync(join(directory, "server.log"), redact(serverLog));
    receipt.finishedAt = new Date().toISOString();
    json("receipt.json", receipt);
    console.log(`Models v3 ${receipt.status}: ${join(directory, "receipt.json")}`);
}
