import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import OpenEnaPlot from "../components/open-ena/OpenEnaPlot";
import {getOpenEnaCopy} from "../lib/open-ena-i18n";
import { literalGroupFixture } from "./helpers/open-ena-literal-group-fixture";

// Expected SVG encodings are fixed data, independently checked against native
// Plotly's actual rendered legend in review-plot-legend-browser.mts.
for (const [raw, svg] of [
  ["<b>G</b>", "&lt;b&gt;G&lt;/b&gt;"],
  ["A<br>B", "A&lt;br&gt;B"],
  ["A&amp;B", "A&amp;amp;B"],
  ['Plain 中文 &literal group', 'Plain 中文 &amp;literal group'],
  ['<\u200bb>Q</\u200bb> "R" \'S\'', '&lt;\u200bb&gt;Q&lt;/\u200bb&gt; &quot;R&quot; &#39;S&#39;'],
]) {
  test(`native Standard and ONA legends preserve source Group identity: ${raw}`, async () => {
    const {standardSpec,meanSpec,onaSpec,standard,ona,props}=await literalGroupFixture(raw);
    const twoDimensional=renderToStaticMarkup(createElement(OpenEnaPlot,{...props,view:"2d",copy:getOpenEnaCopy("en")}));
    assert.ok(twoDimensional.replaceAll("&#x27;","&#39;").includes(`Group group=${svg} mean`),"2D React mean label preserves the same literal Group characters");
    const unit=standardSpec.data.find(row=>row.showlegend)!;
    const mean=meanSpec.data.find(row=>row.showlegend)!;
    const ordered=onaSpec.data.find(row=>row.showlegend)!;
    assert.equal(unit.name,`Group group=${svg} units · circle`);
    assert.equal(mean.name,`Group group=${svg} mean · square`);
    assert.equal(ordered.name,`1. Group group=${svg} units · solid`);
    for(const trace of [unit,mean,ordered])assert.equal(trace.meta.groupName,`Group group=${raw}`);
    assert.equal(unit.legendgroup,mean.legendgroup);
    assert.equal(ordered.legendgroup,"open-ena-ordered-group-0");
    assert.ok(JSON.stringify(standard).includes(raw.replaceAll('"','\\"')));
    assert.ok(JSON.stringify(ona).includes(raw.replaceAll('"','\\"')));
  });
}
