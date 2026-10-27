import assert from "node:assert/strict";
import test from "node:test";
import { literalLabelCases,literalLabelFixture,literalOnaFixture,visibleGlLabelForTest } from "./helpers/open-ena-literal-label-fixture";
import { compileOpenEna3dPlotSpec } from "../lib/open-ena/plot3d";
import { compileOpenEnaOrdered3dPlotSpec } from "../lib/open-ena/ordered-plot3d";
import { openEna3dCodePositionByIdentity } from "../components/open-ena/OpenEnaInteractive3DPlot";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { exportCurrentAnalysisV3,buildAnalysisBundle } from "../lib/open-ena/export";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

test("CSV source labels stay literal in trajectory annotations and lookup text while identity, coordinates and exports stay unchanged",async()=>{
  for(const label of literalLabelCases){
    const {bound,plan,props}=await literalLabelFixture(label);
    const before=JSON.stringify(props); const exported=await exportCurrentAnalysisV3(bound,plan);
    const spec=compileOpenEna3dPlotSpec(props);
    const labels=spec.data.find(trace=>trace.meta.role==="code-label")!;
    const code=labels.ids!.find(id=>props.codeLabelByRenderedCode[id]===label)!;
    const index=labels.ids!.indexOf(code);
    assert.equal(labels.visible,false,"native trajectory Code text is rendered by the annotation, not the retained lookup trace");
    const displayedCode=spec.trajectoryLabelAnnotations!.find(item=>item.code===code)!;
    assert.equal(displayedCode.text,label);
    const codeAnnotation=spec.layout.scene.annotations![displayedCode.annotationIndex];
    assert.equal(codeAnnotation.name,displayedCode.id);
    assert.equal(codeAnnotation.text.split("\u200b").length,label.split("\u200b").length,"SVG annotation text must not acquire GL-only separators");
    const centroid=props.result.trajectoryPresentation.centroids[0];
    const displayedHorizon=spec.trajectoryLabelAnnotations!.find(item=>item.id===`centroid:${centroid.key}`)!;
    assert.equal(displayedHorizon.text,centroid.horizonShortLabel,"visible time labels retain the exact raw Horizon value");
    assert.ok(displayedHorizon.description.includes(centroid.horizon),"full Horizon identity remains available in details and hover");
    assert.ok(displayedHorizon.description.includes(`n = ${centroid.n}`));
    assert.equal(visibleGlLabelForTest(labels.text![index],label),label);
    assert.doesNotMatch(labels.text![index],/<\/?(?:b|i|sup|sub|br)>/u);
    assert.equal(labels.hovertemplate,"%{customdata}<extra></extra>");
    assert.equal(labels.customdata![index]!.split("\u200b").length,label.split("\u200b").length,"SVG hover must retain source separators without newly inserted GL guards");
    assert.equal(props.codeLabelByRenderedCode[code],label);
    const rawNode=spec.data.find(trace=>trace.meta.role==="code-node")!;
    assert.equal(rawNode.text![rawNode.ids!.indexOf(code)],label,"non-rendered node lookup text remains raw");
    assert.ok(openEna3dCodePositionByIdentity(spec,code,"code-label"));
    const offset=new Map([[props.xDimension,123]]);
    const moved=compileOpenEna3dPlotSpec({...props,nodeLayout:new Map([[code,offset]])});
    assert.equal(openEna3dCodePositionByIdentity(moved,code,"code-label")!.x,123);
    assert.deepEqual(moved.layout.scene.annotations,spec.layout.scene.annotations,"manual label preferences do not alter scientific annotation anchors or literal text");
    assert.equal(JSON.stringify(props),before);
    assert.deepEqual((await exportCurrentAnalysisV3(bound,plan)).bytes,exported.bytes);
    assert.equal(new TextDecoder().decode(exported.bytes).includes("\u200b"),label.includes("\u200b"));
  }
});

test("legacy result CSV/JSON export contracts retain raw labels after native GL compilation",async()=>{
  const label="<b>Legacy</b>";const {dataset}=await literalLabelFixture(label);
  const config={...SAMPLE_CONFIG,unitColumns:["unit"],conversationColumns:["horizon"],groupColumn:"group",codes:[label,"B","C"],window:"Conversation" as const,weightBy:"sum" as const,model:"EndPoint" as const};
  const result=analyzeDataset(dataset,config);
  const snapshot=()=>{const bundle=buildAnalysisBundle(dataset,config,result);bundle.manifest.generatedAt="fixed-export-clock";return JSON.stringify(bundle);};
  const before=snapshot();
  const [xDimension,yDimension,zDimension]=result.dimensions;
  const spec=compileOpenEna3dPlotSpec({result,groupColumn:"group",xDimension,yDimension,zDimension,camera:"xy",showPoints:true,showNetworks:true,showLabels:true,showUnitLabels:true,showVariance:true,showTrajectories:false,edgeScale:1,edgeThreshold:0,pointScale:1,plotZoom:1,flipX:false,flipY:false});
  const trace=spec.data.find(row=>row.meta.role==="code-label")!;
  assert.equal(visibleGlLabelForTest(trace.text![trace.ids!.indexOf(label)],label),label);
  assert.doesNotMatch(trace.text![trace.ids!.indexOf(label)],/<b>/u);
  assert.equal(snapshot(),before);
});

test("native ONA wrapper keeps direction and exported source identities outside GL text encoding",async()=>{
  const label="A<br>B";const {bound,plan,props}=await literalOnaFixture(label);
  const exported=await exportCurrentAnalysisV3(bound,plan);
  const spec=compileOpenEnaOrdered3dPlotSpec(props);
  const labels=spec.data.find(row=>row.meta.role==="code-label")!;const index=labels.ids!.findIndex(id=>props.codeLabelByRenderedCode[id]===label);
  assert.equal(visibleGlLabelForTest(labels.text![index],label),label);assert.doesNotMatch(labels.text![index],/<br>/u);
  assert.deepEqual((await exportCurrentAnalysisV3(bound,plan)).bytes,exported.bytes);
  assert.equal(new TextDecoder().decode(exported.bytes).includes("\u200b"),false);
});
