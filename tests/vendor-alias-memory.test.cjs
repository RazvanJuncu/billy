const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const edge=read("supabase/functions/billy-vision/index.ts");
const inbox=read("site/organization-inbox.js");
const archive=read("site/documents-index.js");
const sql=read("supabase/migrations/202611121900_vendor_alias_memory.sql");

function functions(){
  const first=edge.indexOf("const ORGANIZATION_FLEET=");
  const last=edge.indexOf("async function organizationInbox(",first);
  assert.ok(first>0&&last>first);
  const scope={};
  vm.runInNewContext(edge.slice(first,last)+
    "\nthis.key=vendorKey;this.missing=organizationMissing;"+
    "this.resolve=withResolvedVendor;",scope);
  return scope;
}
function record(raw){
  return {id:"fake-id",state:"approved",parent_document_id:null,
    reviewed_data:{aircraft_registration:"YR-WNT",airport_icao:"LROP",supplier_name:raw},
    review_metadata:{classification:{profile:"handling_invoice",expense_category:"handling"}}};
}
test("Unknown nonempty OCR vendor is unresolved until a verified alias exists",()=>{
  const f=functions(),r=record("AEROPORTUL INTER BUC");
  const empty={byKey:new Map()};
  assert.deepEqual(Array.from(f.missing(r,empty)),["vendor"]);
  const canonical={id:"vendor-1",display_name:"AEROPORTUL INTERNATIONAL HENRI COANDA"};
  const known={byKey:new Map([[f.key(" AEROPORTUL   inter buc "),canonical]])};
  assert.equal(f.key("aeroportul inter buc"),f.key("AEROPORTUL INTER BUC"));
  assert.deepEqual(Array.from(f.missing(r,known)),[]);
  const mapped=f.resolve(r,known);
  assert.equal(mapped.review_metadata.organization_overrides.vendor,canonical.display_name);
  assert.equal(mapped.review_metadata.organization_overrides.vendor_id,"vendor-1");
  assert.equal(mapped.reviewed_data.supplier_name,"AEROPORTUL INTER BUC");
  assert.equal(r.review_metadata.organization_overrides,undefined,
    "virtual archive resolution must not alter source JSON");
});
test("No fuzzy guessing: different OCR aliases remain unassigned",()=>{
  const f=functions(),r=record("AEROPORT INTER BUC");
  const dictionary={byKey:new Map([[f.key("AEROPORTUL INTER BUC"),{
    id:"vendor-1",display_name:"AEROPORTUL INTERNATIONAL HENRI COANDA"}]])};
  assert.deepEqual(Array.from(f.missing(r,dictionary)),["vendor"]);
  assert.equal(f.resolve(r,dictionary),r);
});
test("Vendor memory is tenant-scoped, enforced by unique aliases and one atomic transaction",()=>{
  assert.match(sql,/unique \(organization_id, name_key\)/);
  assert.match(sql,/primary key \(organization_id, alias_key\)/);
  assert.match(sql,/foreign key \(organization_id, vendor_id\)/);
  assert.match(sql,/alter table public\.billy_vendor_aliases enable row level security/);
  assert.match(sql,/security invoker set search_path = ''/);
  assert.match(sql,/revoke all on function public\.billy_organize_with_vendor/);
  assert.match(sql,/grant execute on function public\.billy_organize_with_vendor\([\s\S]*?to service_role/);
  assert.match(sql,/for update/);
  assert.match(sql,/Alias already belongs to a different vendor/);
  assert.match(sql,/source_alias is distinct from v_read/);
  assert.match(sql,/update public\.document_records[\s\S]*?review_metadata=v_metadata/);
  assert.match(edge,/database\(principal,"POST","rpc\/billy_organize_with_vendor"/);
  assert.match(edge,/organization_id:"eq\."\+principal\.organization_id/);
});
test("Needs attention offers existing and new canonical vendor without re-running extraction",()=>{
  assert.match(inbox,/Read from document:/);
  assert.match(inbox,/\+ Create new vendor/);
  assert.match(inbox,/data\.vendor_choice|vendor_choice:vendorChoice/);
  assert.match(inbox,/vendorChoice=\{new_name:canonical\}/);
  assert.match(inbox,/vendorChoice=\{vendor_id:value\}/);
  assert.match(inbox,/window\.BillyDocumentsIndex\?\.rememberVendorAlias\?\.\(/);
  assert.match(archive,/organization_missing_fields\?\.includes\("vendor"\)/);
  assert.match(archive,/function rememberVendorAlias\(/);
  const code=edge.slice(edge.indexOf("async function organizeDocument("),
    edge.indexOf("async function listRecords("));
  assert.doesNotMatch(code,/generateContent|classifyDocument|\/api\/vision\/extract/);
});
