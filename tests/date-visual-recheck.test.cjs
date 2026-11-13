const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const edge=fs.readFileSync(path.join(__dirname,"../supabase/functions/billy-vision/index.ts"),"utf8");
const begin=edge.indexOf("const DATE_VISUAL_SCHEMA=");
const end=edge.indexOf("async function extract(req,principal,authMs=0){",begin);
const canonical=edge.slice(edge.indexOf("function canonicalDate("),edge.indexOf("function canonicalRegistration(",edge.indexOf("function canonicalDate(")));
assert.ok(begin>0&&end>begin);
const context={Math,Number,Set,Map,JSON,Date,AbortSignal,
  DATE_FIELDS:new Set(["issue_date","delivery_date","service_date"]),
  MODEL:"test",CATEGORIES:[],providerKey:()=> "test",b64:()=>"base64",
  fetch:async()=>{throw Error("not mocked")}};
vm.runInNewContext(canonical+"\n"+edge.slice(begin,end)+
  "\nthis.request=suspiciousDateFields;this.apply=applyDateVisualReadings;this.run=visuallyRecheckDates;",context);
const evidence=(text,clarity="slight_uncertainty")=>[{
  field_path:"issue_date",page:1,box_2d:[210,250,420,650],
  transcription:text,visual_clarity:clarity,alternate_readings:["09.11.2026"],
  visual_reason:"Last digit slightly distorted"}];
const result=(text,clarity="clear")=>[{
  field_path:"issue_date",printed_date:text,clarity,visual_reason:"Four year digits legible"}];
test("Mismatching region transcription or uncertainty triggers independent date reread",()=>{
  assert.equal(context.request({issue_date:"09.11.2020"},evidence("09.11.2026")).length,1);
  assert.equal(context.request({issue_date:"09.11.2026"},evidence("09.11.2026","clear")).length,0);
  assert.equal(context.request({issue_date:"09.11.2020"},evidence("09.11.2026","clear")).length,1);
});
test("Clear printed 09.11.2026 corrects wrong 2020 and removes only resolved date uncertainty",()=>{
  const doc={issue_date:"09.11.2020"};
  const regions=evidence("09.11.2026");
  const changes=context.apply(doc,regions,context.request(doc,regions),result("09.11.2026"));
  assert.equal(doc.issue_date,"09.11.2026");
  assert.equal(regions[0].visual_clarity,"clear");
  assert.equal(regions[0].transcription,"09.11.2026");
  assert.equal(changes[0].normalized,"2026-11-09");
  assert.equal(changes[0].changed,true);
});
test("Unclear, invalid or unmatched readings never overwrite a date",()=>{
  for(const [date,clarity] of [["09.11.2026","unclear"],["09.11.20?6","clear"],["09.11.2025","not_visible"],["not a date","clear"]]){
    const doc={issue_date:"09.11.2020"},regions=evidence("09.11.2026");
    assert.equal(context.apply(doc,regions,context.request(doc,regions),result(date,clarity)).length,0);
    assert.equal(doc.issue_date,"09.11.2020");
    assert.equal(regions[0].visual_clarity,"slight_uncertainty");
  }
});
test("Independent model reread is bounded, image-grounded, and no unrelated fields are altered",async()=>{
  const source={issue_date:"09.11.2020",grand_total:"367.20"};
  const regions=evidence("09.11.2026");
  let calls=0;
  context.fetch=async(_url,opts)=>{
    calls++;
    const data=JSON.parse(opts.body);
    assert.match(data.contents[0].parts[0].text,/Ignore the proposed value/);
    assert.match(data.contents[0].parts[0].text,/2020 versus 2026/);
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{
      text:JSON.stringify({readings:result("09.11.2026")})
    }]}}]})};
  };
  const changes=await context.run(new Uint8Array([1]),"image/jpeg",source,regions);
  assert.equal(calls,1);assert.equal(changes.length,1);
  assert.equal(source.issue_date,"09.11.2026");assert.equal(source.grand_total,"367.20");
});
test("Extraction persists reconciled dates and auditable corrections, not guessed current year",()=>{
  const i=edge.indexOf("const [dateVisualCorrections,externalChecks]=await Promise.all([");
  const j=edge.indexOf("const warnings=validate(fields,type,regions,profile);",i);
  assert.ok(i>0&&j>i);
  assert.match(edge.slice(i,j),/visuallyRecheckDates\(bytes,mime,fields,regions,timing\)/);
  assert.match(edge,/date_visual_corrections:dateVisualCorrections/);
  assert.doesNotMatch(edge.slice(begin,end),/new Date\(\)/);
});
