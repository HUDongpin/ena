import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
const workspace = readFileSync(join(process.cwd(), "components", "open-ena", "OpenEnaWorkspace.tsx"), "utf8");

function blocksStartingAt(source: string, header: string) {
  const blocks: { start: number; body: string }[] = [];
  let from = 0;
  while (from < source.length) {
    const start = source.indexOf(header, from);
    if (start === -1) break;
    const open = source.indexOf("{", start + header.length);
    assert.notEqual(open, -1, `${header} must open a block`);
    let depth = 0;
    let end = -1;
    for (let index = open; index < source.length; index += 1) {
      const char = source[index];
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }
    assert.notEqual(end, -1, `${header} block must close`);
    blocks.push({ start, body: source.slice(open + 1, end) });
    from = end + 1;
  }
  return blocks;
}

function ruleBody(block: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return block.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, "u"))?.[1] ?? "";
}

const TAB_CELL = ".ena-model-tab-cell";
const TAB_BUTTON = `${TAB_CELL} > [role="tab"]`;
const HELP_BUTTON = `${TAB_CELL} .ena-model-help-button`;
const ACTIVE_TAB = `.ena-restored-workbench ${TAB_CELL}[data-active="true"] > [role="tab"]`;

test("container-narrow layout flows the model help button beside the tab", () => {
  const containerBlocks = blocksStartingAt(css, "@container open-ena-viewport (max-width: 900px)");
  const narrow = containerBlocks.find((block) => ruleBody(block.body, HELP_BUTTON).includes("position:"));
  assert.ok(narrow, "tab-cell collision rules must live in @container open-ena-viewport (max-width: 900px)");

  const cell = ruleBody(narrow.body, TAB_CELL);
  const tab = ruleBody(narrow.body, TAB_BUTTON);
  const help = ruleBody(narrow.body, HELP_BUTTON);
  const active = ruleBody(narrow.body, ACTIVE_TAB);
  assert.match(cell, /display:\s*grid;/u);
  assert.match(cell, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/u);
  assert.match(cell, /align-items:\s*stretch;/u);
  assert.match(tab, /width:\s*auto;/u);
  assert.match(tab, /min-width:\s*0;/u);
  assert.match(tab, /height:\s*auto;/u);
  assert.match(help, /position:\s*static;/u);
  assert.match(help, /min-width:\s*32px;/u);
  assert.match(help, /min-height:\s*32px;/u);
  assert.match(help, /align-self:\s*center;/u);
  assert.match(active, /padding-inline-end:\s*3px;/u);

  const absoluteHelp = css.search(/\.ena-model-tab-cell\s+\.ena-model-help-button\s*\{[^}]*position:\s*absolute/u);
  assert.notEqual(absoluteHelp, -1, "the wide layout still pins the help button to the active tab");
  assert.ok(
    narrow.start > absoluteHelp,
    "the container override must follow the absolute help-button rule so CSS zoom can unpin it",
  );

  const viewportNarrow = blocksStartingAt(css, "@media (max-width: 900px)")
    .map((block) => ruleBody(block.body, HELP_BUTTON))
    .find((body) => /position:\s*static;/u.test(body));
  assert.ok(viewportNarrow, "the viewport-narrow media query must keep the same help-button flow");
});

function parameterList(source: string, functionName: string) {
  const marker = `function ${functionName}(`;
  const markerAt = source.indexOf(marker);
  assert.notEqual(markerAt, -1, `${functionName} must stay a function declaration`);
  const open = markerAt + marker.length - 1;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  assert.fail(`${functionName} parameter list must close`);
}

test("workspace runtime-disabled plugin ids default to one frozen list", () => {
  const parameters = parameterList(workspace, "OpenEnaWorkspace");
  assert.match(parameters, /runtimeDisabledPluginIds\s*=\s*NO_RUNTIME_DISABLED_PLUGIN_IDS\b/u);
  assert.doesNotMatch(parameters, /runtimeDisabledPluginIds\s*=\s*\[/u);
  const declaration = workspace.indexOf("const NO_RUNTIME_DISABLED_PLUGIN_IDS: readonly string[] = Object.freeze([]);");
  const functionStart = workspace.indexOf("export default function OpenEnaWorkspace");
  assert.notEqual(declaration, -1, "the empty plugin-id list must be a module-level frozen constant");
  assert.ok(declaration < functionStart, "the frozen plugin-id list must be declared outside the component");
});
