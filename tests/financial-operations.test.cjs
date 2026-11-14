const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const backend=read("supabase/functions/billy-vision/index.ts");
const schema=read("supabase/migrations/202611141215_financial_review_audit.sql");
const markup=read("site/index.html");
const browser=read("site/financial.js");
const styles=read("site/financial.css");
const first=backend.indexOf("function financialOperations(");
const last=backend.indexOf("async function financialLinksFor(",first);
assert.ok(first>0&&last>first);
const principal={organization_id:"team-1",user_id:"person-a"};
const profile=(r)=>r.review_metadata?.classification?.profile||"generic_invoice";
const money=r=>{
  const v=r.review_metadata?.normalization?.approved?.values||{};
  const o=r.review_metadata?.financial_overrides||{};
  const amount=o.grand_total??v.grand_total,currency=o.currency??v.currency;
  if(typeof amount!=="number"||!Number.isFinite(amount)||!currency)return null;
  return {currency,minor:Math.round(amount*100)};
};
function document(id,opts={}){
 const profileName=opts.profile||"handling_invoice";
 return {
  id,created_by:opts.creator||"person-a",created_at:opts.created||"2026-11-13T10:00:00Z",
  original_storage_key:opts.archived?"/sealed/"+id:null,
  source_sha256:opts.hash||id.repeat(64).slice(0,64),
  state:"approved",parent_document_id:opts.parent||null,document_type:"invoice",
  reviewed_data:{supplier_name:opts.vendor||"Bacau Airport",
    invoice_number:opts.ref||null},
  review_metadata:{classification:{profile:profileName,expense_category:opts.category||"handling"},
    normalization:{approved:{fields:{},values:{
      grand_total:opts.amount===undefined?367.2:opts.amount,
      currency:opts.currency===undefined?"EUR":opts.currency,
      issue_date:opts.date===undefined?"2026-11-09":opts.date
    }}},
    ...(opts.overrides?{financial_overrides:opts.overrides}:{})}
 };
}
function harness(){
 const scope={
  Map,Set,Number,Object,String,Date,Intl,
  financialProfile:profile,
  assistantMoney:money,
  assistantValue:(r,k)=>k==="vendor"?r.reviewed_data.supplier_name:
    k==="registration"?(r.aircraft||"YR-DDN"):
    k==="flight"?"MYJ789":k==="category"?"handling":"",
  assistantRecordDate:r=>{
    const v=r.review_metadata?.normalization?.approved?.values||{};
    const verified=r.review_metadata?.financial_overrides?.issue_date;
    const date=verified||v.issue_date;
    return {date:date||null,basis:verified?"document":date?"document":null};
  },
  financialFingerprint:r=>{
    const v=money(r);
    const key=r.source_sha256+"|"+profile(r)+"|"+r.reviewed_data.supplier_name+"|"+
      (r.reviewed_data.invoice_number||"")+"|"+
      (v?v.currency+":"+v.minor:"unpriced");
    return key;
  },
  financialTrend:(rows)=>({groups:rows.filter(r=>money(r)).map(r=>money(r)),start_date:"2026-10-16",end_date:"2026-11-14"}),
  ISO_CURRENCIES:new Set(["EUR","USD","RON","CHF"]),
  UUID_FORMAT:/^[a-f0-9-]{36}$/,
  canonicalNumber:raw=>({status:"ok",value:Number(raw)}),
  canonicalCurrency:raw=>({status:"ok",value:String(raw)}),
  canonicalDate:raw=>({status:"ok",value:raw}),
  database:async()=>{throw Error("Install a mock database before RPC test")},
  error:(detail,status)=>new Response(JSON.stringify({detail}),{status}),
  json:value=>new Response(JSON.stringify(value),{status:200}),
  Response
 };
 vm.runInNewContext(backend.slice(first,last)+
   "\nthis.ledger=financialOperations;this.review=financialReview;",scope);
 return scope;
}
test("P1 ledger counts approved invoices once and keeps payment evidence out of totals",()=>{
 const x=harness();
 const invoice=document("a",{hash:"f".repeat(64),archived:true});
 const duplicate=document("b",{hash:"f".repeat(64),created:"2026-11-14T10:00:00Z"});
 const hotel=document("c",{amount:12,currency:"EUR",date:"2026-10-22",vendor:"Victor Hotel"});
 const taxi=document("d",{amount:113.9,currency:null,profile:"taxi_receipt"});
 const catering=document("e",{amount:278.93,currency:"EUR",date:null,profile:"catering_bill"});
 const linkedPayment=document("p",{profile:"payment_slip",parent:"a",amount:367.2});
 const otherPayment=document("q",{profile:"payment_slip",amount:25});
 const links=[{expense_document_id:"a",payment_document_id:"p",payment_result:"unverified"}];
 const result=x.ledger([duplicate,hotel,taxi,invoice,catering],
   [linkedPayment,otherPayment],links,"2026-11-14","person-a");
 assert.equal(result.counts.expenses,4);
 assert.equal(result.counts.duplicate_expenses_excluded,1);
 assert.equal(result.counts.missing_currency,1);
 assert.equal(result.counts.missing_date,1);
 assert.equal(result.counts.unmatched_payments,1);
 assert.equal(result.ledger.find(r=>r.vendor==="Bacau Airport").id,"a",
   "Fully archived linked original wins over later duplicate");
 assert.equal(result.ledger.find(r=>r.id==="a").payment_state,"payment_linked");
 assert.equal(result.ledger.find(r=>r.id==="c").payment_state,"no_payment_proof");
 assert.equal(result.ledger.find(r=>r.id==="d").amount_minor,null);
 assert.deepEqual(Array.from(result.attention.find(r=>r.id==="d").issues),["missing_currency"]);
 assert.equal(result.attention.find(r=>r.id==="e").issues[0],"missing_date");
 assert.equal(result.attention.find(r=>r.id==="q").kind,"unmatched_payment");
 assert.equal(result.attention.some(r=>r.id==="p"),false);
 assert.equal(result.ledger.some(r=>r.profile==="payment_slip"),false);
});
test("Financial Attention review is scoped to uploader, not just team membership",()=>{
 const x=harness();
 const shared=document("f",{creator:"person-b",currency:null});
 const own=document("g",{creator:"person-a",currency:null});
 const result=x.ledger([shared,own],[],[],"2026-11-14","person-a");
 assert.equal(result.attention.find(i=>i.id==="f").can_review,false);
 assert.equal(result.attention.find(i=>i.id==="g").can_review,true);
});
test("Operator correction goes through the transactional audited RPC, not direct document PATCH",async()=>{
 const x=harness(),calls=[];
 x.database=async(p,method,path,query,body)=>{
   calls.push({p,method,path,query,body});
   assert.equal(path,"rpc/billy_apply_financial_review");
   assert.equal(method,"POST");
   return {saved:true,record_id:body.p_record};
 };
 const request=new Request("https://test.example/api/vision/financial-review",{
   method:"POST",body:JSON.stringify({
     record_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
     values:{grand_total:"278.93",currency:"EUR",issue_date:"2026-11-09"}
   })
 });
 const res=await x.review(request,principal);
 assert.equal(res.status,200);
 assert.equal(calls.length,1);
 assert.equal(calls[0].body.p_actor,"person-a");
 assert.equal(calls[0].body.p_org,"team-1");
 assert.equal(calls[0].body.p_values.grand_total,278.93);
 assert.equal(calls[0].body.p_values.currency,"EUR");
 assert.equal(calls[0].body.p_values.issue_date,"2026-11-09");
 const invalid=await x.review(new Request("https://test.example",{
   method:"POST",body:JSON.stringify({
     record_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
     values:{payment_status:"paid"}
   })
 }),principal);
 assert.equal(invalid.status,400);
 assert.equal(calls.length,1);
});
test("Database financial audit preserves source readings and restricts who can write",()=>{
 assert.match(schema,/create table if not exists public\.billy_financial_review_events/);
 assert.match(schema,/alter table public\.billy_financial_review_events enable row level security/);
 assert.match(schema,/revoke all on public\.billy_financial_review_events from anon,authenticated/);
 assert.match(schema,/grant execute on function public\.billy_apply_financial_review/);
 assert.match(schema,/d\.created_by=p_actor/);
 assert.match(schema,/for update/);
 assert.match(schema,/insert into public\.billy_financial_review_events/);
 assert.match(schema,/review_metadata=v_meta/);
 assert.doesNotMatch(schema,/set reviewed_data\s*=/);
 assert.match(schema,/Unlink the active payment before editing financial values/);
});
test("P1 UI offers real, accessible filters and explicit correction actions",()=>{
 for(const id of ["billyFinancialAttentionList","billyFinancialLedger",
   "billyFinancialSearch","billyFinancialVendor","billyFinancialAircraft",
   "billyFinancialPeriodFilter","billyFinancialReviewEditor"]){
   assert.ok(markup.includes('id="'+id+'"'),id);
 }
 assert.match(browser,/\/api\/vision\/financial-review/);
 assert.match(browser,/Save verified values/);
 assert.match(browser,/Original|original readings remain unchanged/i);
 assert.match(browser,/No payment proof linked/);
 assert.match(browser,/No expenses match these filters/);
 assert.doesNotMatch(browser,/\.innerHTML\s*=/);
 assert.match(styles,/\.billy-financial-section\{/);
 assert.match(styles,/\.billy-financial-filters\{/);
});
