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
test("Approved new supplier creates one team-scoped vendor and reuses it later",async()=>{
  const scope={Map,Set};
  const first=edge.indexOf("const ORGANIZATION_FLEET=");
  const last=edge.indexOf("async function organizationInbox(",first);
  vm.runInNewContext(edge.slice(first,last)+
    "\\nthis.register=autoRegisterApprovedVendor;this.candidate=approvedVendorCandidate;",scope);
  const vendors=[];
  const principal={organization_id:"team-1",user_id:"operator-1"};
  let created=0;
  scope.database=async (_principal,method,table,query,body,prefer)=>{
    assert.equal(query.organization_id===undefined||query.organization_id==="eq.team-1",true);
    if(method==="GET"&&table==="billy_vendors"){
      if(query.name_key)return vendors.filter(v=>v.name_key===query.name_key.slice(3));
      return vendors;
    }
    if(method==="GET"&&table==="billy_vendor_aliases")return [];
    if(method==="POST"&&table==="billy_vendors"){
      assert.equal(prefer,"resolution=ignore-duplicates,return=representation");
      assert.equal(query.on_conflict,"organization_id,name_key");
      assert.equal(body.organization_id,"team-1");
      if(vendors.some(v=>v.name_key===body.name_key))return [];
      const item={...body,id:"vendor-"+(++created)};
      vendors.push(item);return [item];
    }
    throw Error("Unexpected database request");
  };
  const source={review_metadata:{classification:{profile:"handling_invoice"}},
    regions_data:[{field_path:"supplier_name",visual_clarity:"clear"}]};
  const approved={supplier_name:"R. A. Aeroportul International “George Enescu” Bacau"};
  assert.equal(await scope.register(principal,source,approved,[],new Set()),"created");
  assert.equal(await scope.register(principal,source,approved,[],new Set()),"matched");
  assert.equal(created,1);
  assert.equal(vendors[0].display_name,approved.supplier_name);
  assert.equal(vendors[0].organization_id,"team-1");
});
test("Auto vendor creation never trusts an ambiguous name or a payment evidence issuer",()=>{
  const f=functions();
  const first=edge.indexOf("const ORGANIZATION_FLEET=");
  const last=edge.indexOf("async function organizationInbox(",first);
  const scope={Map,Set};
  vm.runInNewContext(edge.slice(first,last)+"\\nthis.candidate=approvedVendorCandidate;",scope);
  const src=(profile,clarity)=>({review_metadata:{classification:{profile}},
    regions_data:[{field_path:"supplier_name",visual_clarity:clarity}]});
  const fields={supplier_name:"Aeroportul International Bacau"};
  assert.equal(scope.candidate(src("payment_slip","clear"),fields),null);
  assert.equal(scope.candidate(src("handling_invoice","ambiguous"),fields),null);
  assert.equal(scope.candidate(src("handling_invoice","clear"),{supplier_name:"Unknown"}),null);
  assert.equal(scope.candidate(src("handling_invoice","clear"),fields,["supplier_name"]),null);
  assert.equal(scope.candidate(src("handling_invoice","ambiguous"),fields,[],new Set(["supplier_name"])).field,"supplier_name");
  assert.match(edge,/vendor_registration:vendorRegistration/);
  assert.match(edge,/autoRegisterApprovedVendor\\(principal,source,checked,absentPaths,operatorVerified\\)/);
});
test("Cached PWA can still submit its original plain vendor field",()=>{
  assert.match(edge,/const legacyVendor=Object\.hasOwn\(data\.fields,"vendor"\)/);
  assert.match(edge,/new_name:legacyVendor/);
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
