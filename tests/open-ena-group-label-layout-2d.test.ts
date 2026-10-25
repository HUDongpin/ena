import assert from "node:assert/strict";
import test from "node:test";
import { buildExecutionIdentityDictionaryV3 } from "../lib/open-ena/model-v3/identity";

test("2D group names come from typed values, preserving genuine text and distinct identities", async () => {
  const api = await import("../lib/open-ena/group-label-layout-2d").catch(() => null);
  assert.equal(typeof api?.groupDisplayNames2D, "function");
  const groups = [
    { displayLabel: "Group Group=Experimental", fields: [{ column: "Group", value: { type: "string" as const, value: "Experimental" } }] },
    { displayLabel: "Group Group=Control", fields: [{ column: "Group", value: { type: "string" as const, value: "Control" } }] },
    { displayLabel: "Group Group=Group Group=real value", fields: [{ column: "Group", value: { type: "string" as const, value: "Group Group=real value" } }] },
    { displayLabel: "numeric one", fields: [{ column: "Group", value: { type: "number" as const, value: 1 } }] },
    { displayLabel: "string one", fields: [{ column: "Group", value: { type: "string" as const, value: "1" } }] },
  ];
  const before = JSON.stringify(groups), labels = api!.groupDisplayNames2D(groups);
  assert.equal(labels[groups[0].displayLabel], "Experimental");
  assert.equal(labels[groups[1].displayLabel], "Control");
  assert.equal(labels[groups[2].displayLabel], "Group Group=real value");
  assert.notEqual(labels["numeric one"], labels["string one"]);
  assert.equal(JSON.stringify(groups), before);
  const dictionary = await buildExecutionIdentityDictionaryV3([1, "1", "1 (number)", " Group Group=1 [Group:number(1)] "].map((value, i) => ({unit: i, horizon: 1, Group: value})), ["unit"], ["horizon"], "Group");
  const adversarial = api!.groupDisplayNames2D(dictionary.groups);
  assert.equal(new Set(Object.values(adversarial)).size, dictionary.groups.length);
});

test("2D labels avoid coincident means, CI envelopes, nodes, other labels, and viewport edges", async () => {
  const api = await import("../lib/open-ena/group-label-layout-2d").catch(() => null);
  assert.equal(typeof api?.placeGroupLabels2D, "function");
  const overlap = (a: {x:number;y:number;width:number;height:number}, b: typeof a) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
  const obstacles = [{x:200,y:180,width:100,height:60}, {x:280,y:170,width:70,height:90}, {x:160,y:160,width:65,height:20}, {x:350,y:210,width:20,height:20}];
  const groups = [
    { id:"primary", anchor:{x:250,y:210}, width:100, height:16, extent:obstacles[0] },
    { id:"secondary", anchor:{x:285,y:210}, width:65, height:16, extent:obstacles[1] },
  ];
  const bounds={x:10,y:10,width:500,height:400};
  const before=JSON.stringify({groups,obstacles,bounds});
  const placed=api!.placeGroupLabels2D(groups,obstacles,bounds);
  for(const entry of placed){
    assert.ok(!obstacles.some(o=>overlap(entry,o)));
    assert.ok(entry.x>=bounds.x && entry.y>=bounds.y && entry.x+entry.width<=bounds.x+bounds.width && entry.y+entry.height<=bounds.y+bounds.height);
  }
  assert.ok(!overlap(placed[0],placed[1]));
  assert.deepEqual(api!.placeGroupLabels2D(groups,obstacles,bounds),placed);
  assert.equal(JSON.stringify({groups,obstacles,bounds}),before);
  const vertical = {x:459,y:20,width:2,height:680};
  const axes = [vertical,{x:100,y:359,width:720,height:2}];
  const nearOrigin = api!.placeGroupLabels2D([{id:"primary",anchor:{x:460,y:360},width:100,height:14,extent:{x:450,y:350,width:20,height:20}}],
    [...axes,{x:450,y:350,width:20,height:20}],{x:12,y:24,width:896,height:675});
  assert.ok(!axes.some(axis=>overlap(nearOrigin[0],axis)), "labels must not cover either visible axis");
});
