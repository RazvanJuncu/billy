const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const backend=read("supabase/functions/billy-vision/index.ts");
const index=read("site/documents-index.js");
const preview=read("site/document-preview.js");
const css=read("site/simple.css");
const srcStart=backend.indexOf("// Read-only exact-source duplicate families.");
const srcEnd=backend.indexOf("async function listRecords(",srcStart);
assert.ok(srcStart>0&&srcEnd>srcStart,"Duplicate engine is present");
const principal={organization_id:"team-1",user_id:"operator-1"};
const sha="f".repeat(64);
function record(id,{
  source=sha,profile="handling_invoice",state="approved",vendor="Bacau Airport",
  amount="367,20",reference=null,date="2026-11-09",created="2026-11-12T12:00:00Z",
  archived=false,missing=[],parent=null,quantity=null
}={}){
  return {
    id,organization_id:"team-1",source_sha256:source,
    state,created_at:created,parent_document_id:parent,document_type:"invoice",
    review_metadata:{classification:{profile},
      normalization:{approved:{values:{grand_total:amount==null?null:367.2,
        currency:amount==null?null:"EUR",issue_date:date}}}},
    reviewed_data:{supplier_name:vendor,invoice_number:reference,
      grand_total:amount,issue_date:date,fuel_quantity:quantity},
    extracted_data:{supplier_name:vendor},
    original_storage_key:archived?"team-1/"+id+"/original.jpg":null,
    fakeMissing:missing
  };
}
function harness(){
  const sandbox={Map,Set,Number,String,Date,console};
  sandbox.organizationMissing=row=>row.fakeMissing||[];
  sandbox.database=async()=>{throw Error("Unexpected read");};
  vm.runInNewContext(backend.slice(srcStart,srcEnd)+
    "\nthis.identity=duplicateIdentity;this.groups=duplicateGroups;this.annotate=duplicateAnnotations;",sandbox);
  return sandbox;
}
test("Approved and all-set is chosen as the sole clean original, not the oldest incomplete copy",()=>{
  const x=harness();
  const older=record("older",{state:"extracted",created:"2026-11-11T08:00:00Z",
    missing:["airport","vendor"],amount:null,archived:false});
  const poor=record("approved-poor",{missing:["airport"],created:"2026-11-11T09:00:00Z"});
  const best=record("approved-best",{missing:[],archived:true,created:"2026-11-13T12:00:00Z"});
  const duplicate=record("approved-duplicate",{missing:[],archived:true,created:"2026-11-14T12:00:00Z"});
  const links=new Set(["approved-best"]);
  const children=new Map([["approved-best",1]]);
  const results=x.groups([older,poor,best,duplicate],children,links,row=>row.fakeMissing);
  assert.equal(results.size,4);
  assert.equal(results.get("approved-best").is_duplicate,false);
  assert.equal(results.get("approved-best").duplicate_of,null);
  assert.equal(results.get("approved-best").duplicate_family_size,4);
  assert.equal(results.get("older").duplicate_of,"approved-best");
  assert.equal(results.get("approved-poor").duplicate_of,"approved-best");
  assert.equal(results.get("approved-duplicate").duplicate_of,"approved-best");
  assert.equal(results.get("approved-duplicate").duplicate_original_state,"approved");
});
test("Four identical Bacau images with OCR amount punctuation variants have one original",()=>{
  const x=harness();
  const items=["367,20","367,20€","367.20","367,20 EUR"].map((amount,i)=>
    record("r-"+i,{amount,created:"2026-11-1"+(1+i)+"T12:00:00Z"}));
  const result=x.groups(items);
  assert.equal(result.size,4);
  assert.equal([...result.values()].filter(r=>r.is_duplicate===true).length,3);
  assert.equal(result.get("r-0").is_duplicate,false);
});
test("Never group different references, vendors, amounts, dates or aircraft in the same photo",()=>{
  const x=harness();
  const original=record("first",{reference:"INV-1"});
  const wrongReference=record("other",{reference:"INV-2"});
  assert.equal(x.groups([original,wrongReference]).size,0);
  const wrongVendor=record("other",{vendor:"Another Vendor"});
  assert.equal(x.groups([record("first"),wrongVendor]).size,0);
  const wrongAmount=record("other",{amount:"190.00"});
  wrongAmount.review_metadata.normalization.approved.values.grand_total=190;
  assert.equal(x.groups([record("first"),wrongAmount]).size,0);
  const wrongDate=record("other",{date:"2026-11-10"});
  assert.equal(x.groups([record("first"),wrongDate]).size,0);
  const differentProfile=record("other",{profile:"fuel_release"});
  assert.equal(x.groups([record("first"),differentProfile]).size,0);
  const child=record("child",{parent:"first"});
  assert.equal(x.groups([record("first"),child]).size,0);
  const noHash=record("other",{source:null});
  assert.equal(x.groups([record("first"),noHash]).size,0);
});
test("Canonical chosen across pages, nesting intact; re-election after deletion",async()=>{
  const x=harness();
  const currentPage=record("copy",{missing:["airport"],created:"2026-11-13T11:00:00Z"});
  const original=record("canonical",{missing:[],created:"2026-11-12T09:00:00Z",archived:true});
  const older=record("older",{state:"extracted",created:"2026-11-11T09:00:00Z"});
  const rows=[currentPage,original,older];
  const methods=[];
  x.database=async(p,method,table,query)=>{
    assert.equal(p.organization_id,"team-1");
    assert.equal(method,"GET","Scan must never write approved records");
    assert.equal(query.organization_id,"eq.team-1");
    methods.push(table);
    if(table==="document_records"&&query.source_sha256)return rows;
    if(table==="document_records"&&query.parent_document_id)return [{parent_document_id:"canonical"}];
    if(table==="billy_financial_links")return [{expense_document_id:"canonical"}];
    throw Error("Unexpected query");
  };
  const directory={};
  const annotations=await x.annotate(principal,[currentPage],directory);
  assert.equal(annotations.get("copy").duplicate_of,"canonical");
  assert.equal(annotations.get("older").duplicate_of,"canonical");
  assert.equal(annotations.get("canonical").is_duplicate,false);
  assert.ok(methods.every(x=>["document_records","billy_financial_links"].includes(x)));
  const afterDelete=x.groups([currentPage,older]);
  assert.equal(afterDelete.get("copy").is_duplicate,false);
  assert.equal(afterDelete.get("older").duplicate_of,"copy");
});
test("Large/partial duplicate scan fails closed rather than inventing canonical record",async()=>{
  const x=harness();
  const item=record("on-page");
  x.database=async()=>Array.from({length:501},(_,i)=>record("row-"+i));
  const hints=await x.annotate(principal,[item],{});
  assert.equal(hints.size,0);
});
test("Duplicate families are read-only, per-team and do not change financial counts or nesting",()=>{
  assert.match(backend,/async function duplicateAnnotations\(principal,records,directory\)/);
  assert.ok(backend.includes('source_sha256:"in.("+hashes.join(",")+")"'));
  assert.match(backend,/organization_id:"eq\."\+principal\.organization_id/);
  assert.match(backend,/parent_document_id:"is\.null"/);
  assert.match(backend,/duplicateById=await duplicateAnnotations\(principal,\[\.\.\.page,\.\.\.parents\],directory\)/);
  assert.match(backend,/duplicateById\.get\(record\.id\)/);
  assert.doesNotMatch(backend.slice(srcStart,srcEnd),/database\(principal,"(POST|PATCH|DELETE)"/);
  assert.match(index,/return decorateDuplicate\(root,root\)/);
  assert.match(index,/return decorateDuplicate\(shell,root\)/);
  assert.match(index,/record\.parent_document_id\)return card/);
  assert.match(index,/billy-duplicate-speech","Duplicate!"/);
  assert.match(index,/piggy\.src="\.\/piggybank-mark\.svg"/);
  assert.match(css,/\.billy-duplicate-hint\{/);
  assert.match(preview,/Duplicate document/);
  assert.match(preview,/Open original/);
});
