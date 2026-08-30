import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workflowPath = join(process.cwd(), ".github", "workflows", "open-ena-ci.yml");
const workflow = readFileSync(workflowPath, "utf8");

test("Browser CI provisions an isolated PostgreSQL database and applies Open ENA migrations in order", () => {
  assert.match(workflow, /services:\s*[\s\S]*postgres:/u);
  assert.match(workflow, /POSTGRES_DB:\s*open_ena_ci/u);
  assert.match(workflow, /ports:\s*\n\s+- 5432:5432/u);
  assert.match(workflow, /--health-cmd\s+"pg_isready -U open_ena_ci -d open_ena_ci"/u);
  assert.match(
    workflow,
    /for migration in migrations\/001_open_ena_billable\.sql migrations\/002_open_ena_auth_security\.sql migrations\/003_open_ena_ai_consent\.sql/u,
  );
  assert.match(workflow, /psql .*OPEN_ENA_CI_DATABASE_URL.*ON_ERROR_STOP/u);
});

test("Browser CI exports the complete synthetic production configuration to every durable-auth smoke", () => {
  for (const name of [
    "OPEN_ENA_USERNAME",
    "OPEN_ENA_PASSWORD",
    "OPEN_ENA_SESSION_SECRET",
    "OPEN_ENA_ACCOUNT_ID",
    "OPEN_ENA_PUBLIC_ORIGIN",
    "OPEN_ENA_ALLOWED_ORIGINS",
    "OPEN_ENA_AUTH_DATABASE_URL",
    "OPEN_ENA_BILLABLE_DATABASE_URL",
    "OPEN_ENA_BILLING_POLICY_VERSION",
    "OPEN_ENA_BILLABLE_REQUESTS_PER_MINUTE",
    "OPEN_ENA_AI_DAILY_MICRO_USD",
    "OPEN_ENA_AI_MONTHLY_MICRO_USD",
    "OPEN_ENA_GLOBAL_MONTHLY_MICRO_USD",
    "OPEN_ENA_PROVIDER_MONTHLY_MICRO_USD",
    "OPEN_ENA_AI_MAX_RESERVATION_MICRO_USD",
    "OPEN_ENA_LONGITUDINAL_MAX_RESERVATION_MICRO_USD",
    "OPEN_ENA_BILLABLE_MAX_CONCURRENCY",
    "OPEN_ENA_SECURITY_ALERT_THRESHOLDS",
    "OPEN_ENA_AI_ENABLED",
  ]) {
    assert.match(workflow, new RegExp(`^\\s+${name}:`, "mu"), `${name} must be configured in Browser CI`);
  }
});

test("Browser CI runs every durable-auth production smoke and retains each evidence directory", () => {
  for (const [command, evidence] of [
    ["test:browser:open-ena-3d-controls", "open-ena-3d-controls-evidence"],
    ["test:browser:longitudinal-v3", "open-ena-longitudinal-v3-evidence"],
    ["node tests/open-ena-inference-browser-smoke.mjs", "open-ena-inference-evidence"],
    ["node tests/open-ena-a11y-perf-browser-smoke.mjs", "open-ena-a11y-perf-evidence"],
  ]) {
    assert.match(workflow, new RegExp(command.replaceAll(".", "\\."), "u"), `${command} must run in Browser CI`);
    assert.match(workflow, new RegExp(evidence, "u"), `${evidence} must be uploaded`);
  }
});

test("random-port production smokes bind the Origin allowlist to their owned loopback server", () => {
  for (const [file, marker] of [
    ["open-ena-3d-controls-browser-smoke.mjs", "OPEN_ENA_3D_CONTROLS_SMOKE_ARTIFACT_DIR"],
    ["open-ena-longitudinal-v3-browser-smoke.mjs", "OPEN_ENA_LONGITUDINAL_SMOKE_ARTIFACT_DIR"],
    ["open-ena-inference-browser-smoke.mjs", "OPEN_ENA_SMOKE_BROWSER"],
    ["open-ena-a11y-perf-browser-smoke.mjs", "OPEN_ENA_A11Y_PERF_SMOKE_ARTIFACT_DIR"],
  ]) {
    const source = readFileSync(join(process.cwd(), "tests", file), "utf8");
    assert.match(source, new RegExp(marker, "u"));
    if (file === "open-ena-inference-browser-smoke.mjs") {
      assert.match(source, /OPEN_ENA_SMOKE_ARTIFACT_DIR/u);
      assert.match(source, /chromium/u);
    }
    assert.match(source, /OPEN_ENA_PUBLIC_ORIGIN:\s*(?:baseUrl|loopbackOrigin)/u, `${file} must bind its dynamic loopback origin`);
    assert.match(source, /OPEN_ENA_ALLOWED_ORIGINS:\s*(?:baseUrl|loopbackOrigin)/u, `${file} must bind its dynamic origin allowlist`);
  }
});
