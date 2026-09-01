import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(path: string) {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("code colors default to black and accept only six-digit hexadecimal palette values", async () => {
  const plotStyle = await import("../lib/open-ena/plot-style") as typeof import("../lib/open-ena/plot-style") & {
    DEFAULT_CODE_COLOR?: string;
    codeColorFor?: (colors: Readonly<Record<string, string>>, code: string) => string;
    updateCodeColor?: (
      colors: Readonly<Record<string, string>>,
      code: string,
      color: string,
    ) => Record<string, string>;
  };

  assert.equal(plotStyle.DEFAULT_CODE_COLOR, "#000000");
  assert.equal(typeof plotStyle.codeColorFor, "function");
  assert.equal(typeof plotStyle.updateCodeColor, "function");
  if (!plotStyle.codeColorFor || !plotStyle.updateCodeColor) return;

  assert.equal(plotStyle.codeColorFor({}, "goal"), "#000000");
  assert.deepEqual(plotStyle.updateCodeColor({}, "goal", "#12AB34"), { goal: "#12ab34" });
  assert.equal(plotStyle.codeColorFor({ goal: "not-a-color" }, "goal"), "#000000");
});

test("the Codes panel places a native palette after every selected code without invalidating the model", () => {
  const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
  const styles = source("app/globals.css");

  assert.match(workspace, /const \[codeColors, setCodeColors\] = useState/);
  assert.match(
    workspace,
    /className="ena-code-option-row"[\s\S]*?type="checkbox"[\s\S]*?config\.codes\.includes\(header\)[\s\S]*?type="color"/,
  );
  assert.match(workspace, /aria-label=\{`\$\{copy\.model\.codeColor\}: \$\{header\}`\}/);
  assert.match(workspace, /value=\{codeColorFor\(codeColors, header\)\}/);
  assert.match(workspace, /onChange=\{\(event\) => setCodeColors\(\(current\) => updateCodeColor\(current, header, event\.target\.value\)\)\}/);
  assert.doesNotMatch(
    workspace,
    /type="color"[\s\S]{0,500}?updateConfig/,
    "code colors are presentation state and must not make the fitted model stale",
  );
  assert.match(styles, /\.ena-code-color-input\s*\{[\s\S]*?cursor:\s*pointer;[\s\S]*?\}/);
});

test("the code palette keeps a compact 20px swatch inside an easy 28px hit target", () => {
  const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
  const styles = source("app/globals.css");
  const genericCodeLabelRule = styles.indexOf(".ena-code-options label,");
  const compactControlRule = styles.indexOf(".ena-code-options .ena-code-color-control");

  assert.match(
    workspace,
    /className="ena-code-color-control"[\s\S]*?className="ena-code-color-input"[\s\S]*?type="color"/,
  );
  assert.ok(genericCodeLabelRule >= 0);
  assert.ok(
    compactControlRule > genericCodeLabelRule,
    "the compact hit-target rule must follow and override the generic 44px code-label rule",
  );
  assert.match(
    styles,
    /\.ena-code-options \.ena-code-color-control\s*\{[^}]*display:\s*grid;[^}]*width:\s*28px;[^}]*height:\s*28px;[^}]*min-height:\s*28px;[^}]*place-items:\s*center;[^}]*padding:\s*0;[^}]*\}/,
  );
  assert.match(
    styles,
    /\.ena-code-color-input\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px;[^}]*padding:\s*1px;[^}]*\}/,
  );
});

test("the selected code-color map is passed to every Open ENA network renderer and model bundle", () => {
  const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");

  for (const component of [
    "OpenEnaLongitudinalTrajectory",
    "OpenEnaGroupContrast",
    "OpenEnaPlot",
    "MiniNetwork",
  ]) {
    assert.match(
      workspace,
      new RegExp(`<${component}[\\s\\S]{0,900}?codeColors=\\{codeColors\\}`),
      `${component} should receive the live per-code presentation palette`,
    );
  }
  assert.match(workspace, /buildAnalysisBundle\([\s\S]*?codeColors/);
});
