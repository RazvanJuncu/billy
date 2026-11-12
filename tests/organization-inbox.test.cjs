const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const edge=read("supabase/functions/billy-vision/index.ts");
const inbox=read("site/organization-inbox.js");
const idx=read("site/documents-index.js");
const hub=read("site/documents-hub.js");

function analyzer(){
  const start=edge.indexOf("const ORGANIZATION_FLEET=");
  const end=edge.indexOf("async function organizationInbox(",start);
  assert.ok(start>0&&end>start);
  const context={Set,String,Array,Math};
  vm.runInNewContext(edge.slice(start,end)+"\nthis.missing=organizationMissing;",context);
  return context.missing;
}
const root=(profile="handling_invoice",doc={},overrides={})=>({
  id:"record",state:"approved",parent_document_id:null,
  reviewed_data:{supplier_name:"My Handler",airport_icao:"LRBS",...doc},
  review_metadata:{classification:{profile,expense_category:"handling"},
    organization_overrides:overrides}
});
test("Missing aircraft puts approved handling document in attention; linked child is not a separate task",()=>{
  const missing=analyzer();
  const parent=root();
  assert.deepEqual(Array.from(missing(parent)),["aircraft"]);
  assert.deepEqual(Array.from(missing({...parent,parent_document_id:"parent-id"})),[]);
  assert.deepEqual(Array.from(missing({...parent,state:"extracted"})),[]);
  assert.deepEqual(Array.from(missing({...parent,review_metadata:{
    ...parent.review_metadata,organization_overrides:{aircraft:"YR-DDN"}
  }})),[]);
});
test("Known provider and airport are not requested again; missing category or provider is independently tracked",()=>{
  const missing=analyzer();
  const noVendor=root("handling_invoice",{supplier_name:"",airport_icao:"LRBS",aircraft_registration:"YR-DDN"});
  assert.deepEqual(Array.from(missing(noVendor)),["vendor"]);
  const undefinedService=root("generic_invoice",{supplier_name:"A Vendor"},{});
  undefinedService.review_metadata.classification.expense_category="unknown";
  assert.deepEqual(Array.from(missing(undefinedService)),["service"]);
  const receipt=root("payment_slip",{supplier_name:"Terminal"});
  receipt.review_metadata.classification.expense_category="unknown";
  assert.deepEqual(Array.from(missing(receipt)),[]);
});
test("Organization endpoint is authenticated, owner-scoped for writes, and never reprocesses AI",()=>{
  assert.match(edge,/async function organizationInbox\(principal\)/);
  assert.match(edge,/state:"eq.approved",parent_document_id:"is.null"/);
  assert.match(edge,/async function organizeDocument\(req,principal\)/);
  assert.match(edge,/created_by:"eq\."\+principal\.user_id,id:"eq\."\+data\.record_id/);
  assert.match(edge,/keys\.some\(key=>!missing\.includes\(key\)\)/);
  assert.match(edge,/only the owner can organize an approved parent document/i);
  assert.match(edge,/review_metadata:metadata/);
  assert.match(edge,/source:"operator_verified"/);
  assert.ok(edge.includes('if(suffix==="/api/vision/organization")'));
  const logic=edge.slice(edge.indexOf("async function organizeDocument("),edge.indexOf("async function listRecords("));
  assert.doesNotMatch(logic,/classifyDocument|generateContent|\/api\/vision\/extract/);
  assert.doesNotMatch(logic,/reviewed_data:checked|extracted_data:checked/);
});
test("Needs attention is conditional and is absent when count zero",()=>{
  assert.match(hub,/const count=window\.BillyOrganizer\?\.count\?\.\(\)\|\|0/);
  assert.match(hub,/if\(state\.mode==="Home"&&count>0&&attentionSlot\)\{/);
  assert.match(hub,/attentionSlot\.hidden=!attentionSlot\.childElementCount/);
  assert.match(hub,/headingRow\.append\(heading,attentionSlot\)/);
  assert.match(hub,/attentionSlot\.append\(attention\)/);
  assert.doesNotMatch(hub,/root\.append\(attention\)/);
  assert.match(read("site/simple.css"),/\.billy-hub-heading-row\{display:flex/);
  assert.match(read("site/simple.css"),/\.billy-hub-attention-slot\[hidden\]\{display:none!important\}/);
  assert.match(hub,/Needs attention/);
  assert.match(hub,/navigate\("Attention"\)/);
  assert.match(idx,/\["Home","Attention",\.\.\.modes\]/);
  assert.match(inbox,/const count=\(\)=>entries\.length/);
  assert.match(inbox,/entries=Array\.isArray\(result\.records\)/);
  assert.match(inbox,/selectedId=entries\[0\]\?\.id\|\|null/);
  assert.match(inbox,/window\.BillyDocumentsIndex\?\.navigate\?\.\("Home"\)/);
});
test("Split inbox shows private original and only missing form controls",()=>{
  assert.match(inbox,/window\.BillyOriginals\.retrieve\(id\)/);
  assert.match(inbox,/mime==="application\/pdf"\?"iframe":"img"/);
  assert.match(inbox,/for\(const key of record\.missing_fields\)form\.append\(control\(record,key\)\)/);
  assert.match(inbox,/const known=\["aircraft","airport","service","vendor"\]\.filter/);
  assert.match(inbox,/const owns=record\.created_by===window\.BillyAccounts\?\.userId\?\.\(\)/);
  assert.match(inbox,/Save & organize/);
  assert.match(inbox,/api\+"\/api\/vision\/organization"/);
  assert.match(idx,/m\.organization_overrides\|\|\{\}/);
  assert.match(idx,/refreshOrganization/);
  assert.match(read("site/simple.js"),/window\.BillyOrganizer\?\.load\?\.\(\)/);
  assert.match(read("site/index.html"),/organization-inbox\.js\?v=1\.1\.0/);
});
