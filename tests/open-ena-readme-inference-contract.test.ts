import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("README documents the explicit four-path inference contract and its boundaries", () => {
  const contractStart = readme.indexOf("### Inferential comparison contract");
  const contractEnd = readme.indexOf("### Longitudinal plot and inference independence");

  assert.notEqual(contractStart, -1, "README must expose a dedicated inference contract");
  assert.ok(
    contractEnd > contractStart,
    "README must separate inferential comparison from the descriptive longitudinal plot",
  );

  const contract = readme.slice(contractStart, contractEnd);
  const longitudinalBoundary = readme.slice(contractEnd);

  assert.match(contract, /does not run an inferential test automatically/i);
  assert.match(contract, /confirm(?:s)? (?:the )?composite repeated-entity identity/i);
  assert.match(contract, /Run inferential comparison/);

  assert.match(contract, /Independent endpoint groups[^\n]*Mann[–-]Whitney U/i);
  assert.match(
    contract,
    /does not claim that the endpoint groups\s+were observed in the same period/i,
  );
  assert.match(contract, /Independent groups at one selected trajectory period[^\n]*Mann[–-]Whitney U/i);
  assert.match(contract, /Paired periods[^\n]*Wilcoxon signed-rank/i);
  assert.match(contract, /later[^\n]*earlier/i);
  assert.match(contract, /pairwise-complete/i);
  assert.match(contract, /Repeated periods[^\n]*Friedman[^\n]*all[^\n]*Wilcoxon signed-rank/i);
  assert.match(contract, /all-period-complete/i);

  assert.match(
    contract,
    /All Mann[–-]Whitney and Wilcoxon pairwise comparisons are fixed to two-sided tests/i,
  );
  assert.match(
    contract,
    /The non-directional Friedman omnibus uses its inclusive upper tail/i,
  );
  assert.match(contract, /auto exact-first/i);
  assert.match(contract, /Wilcox zero/i);
  assert.match(contract, /Holm/i);
  assert.match(contract, /raw p/i);
  assert.match(contract, /Holm-adjusted p/i);
  assert.match(
    contract,
    /Each estimable planned member retains raw p[\s\S]*Holm-adjusted p[\s\S]*primary p-value/i,
  );
  assert.match(
    contract,
    /Not-estimable planned members retain null\s+raw\/Holm p values[\s\S]*planned family size/i,
  );

  assert.match(longitudinalBoundary, /Available and Complete[^\n]*descriptive plot/i);
  assert.match(
    longitudinalBoundary,
    /axis flips, labels, zoom,\s+scaling, and display toggles do not change the inferential sample/i,
  );
  assert.match(longitudinalBoundary, /clustered observations[^\n]*out of scope/i);
  assert.match(longitudinalBoundary, /mixed-effects models[^\n]*out of scope/i);
  assert.match(longitudinalBoundary, /do(?:es)? not establish\s+causality/i);

  assert.doesNotMatch(readme, /No multiplicity correction is applied/i);
  assert.doesNotMatch(contract, /All four paths are fixed to two-sided tests/i);
  assert.doesNotMatch(contract, /Each planned family retains raw p/i);
  assert.doesNotMatch(
    readme,
    /paired, nested, repeated-measure, or clustered observations require a design-appropriate analysis/i,
  );
});
