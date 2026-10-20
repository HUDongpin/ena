import assert from "node:assert/strict";
import {bindingFixtureV3} from "./open-ena-model-v3-fixture";
import {runStandardPlanV3} from "../../lib/open-ena/analyze";
import {bindResultV3} from "../../lib/open-ena/model-v3/result-binding";
import {presentBoundResultV3} from "../../lib/open-ena/bound-presentation-v3";
import {buildOnaExecutionPlanV3,runOnaPlanV3} from "../../lib/open-ena/model-v3/ona-adapter";
import {bindOnaResultV3} from "../../lib/open-ena/model-v3/ona-result-binding";
import {decodeCanonicalOnaConfigV3} from "../../lib/open-ena/model-v3/schema";
import {OPEN_ENA_RUNTIME_POLICY_VERSION_V3,OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3} from "../../lib/open-ena/model-v3/types";
import {createDirectionalMask} from "../../lib/open-ena/network-config";
import {compileOpenEna3dPlotSpec} from "../../lib/open-ena/plot3d";
import {compileOpenEnaOrdered3dPlotSpec} from "../../lib/open-ena/ordered-plot3d";
import {exportCurrentAnalysisV3} from "../../lib/open-ena/model-artifact-exports-v3";

export async function literalGroupFixture(groupLabel:string) {
  let dataset:any;
  const fixture=await bindingFixtureV3(undefined,(_draft,data)=>{for(const row of data.rows)row.group=groupLabel;dataset=structuredClone(data);});
  const bound=await bindResultV3(fixture.plan,runStandardPlanV3(fixture.plan),{processedRows:fixture.plan.rows.length,maximumBufferedRows:0,numericCellsAllocated:120,peakBytesObservedOrBounded:10240,observationMethod:"exact-counters-and-conservative-byte-bound"},fixture.compiled.diagnostics);
  const standard=presentBoundResultV3(bound);const [xDimension,yDimension,zDimension]=standard.result.dimensions;
  const props={...standard,groupColumn:"Group",xDimension,yDimension,zDimension,camera:"xy" as const,showPoints:true,showNetworks:false,showLabels:false,showUnitLabels:false,showVariance:false,showTrajectories:false,edgeScale:1,edgeThreshold:0,pointScale:1,plotZoom:1,flipX:false,flipY:false};
  const before=await exportCurrentAnalysisV3(bound,fixture.plan);const rawBefore=JSON.stringify(standard);
  const standardSpec=compileOpenEna3dPlotSpec(props),meanSpec=compileOpenEna3dPlotSpec({...props,showPoints:false});
  const codes=["A","B","C"];
  const configuration=decodeCanonicalOnaConfigV3({schemaVersion:3,analysisFamily:"ona",contracts:{validationContractVersion:OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,runtimePolicyVersion:OPEN_ENA_RUNTIME_POLICY_VERSION_V3},units:{columns:["unit"],group:{type:"stable-metadata",column:"group"}},horizons:{columns:["horizon"]},codes:codes.map(column=>({column,displayLabel:column})),model:{type:"EndPoint"},weighting:{type:"frequency",engineMethod:"sum"},window:{type:"MovingStanzaWindow",backward:{kind:"finite",value:2},forward:0,rowOrder:{kind:"columns",keys:[{column:"time",direction:"ascending",comparator:{type:"number"}}]}},rotation:{type:"svd",centerAlignToOrigin:true},directionalMask:createDirectionalMask(codes)});
  dataset.rows=dataset.rows.map((row:any,index:number)=>({...row,time:index+1}));
  const plan=await buildOnaExecutionPlanV3(dataset,"d".repeat(64),configuration);
  const onaBound=await bindOnaResultV3(plan,runOnaPlanV3(plan),{processedRows:dataset.rows.length,maximumRetainedRowsAfterChunk:0,bufferedRowsPeakUpperBound:Math.min(dataset.rows.length,plan.header.resourceEstimate.estimatedRetainedWindowRows+1),numericCellsUpperBound:plan.operationalAdmission.totalNumericCells,peakBytesUpperBound:plan.operationalAdmission.totalPeakBytes,observationMethod:"dimension-bounds-and-chunk-boundary-stream-state"});
  const ona=presentBoundResultV3(onaBound);const onaBefore=await exportCurrentAnalysisV3(onaBound,plan);
  const onaSpec=compileOpenEnaOrdered3dPlotSpec({...props,...ona,xDimension:ona.result.dimensions[0],yDimension:ona.result.dimensions[1],zDimension:ona.result.dimensions[2],scope:{kind:"overall"}});
  assert.equal(JSON.stringify(standard),rawBefore);assert.deepEqual((await exportCurrentAnalysisV3(bound,fixture.plan)).bytes,before.bytes);assert.deepEqual((await exportCurrentAnalysisV3(onaBound,plan)).bytes,onaBefore.bytes);
  return {standard,ona,props,standardSpec,meanSpec,onaSpec,bound,standardPlan:fixture.plan,onaBound,onaPlan:plan};
}
