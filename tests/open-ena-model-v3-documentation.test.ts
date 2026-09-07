import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("durable docs state the exact Models v3 support boundary", () => {
  const readme = readFileSync("README.md", "utf8");
  const ledger = readFileSync(
    "docs/superpowers/specs/2026-09-02-open-ena-standard-model-parameters-acceptance-ledger.md",
    "utf8",
  );
  assert.match(readme, /all six Standard Model\/Window combinations/u);
  assert.match(readme, /SVD, Means, and Reference/u);
  assert.match(readme, /TMA.*not implemented/u);
  assert.match(ledger, /Pass\s*\|\s*Fail\s*\|\s*Skip/u);
  assert.match(ledger, /Local.*GitHub.*Deployment.*Production/su);
});

const ledgerPath =
  "docs/superpowers/specs/2026-09-02-open-ena-standard-model-parameters-acceptance-ledger.md";
const plans = [
  "01-contracts-compiler",
  "02-runtime-reference",
  "03-artifacts-consumers",
  "04-models-ui",
  "05-parity-acceptance",
];

test("the ledger accounts for every planned focused verification command", () => {
  const ledger = readFileSync(ledgerPath, "utf8");
  const commands = new Set<string>();
  for (const plan of plans) {
    const source = readFileSync(
      `docs/superpowers/plans/2026-09-02-open-ena-standard-model-parameters-${plan}.md`,
      "utf8",
    );
    for (const match of source.matchAll(/Run: `((?:node|npm) [^`]+)`/gu)) {
      commands.add(match[1]);
    }
    for (const block of source.matchAll(/```bash\n([\s\S]*?)```/gu)) {
      for (const line of block[1].split("\n")) {
        if (/^(?:node |npm |R_LIBS_USER=|shasum -a 256 )/u.test(line)) {
          commands.add(line);
        }
      }
    }
  }
  assert.ok(commands.size > 60, "all five plan command inventories must be read");
  for (const command of commands) {
    assert.ok(ledger.includes(`\`${command}\``), `Missing command: ${command}`);
  }
  const register = ledger.split("## Original focused-command register\n")[1]
    ?.split("\n## R baseline, current oracle and supplemental commands")[0];
  assert.ok(register, "the original command register must be present");
  const groups = [...register.matchAll(/### Plan (\d+)\n([\s\S]*?)(?=\n### Plan |$)/gu)];
  assert.deepEqual(groups.map((group) => Number(group[1])), [1, 2, 3, 4, 5]);
  for (const [, plan, contents] of groups) {
    const lines = contents.split("\n");
    const header = lines.indexOf("| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |");
    assert.ok(header >= 0, `Plan ${plan} needs its five-column table header`);
    assert.equal(lines[header + 1], "| --- | --- | --- | --- | --- |");
    const rows = lines.map((line, index) => ({ line, index }))
      .filter(({ line }) => /^\| Task\d+:/u.test(line));
    assert.ok(rows.length > 0, `Plan ${plan} must contain command rows`);
    rows.forEach(({ line, index }, ordinal) => {
      assert.equal(index, header + 2 + ordinal,
        `Plan ${plan} command rows must be contiguous with their table header`);
      assert.equal(line.split(/(?<!\\)\|/u).slice(1, -1).length, 5,
        `Plan ${plan} command rows must retain five columns`);
    });
  }
});

test("documentation preserves strict input, authority, and explicit final-gate statuses", () => {
  const readme = readFileSync("README.md", "utf8");
  const ledger = readFileSync(ledgerPath, "utf8");
  assert.match(readme, /consistently Boolean false\/true/u);
  assert.match(readme, /Mixed Boolean\/numeric[\s\S]*?within a Code is rejected/u);
  assert.match(readme, /Paired whole-path\s+comparison is not implemented/u);
  assert.match(readme, /explicit participant opt-in before\s+materialization/u);
  assert.match(readme, /imported artifacts never restore live\s+execution authority/u);
  assert.match(ledger, /local temporary artifacts, not committed or remotely durable evidence/u);
  assert.match(ledger, /Worker response-body capture race is \*\*not claimed fixed/u);
  for (const document of [readme, ledger]) {
    const prose = document.replace(/\s+/gu, " ");
    for (const member of ["analysis.json", "plot-specification.json", "trajectory-inference.csv", "manifest.json", "participants.json"]) {
      assert.ok(prose.includes(`\`${member}\``), `Missing trajectory member: ${member}`);
    }
    assert.match(prose, /three aggregate payload files[^.]*remain byte-identical/u);
    assert.match(prose, /`manifest\.json` changes its disclosure and file inventory/u);
    assert.match(prose, /ZIP bytes and hash also change/u);
    assert.match(prose, /Methods report is available separately[^;]*; it is not included in the trajectory ZIP/u);
  }
  for (const command of [
    "npm run test:app",
    "npm run typecheck:app",
    "npm run build:app",
    "npm run jena:verify",
    "npm run test:browser:open-ena-models-v3",
    "npm run verify",
  ]) {
    const row = ledger.split("\n").find((line) => line.startsWith(`| Task40: \`${command}\``));
    assert.ok(row, `Missing final gate: ${command}`);
    assert.match(row, /\| (?:Pending|Pass|Fail|Skip) \|/u, `Final gate needs an explicit terminal or pending status: ${command}`);
  }
  for (const boundary of ["Local files", "Local commit", "GitHub branch", "PR", "Deployment", "Production", "Authenticated production"]) {
    assert.ok(ledger.split("\n").some((line) => line.startsWith(`| ${boundary} |`)), boundary);
  }
});
