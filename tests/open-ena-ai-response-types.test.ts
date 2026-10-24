import assert from "node:assert/strict";
import test from "node:test";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";
import { generateLunaInterpretation, LunaClientError } from "../lib/server/deepseek-client";

const request=interpretationRequest("zh-hans");
const valid={observedPatterns:[{statement:"合成观察。",evidenceRefs:["axis-1"]}],contextualQuestions:["需要什么背景？"],limitations:["仅限汇总证据。"]};
async function generate(interpretation: unknown) {
  return generateLunaInterpretation(request,{environment:{OPEN_ENA_AI_ENABLED:'true',DEEPSEEK_API_KEY:'synthetic-key'},fetch:async(input)=>String(input).endsWith('/user/balance')?Response.json({is_available:true}):Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(interpretation)}]}]})});
}
test("newly generated AI prose must be strings; objects, numbers and booleans cannot be coerced into research text",async()=>{
  for(const invalid of [{private:"synthetic"},42,true,["nested"],null]) {
    const rejected=(error:unknown)=>error instanceof LunaClientError&&error.code==='upstream-malformed'&&error.providerDispatched;
    await assert.rejects(generate({...valid,observedPatterns:[{statement:invalid,evidenceRefs:["axis-1"]}]}),rejected);
    await assert.rejects(generate({...valid,contextualQuestions:[invalid]}),rejected);
    await assert.rejects(generate({...valid,limitations:[invalid]}),rejected);
  }
});
test("valid Chinese prose retains its exact content under the generation type checks",async()=>{
  assert.deepEqual((await generate(valid)).response.interpretation,valid);
});
