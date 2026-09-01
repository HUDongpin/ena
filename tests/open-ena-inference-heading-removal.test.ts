import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "components/open-ena/OpenEnaInferencePanel.tsx"),
  "utf8",
);

test("research-design controls omit the screenshot-selected visible heading and fieldset legend", () => {
  assert.doesNotMatch(source, /<h3[^>]*>\{copy\.designLegend\}<\/h3>/);
  assert.doesNotMatch(source, /<legend>\{copy\.designLegend\}<\/legend>/);
  assert.doesNotMatch(source, /<fieldset[^>]*data-ena-inference-design/);
  assert.match(
    source,
    /<div[^>]*className="ena-inference-designs"[^>]*role="radiogroup"[^>]*aria-label=\{copy\.designLegend\}[^>]*data-ena-inference-design="true"/,
  );
  assert.match(source, /name="open-ena-inference-design"/);
  assert.match(source, /DESIGN_ORDER\.map/);
});
