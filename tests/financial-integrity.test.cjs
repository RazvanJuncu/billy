const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=filename=>fs.readFileSync(path.join(__dirname,"..",filename),"utf8");
const edge=read("supabase/functions/billy-vision/index.ts");
const html=read("site/index.html");
const js=read("site/financial.js");
const workflow=read(".github/workflows/tests.yml");
const id=(part)=>part.repeat(8)+"-"+part.repeat(4)+"-4"+part.repeat(3)+"-8"+part.repeat(3)+"-"+part.repeat(12);
const A=id("a"),B=id("b"),C=id("c"),D=id("d"),E=id("e"),F=id("f");
function extract(start,end){
 const a=edge.indexOf(start),b=edge.indexOf(end,a);
 assert.ok(a>0&&b>a,"Cannot isolate original backend helper: "+start);
 return edge.slice(a,b);
}
function harness(){
 const code=[
  extract("function financialProfile(","function financialCardLast4("),
  extract("function financialFingerprint(","// Financial Operations P1.1"),
  extract("function financialOperations(","async function financialAuditEvents(")
 ].join("\n");
 const scope={
  ISO_CURRENCIES:new Set(["EUR","RON","USD","CHF"]),
  assistantValue:(r,key)=>key==="vendor"?
    r.reviewed_data?.supplier_name||"":
    key==="registration"?r.reviewed_data?.aircraft_registration||"":
    key==="flight"?r.reviewed_data?.flight_number||"":
    key==="category"?r.review_metadata?.classification?.expense_category||"": "",
  assistantMoney:r=>{
    const v=r.review_metadata?.normalization?.approved?.values||{};
    const o=r.review_metadata?.financial_overrides||{};
    const amount=Object.hasOwn(o,"grand_total")?o.grand_total:v.grand_total;
    const currency=Object.hasOwn(o,"currency")?o.currency:v.currency;
    if(typeof amount!=="number"||!Number.isFinite(amount)||amount<0||
       !["EUR","RON","USD","CHF"].includes(currency))return null;
    return {currency,minor:Math.round(amount*100)};
  },
  assistantRecordDate:r=>{
    const v=r.review_metadata?.normalization?.approved?.values||{};
    const o=r.review_metadata?.financial_overrides||{};
    const date=o.issue_date||v.service_date||v.issue_date||null;
    return {date,basis:date?"document":null};
  },
  validIsoDay:s=>/^\d{4}-\d{2}-\d{2}$/.test(s),
  canonicalDate:s=>({value:s,status:"ok"})
 };
 vm.runInNewContext(code+"\nthis.operations=financialOperations;this.check=financialIntegrityReport;",scope);
 return scope;
}
function record(id,profile,amount,currency,date,opts={}){
 const values={grand_total:amount,currency,issue_date:date};
 const meta={classification:{profile,expense_category:"handling"},
  normalization:{approved:{values,fields:{}}}};
 if(opts.override)meta.financial_overrides={...opts.override};
 return {
  id,created_by:"operator-1",created_at:opts.created||"2026-11-13T12:00:00Z",
  state:"approved",parent_document_id:opts.parent||null,
  source_sha256:opts.sha||id.split("-")[0].repeat(8),
  document_type:"invoice",original_storage_key:opts.archived?"private/original.jpg":null,
  reviewed_data:{supplier_name:opts.vendor||"Bacau Airport",
    invoice_number:opts.reference||null,
    transaction_status:opts.transaction_status||null},
  review_metadata:meta
 };
}
function fixture(){
 const bacau=record(A,"handling_invoice",367.2,"EUR","2026-11-09",
  {sha:"f".repeat(64),archived:true});
 const bacauDuplicate=record(B,"handling_invoice",367.2,"EUR","2026-11-09",
  {sha:"f".repeat(64),created:"2026-11-14T12:00:00Z"});
 const hotel=record(C,"city_tax_receipt",12,"EUR","2026-10-22",
  {vendor:"Victor Hotel"});
 const catering=record(D,"catering_bill",278.93,"EUR",null,
  {vendor:"Air Culinaire"});
 const taxi=record(E,"taxi_receipt",null,null,null,
  {vendor:"FSI Ride"});
 const receipt=record(F,"payment_slip",367.2,"EUR","2026-11-09",
  {parent:A,vendor:"Bacau Airport"});
 const loose=record(id("1"),"payment_slip",25,"EUR","2026-11-12",
  {vendor:"Grilletti Taxi"});
 const link={id:id("2"),expense_document_id:A,payment_document_id:F,
   amount_minor:36720,currency:"EUR",payment_result:"unverified"};
 return {roots:[bacauDuplicate,hotel,catering,bacau,taxi],
  receipts:[receipt,loose],links:[link],bacau,receipt,hotel,catering,taxi};
}
function run(data,overrides={}){
 const h=harness();
 const ops=h.operations(data.roots,data.receipts,
  data.links,"2026-11-14","operator-1");
 const integrity=h.check(ops,data.receipts,data.links,
  overrides.audit||{available:true,complete:true,events:[]},
  Boolean(overrides.partial));
 return {ops,integrity,checks:Object.fromEntries(Array.from(integrity.checks,x=>[x.id,x]))};
}
test("Realistic Bacău fixture: 379.20 EUR in 30 days; no POS double-count; 3 distinct exceptions",()=>{
 const f=fixture();const before=JSON.stringify(f);
 const {ops,integrity,checks}=run(f);
 assert.equal(ops.counts.expenses,4,"Bacau, hotel, catering and taxi remain distinct");
 assert.equal(ops.counts.duplicate_expenses_excluded,1);
 assert.equal(ops.trend.groups.find(g=>g.currency==="EUR").total_minor,37920);
 assert.equal(integrity.canonical_expenses,4);
 for(const key of ["duplicates","totals","expense_vs_proof","payment_links"]){
   assert.equal(checks[key].status,"pass",key);
 }
 assert.equal(checks.exceptions.status,"attention");
 assert.equal(checks.correction_audit.status,"not_tested");
 assert.equal(checks.cross_photo.status,"not_tested");
 assert.equal(checks.partial_refund.status,"not_tested");
 assert.equal(integrity.unverified_linked_payments,1);
 assert.match(checks.payment_links.description,/not independently confirmed/i);
 assert.equal(ops.ledger.find(r=>r.id===A).payment_state,"payment_linked");
 assert.equal(ops.ledger.some(r=>r.profile==="payment_slip"),false);
 assert.equal(integrity.read_only,true);
 assert.equal(JSON.stringify(f),before,"Financial Integrity must not mutate business records");
});
test("Independent totals validation catches a 367.20 duplicated chart entry",()=>{
 const f=fixture();const h=harness();
 const ops=h.operations(f.roots,f.receipts,f.links,"2026-11-14","operator-1");
 ops.trend.groups[0].total_minor+=36720;
 const report=h.check(ops,f.receipts,f.links,{available:true,complete:true,events:[]},false);
 const check=report.checks.find(c=>c.id==="totals");
 assert.equal(check.status,"fail");
 assert.equal(check.affected,1);
 assert.equal(report.status,"investigate");
});
test("A linked POS does not prove payment without explicit successful transaction status",()=>{
 const f=fixture();
 f.links[0].payment_result="confirmed";
 let result=run(f);
 assert.equal(result.checks.payment_links.status,"fail");
 assert.equal(result.integrity.status,"investigate");
 f.receipt.reviewed_data.transaction_status="APPROVED";
 result=run(f);
 assert.equal(result.checks.payment_links.status,"pass");
 assert.equal(result.integrity.unverified_linked_payments,0);
 f.receipt.reviewed_data.transaction_status="DECLINED";
 result=run(f);
 assert.equal(result.checks.payment_links.status,"fail");
});
test("Wrong invoice, POS amount, currency or reused proof is flagged instead of silently approved",()=>{
 const f=fixture();
 f.links[0].amount_minor=36721;
 assert.equal(run(f).checks.payment_links.status,"fail");
 f.links[0].amount_minor=36720;
 f.receipt.review_metadata.normalization.approved.values.currency="RON";
 assert.equal(run(f).checks.payment_links.status,"fail");
 f.receipt.review_metadata.normalization.approved.values.currency="EUR";
 f.links.push({...f.links[0],id:id("3"),expense_document_id:C});
 assert.equal(run(f).checks.payment_links.status,"fail");
});
test("Missing currency/date and unmatched slips are attention, not fabricated totals or unpaid labels",()=>{
 const f=fixture(),result=run(f);
 assert.equal(result.ops.counts.missing_amount,1);
 assert.equal(result.ops.counts.missing_currency,1);
 assert.equal(result.ops.counts.missing_date,2);
 assert.equal(result.ops.counts.unmatched_payments,1);
 assert.equal(result.integrity.unpriced_expenses,1);
 assert.equal(result.integrity.undated_priced_expenses,1);
 assert.equal(result.checks.exceptions.status,"attention");
 const taxi=result.ops.ledger.find(r=>r.id===E);
 assert.equal(taxi.amount_minor,null);
 assert.equal(taxi.payment_state,"no_payment_proof");
 assert.equal(result.ops.attention.some(e=>e.kind==="unmatched_payment"),true);
});
test("Corrections must have a matching audit event; synthetic reload validates durable representation",()=>{
 const f=fixture();
 f.catering.review_metadata.financial_overrides={issue_date:"2026-11-10"};
 const missing=run(f);
 assert.equal(missing.checks.correction_audit.status,"fail");
 const event={document_id:D,
  after_values:{issue_date:"2026-11-10"},
  created_at:"2026-11-14T13:00:00Z"};
 const reloaded=JSON.parse(JSON.stringify(f));
 const result=run(reloaded,{audit:{available:true,complete:true,events:[event]}});
 assert.equal(result.checks.correction_audit.status,"pass");
 assert.equal(result.ops.trend.groups[0].total_minor,65813);
 const bad=run(reloaded,{audit:{available:true,complete:true,
  events:[{...event,after_values:{issue_date:"2026-11-11"}}]}});
 assert.equal(bad.checks.correction_audit.status,"fail");
 const inaccessible=run(reloaded,{audit:{available:false,complete:false,events:[]}});
 assert.equal(inaccessible.checks.correction_audit.status,"incomplete");
});
test("Incomplete fetches never produce a green overall result",()=>{
 const f=fixture();
 const report=run(f,{partial:true});
 assert.equal(report.integrity.status,"incomplete");
 for(const key of ["duplicates","totals","expense_vs_proof","payment_links"]){
  assert.equal(report.checks[key].status,"incomplete");
 }
});
test("Read-only audit is tenant-scoped, never patches approved documents, and is visible only in Insights",()=>{
 assert.match(edge,/async function financialAuditEvents\(principal,roots\)/);
 assert.match(edge,/organization_id:"eq\."\+principal\.organization_id/);
 assert.match(edge,/select:"document_id,after_values,created_at"/);
 assert.match(edge,/const integrity=financialIntegrityReport\(ops,proofs\.rows,links,audit,/);
 const start=edge.indexOf("function financialIntegrityReport(");
 const end=edge.indexOf("async function financialEvidenceRows(",start);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(edge.slice(start,end),/database\(principal,"(?:POST|PATCH|DELETE)"/);
 for(const id of ["billyFinancialIntegritySummary",
   "billyFinancialIntegrityChecks","billyFinancialIntegrityRefresh"]){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 const insights=html.indexOf('id="billyFinancialInsightsSection"');
 const integrity=html.indexOf('id="billyFinancialIntegrityChecks"');
 assert.ok(insights>0&&integrity>insights);
 assert.match(js,/function renderIntegrity\(\)/);
 assert.match(js,/Recheck|Checking approved records/);
 assert.match(js,/not verified/);
 assert.match(workflow,/tests\/financial-integrity\.test\.cjs/);
});
