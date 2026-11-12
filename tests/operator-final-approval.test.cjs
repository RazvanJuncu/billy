const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const backend=read("supabase/functions/billy-vision/index.ts");
const ramp=read("site/ramp-review.js");
const review=read("site/vision-review.js");

test("Human approval is final and never requires a second Gemini recheck",()=>{
  assert.match(ramp,/const readyToApprove=\(\)=>!busy&&allResolved\(\)/);
  assert.match(ramp,/const finish=create\("button","ramp-primary","Approve & continue"\)/);
  assert.match(ramp,/state\.set\(path,\{level:"blue",reason:changed\?/);
  assert.match(ramp,/state\.set\(path,\{level:"blue",reason:"Operator confirmed absent/);
  assert.doesNotMatch(ramp,/\/api\/vision\/recheck|Recheck with AI|recheckWithAI|checkedRevision/);
  assert.match(review,/confirmed:true/);
  assert.match(review,/\/api\/vision\/approve/);
  assert.match(backend,/verification_policy:"operator_final_no_ai_recheck"/);
});

test("Field provenance distinguishes operator corrections from AI extraction",()=>{
  const first=backend.indexOf("function approvedFieldProvenance(");
  const last=backend.indexOf("async function approve(req,principal)",first);
  assert.ok(first>0&&last>first);
  const ctx={Set,Map};
  vm.runInNewContext(backend.slice(first,last)+"\nthis.provenance=approvedFieldProvenance;",ctx);
  const audit={field_reviews:[
    {field_path:"supplier_name",action:"corrected"},
    {field_path:"issue_date",action:"unreviewed"},
    {field_path:"grand_total",action:"confirmed"},
    {field_path:"lines[0].quantity",action:"unreviewed"}
  ]};
  const rows=ctx.provenance(audit,["supplier_name","grand_total","lines[0].quantity"],["vat_total"]);
  const result=Object.fromEntries(rows.map(r=>[r.field_path,r]));
  assert.equal(result.supplier_name.source,"operator_verified");
  assert.equal(result.issue_date.source,"ai_extracted");
  assert.equal(result.grand_total.source,"operator_verified");
  assert.equal(result["lines[0].quantity"].source,"operator_verified");
  assert.equal(result.vat_total.action,"absent");
  assert.equal(result.vat_total.source,"operator_verified");
  assert.equal(rows.some(x=>x.source==="externally_verified"),false,
    "Public search suggestions cannot imply externally confirmed facts.");
});

test("Deterministic checks still validate approved edits, while old image uncertainty is not duplicated",()=>{
  const begin=backend.indexOf("const operatorVerified=new Set(",backend.indexOf("async function approve(req,principal)"));
  const end=backend.indexOf("const reviewMetadata={",begin);
  assert.ok(begin>0&&end>begin);
  const code=backend.slice(begin,end);
  assert.match(code,/const approvalRegions=\(source\.regions_data\|\|\[\]\)\.filter/);
  assert.match(code,/!operatorVerified\.has\(row\.field_path\)/);
  assert.match(code,/validate\(checked,data\.document_type,approvalRegions/);
  assert.match(code,/normalizeDocument\(checked,data\.document_type/);
  assert.match(backend,/field_provenance:provenance/);
});

test("One approval action retains confirmation, corrections and audit claims",()=>{
  assert.match(review,/manual_confirmations:window\.BillyReview\?\.rampAudit/);
  assert.match(review,/confidence_engine:window\.BillyReview\?\.rampAudit/);
  assert.match(ramp,/manual_confirmations:\[\.\.\.humanReviewed\]/);
  assert.match(ramp,/ai_recheck_count:0/);
  assert.match(backend,/state:"approved",reviewed_data:checked/);
  assert.match(backend,/approved_at:new Date\(\)\.toISOString\(\)/);
});
