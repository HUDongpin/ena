import { bindingFixtureV3 } from "./open-ena-model-v3-fixture";
import { parseCsv } from "../../lib/open-ena/csv";
import { prepareTypedCsvSourceV3 } from "../../lib/open-ena/source-preparation-v3";
import { runStandardPlanV3 } from "../../lib/open-ena/analyze";
import { bindResultV3 } from "../../lib/open-ena/model-v3/result-binding";
import { presentBoundResultV3 } from "../../lib/open-ena/bound-presentation-v3";
import { buildTrajectoryPresentationV3 } from "../../lib/open-ena/trajectory-presentation-v3";
import type { BoundStandardResultV3 } from "../../lib/open-ena/model-v3/types";
import { OPEN_ENA_RUNTIME_POLICY_VERSION_V3,OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3 } from "../../lib/open-ena/model-v3/types";
import { buildOnaExecutionPlanV3,runOnaPlanV3 } from "../../lib/open-ena/model-v3/ona-adapter";
import { bindOnaResultV3 } from "../../lib/open-ena/model-v3/ona-result-binding";
import { decodeCanonicalOnaConfigV3 } from "../../lib/open-ena/model-v3/schema";
import { createDirectionalMask } from "../../lib/open-ena/network-config";

export const literalLabelCases = ["<b>LITERAL</b>", "A<br>B", "A&amp;B", "<i>Italic</i>", "x<sup>2</sup>", "x<sub>2</sub>", "Plain 中文 &literal <angle> 'quote'", "Existing <\u200bb>text</\u200bb> + <b>new</b>"];

// Compare against the original, consuming all original characters first.
// Only an additional separator immediately after '<' may be ignored; never
// erase a source-provided U+200B or any other original character.
export function visibleGlLabelForTest(rendered:string,source:string) {
  let index=0;
  for(let cursor=0;cursor<rendered.length;cursor++) {
    if(rendered[cursor]===source[index]) { index++; continue; }
    if(rendered[cursor]==="\u200b" && rendered[cursor-1]==="<") continue;
    return null;
  }
  return index===source.length ? source : null;
}

/** Actual CSV → draft compiler → execution → bound Workspace presentation. */
export async function literalLabelFixture(label: string) {
  const cells = (values: unknown[]) => values.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",");
  const csv = [cells(["unit", "horizon", "time", "group", label, "B", "C"]),
    ...[0,1,2,3].flatMap(unit => [1,2,3,4].map(period => cells([
      `${label}-u${unit}`, `${label}-h${period}`, period, "G",
      1+(unit+period)%3, 1+(period+unit*2)%4, 1+(period*2+unit)%5,
    ])))].join("\n");
  const parsed = parseCsv(csv, { name:"literal-labels.csv", source:"upload" });
  const typed = await prepareTypedCsvSourceV3(csv,parsed,{unit:"text",horizon:"text",time:"number",group:"text",[label]:"number",B:"number",C:"number"},new Date("2026-10-12T05:00:00Z"));
  const fixture = await bindingFixtureV3(typed.datasetSha256, (draft,data) => {
    Object.assign(data,typed.dataset); draft.model="SeparateTrajectory"; draft.codes=[label,"B","C"];
  });
  const bound = await bindResultV3(fixture.plan, runStandardPlanV3(fixture.plan), {
    processedRows:fixture.plan.rows.length, maximumBufferedRows:0, numericCellsAllocated:120,
    peakBytesObservedOrBounded:10240, observationMethod:"exact-counters-and-conservative-byte-bound",
  }, fixture.compiled.diagnostics) as BoundStandardResultV3;
  const presentation = presentBoundResultV3(bound);
  const trajectoryPresentation = buildTrajectoryPresentationV3(bound,{showCentroidPaths:true,endpointsOnly:false,visibleHorizons:null});
  const [xDimension,yDimension,zDimension] = presentation.result.dimensions;
  return { dataset:typed.dataset, bound, plan:fixture.plan, props:{
    result:{...presentation.result,trajectoryPresentation}, groupColumn:"Group",
    codeSourceByRenderedCode:presentation.codeSourceByRenderedCode,
    codeLabelByRenderedCode:presentation.codeLabelByRenderedCode,
    xDimension,yDimension,zDimension,camera:"xy" as const,showPoints:true,showNetworks:false,
    showLabels:true,showUnitLabels:true,showVariance:false,showTrajectories:true,
    edgeScale:1,edgeThreshold:0,pointScale:1,plotZoom:1,flipX:false,flipY:false,
  } };
}

export async function literalOnaFixture(label:string) {
  const {dataset,props}=await literalLabelFixture(label);const codes=[label,"B","C"];
  const configuration=decodeCanonicalOnaConfigV3({schemaVersion:3,analysisFamily:"ona",contracts:{validationContractVersion:OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,runtimePolicyVersion:OPEN_ENA_RUNTIME_POLICY_VERSION_V3},
    units:{columns:["unit"],group:{type:"none"}},horizons:{columns:["horizon"]},codes:codes.map(column=>({column,displayLabel:column})),model:{type:"EndPoint"},weighting:{type:"frequency",engineMethod:"sum"},
    window:{type:"MovingStanzaWindow",backward:{kind:"finite",value:2},forward:0,rowOrder:{kind:"columns",keys:[{column:"time",direction:"ascending",comparator:{type:"number"}}]}},rotation:{type:"svd",centerAlignToOrigin:true},directionalMask:createDirectionalMask(codes)});
  const orderedDataset={...dataset,rows:dataset.rows.map((row,index)=>({...row,time:index+1}))};
  const plan=await buildOnaExecutionPlanV3(orderedDataset,"d".repeat(64),configuration);
  const bound=await bindOnaResultV3(plan,runOnaPlanV3(plan),{processedRows:dataset.rows.length,maximumRetainedRowsAfterChunk:0,bufferedRowsPeakUpperBound:Math.min(dataset.rows.length,plan.header.resourceEstimate.estimatedRetainedWindowRows+1),numericCellsUpperBound:plan.operationalAdmission.totalNumericCells,peakBytesUpperBound:plan.operationalAdmission.totalPeakBytes,observationMethod:"dimension-bounds-and-chunk-boundary-stream-state"});
  const projected=presentBoundResultV3(bound);const [xDimension,yDimension,zDimension]=projected.result.dimensions;
  return {bound,plan,props:{...props,...projected,xDimension,yDimension,zDimension,scope:{kind:"overall" as const}}};
}
