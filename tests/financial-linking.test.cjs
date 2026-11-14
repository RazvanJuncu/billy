const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const source=read("supabase/functions/billy-vision/index.ts");
const schema=read("supabase/migrations/202611140900_financial_linking_p0.sql");
const preview=read("site/document-preview.js");
const finance=read("site/financial.js");
const home=read("site/index.html");
const principal={organization_id:"team-1",user_id:"operator-1"};
const id=(n)=>n.repeat(8)+"-"+n.repeat(4)+"-4"+n.repeat(3)+"-8"+n.repeat(3)+"-"+n.repeat(12);
const INVOICE=id("a"),PAYMENT=id("b"),PAYMENT2=id("c");
function record(ref,profile,amount="367.20",currency="EUR",day="2026-11-09",parent=null){
  return {
    id:ref,organization_id:"team-1",created_by:"operator-1",state:"approved",
    parent_document_id:parent,relationship_type:parent?"attached_document":null,
    document_type:"invoice",source_sha256:"f".repeat(64),
    reviewed_data:{supplier_name:"Bacau Airport",invoice_number:profile==="payment_slip"?null:"AA-10",
      grand_total:amount,currency,issue_date:day,
      transaction_status:null,card_last4:null},
    review_metadata:{classification:{profile,expense_category:"handling"},
      normalization:{approved:{values:{grand_total:Number(amount),
        currency,issue_date:day},fields:{}}}}
  };
}
function mount(){
  const start=source.indexOf("// Financial Linking Engine P0:");
  const end=source.indexOf("async function listRecords(",start);
  assert.ok(start>0&&end>start);
  const sandbox={
    assistantMoney:r=>{const x=r.review_metadata?.normalization?.approved?.values||{};
      return typeof x.grand_total==="number"&&x.currency?
        {currency:x.currency,minor:Math.round(x.grand_total*100)}:null;},
    canonicalDate:raw=>({status:"ok",value:raw}),
    assistantRecordDate:r=>({date:r.review_metadata?.normalization?.approved?.values?.issue_date}),
    assistantValue:(r,k)=>k==="vendor"?r.reviewed_data.supplier_name:"",
    database:async()=>{throw Error("No fake DB installed");},
  };
  vm.runInNewContext(source.slice(start,end)+
    "\nthis.match=samePhotoCandidate;this.reconcile=reconcileSamePhoto;"+
    "this.trend=financialTrend;this.status=financialTransactionStatus;",sandbox);
  return sandbox;
}
test("P0 Payment Slip 1.1 extracts only masked last four, transaction status and reference",()=>{
  assert.match(source,/payment_slip:\["card_last4","card_brand","transaction_reference"/);
  assert.match(source,/payment_method/);
  assert.match(source,/doc\[k\]=masked&&\/\^\\d\{4\}\$\/.test\(masked\)\?masked:null/);
  assert.match(source,/never infer successful payment/i);
});
test("Unique same-photo exact amount, currency and date matches but does not imply paid",()=>{
  const x=mount(),parent=record(INVOICE,"handling_invoice");
  const slip=record(PAYMENT,"payment_slip","367.20","EUR","2026-11-09",INVOICE);
  const r=x.match(parent,slip);
  assert.equal(r.currency,"EUR");
  assert.equal(r.amount_minor,36720);
  assert.equal(r.payment_result,"unverified");
  assert.equal(r.evidence.same_photo,true);
  assert.equal(x.match(parent,{...slip,parent_document_id:null}),null);
  assert.equal(x.match(parent,{...slip,reviewed_data:{...slip.reviewed_data,issue_date:"2026-11-10"},
    review_metadata:{...slip.review_metadata,normalization:{approved:{values:{
      grand_total:367.20,currency:"EUR",issue_date:"2026-11-10"}}}}}),null);
  const other=record(PAYMENT,"payment_slip","367.20","RON","2026-11-09",INVOICE);
  assert.equal(x.match(parent,other),null);
  const wrong=record(PAYMENT,"payment_slip","367.21","EUR","2026-11-09",INVOICE);
  assert.equal(x.match(parent,wrong),null);
  const declined=record(PAYMENT,"payment_slip","367.20","EUR","2026-11-09",INVOICE);
  declined.reviewed_data.transaction_status="DECLINED";
  assert.equal(x.match(parent,declined),null);
  slip.reviewed_data.transaction_status="Approved";
  assert.equal(x.match(parent,slip).payment_result,"confirmed");
  assert.equal(x.match(record(INVOICE,"fuel_release"),slip),null);
});
test("Reconciliation waits for approved child; repeat is idempotent; user unlink stays unlinked",async()=>{
  const x=mount(),parent=record(INVOICE,"handling_invoice"),
    child=record(PAYMENT,"payment_slip","367.20","EUR","2026-11-09",INVOICE);
  const rows=[parent,child],links=[];
  x.database=async (p,method,table,q,body)=>{
    assert.equal(p.organization_id,"team-1");
    if(table==="document_records"){
      let matches=rows;
      if(q.id)matches=matches.filter(y=>y.id===q.id.slice(3));
      if(q.parent_document_id)matches=matches.filter(y=>y.parent_document_id===q.parent_document_id.slice(3));
      return matches;
    }
    if(table==="billy_financial_links"&&method==="GET")
      return links.filter(l=>l.payment_document_id===q.payment_document_id.slice(3));
    if(table==="billy_financial_links"&&method==="POST"){
      const item={...body,id:"link-1"};links.push(item);return [item];
    }
    throw Error("Unexpected backend call "+table);
  };
  child.state="extracted";
  assert.notEqual(await x.reconcile(principal,child.id),"linked");
  child.state="approved";
  assert.equal(await x.reconcile(principal,child.id),"linked");
  assert.equal(await x.reconcile(principal,child.id),"already_linked");
  assert.equal(links.length,1);
  links[0].state="revoked";
  assert.equal(await x.reconcile(principal,child.id),"operator_unlinked");
  assert.equal(links.length,1);
  const child2=record(PAYMENT2,"payment_slip","367.20","EUR","2026-11-09",INVOICE);
  rows.push(child2);
  assert.equal(await x.reconcile(principal,child2.id),"needs_review");
});
test("Approved expense trend never double-counts nested slips, duplicate documents or currencies",()=>{
  const x=mount(),invoice=record(INVOICE,"handling_invoice"),slip=record(PAYMENT,"payment_slip",
    "367.20","EUR","2026-11-09",INVOICE);
  const duplicate=record(id("d"),"handling_invoice");
  const usd=record(id("e"),"handling_invoice","100.00","USD");
  usd.source_sha256="e".repeat(64);
  const data=x.trend([invoice,slip,duplicate,usd],"2026-11-14");
  const eur=data.groups.find(x=>x.currency==="EUR");
  assert.equal(eur.total_minor,36720);
  assert.equal(eur.documents,1);
  assert.equal(data.duplicate_records_excluded,1);
  assert.equal(data.groups.find(x=>x.currency==="USD").total_minor,10000);
  assert.equal(data.groups.length,2);
});
test("Financial links are separate from physical nesting and always auditable",()=>{
  assert.match(schema,/create table if not exists public\.billy_financial_links/);
  assert.match(schema,/billy_financial_active_payment_unique/);
  assert.match(schema,/financial_links_distinct_documents/);
  assert.match(schema,/create table if not exists public\.billy_financial_link_events/);
  assert.match(schema,/event_type in \('linked','unlinked','deleted'\)/);
  assert.match(schema,/alter table public\.billy_financial_links enable row level security/);
  assert.match(schema,/revoke all on public\.billy_financial_links/);
  assert.match(schema,/financial_links can only be revoked/i);
  assert.match(source,/reconcileSamePhoto\(principal,source\.id\)/);
  assert.match(source,/async function financialUnlink\(req,principal\)/);
  assert.match(source,/Only the document owner can unlink its payment/);
});
test("Financial UI shows only approved backend money and permits evidence open/unlink",()=>{
  assert.match(home,/billyFinancialMiniChart/);
  assert.match(home,/simpleFinancial/);
  assert.match(home,/billyFinancialMiniCurrency/);
  assert.match(finance,/\/api\/vision\/financial"/);
  assert.match(finance,/window\.BillyAccounts\.sessionHeaders\(\)/);
  assert.match(finance,/No approved expenses for this period/);
  assert.doesNotMatch(finance,/demo|illustrative|fakeSpend/);
  assert.match(preview,/api\+"\/api\/vision\/financial\?record_id="/);
  assert.match(preview,/api\+"\/api\/vision\/financial-unlink"/);
  assert.match(preview,/verified\?"Paid":"Payment linked"/);
  assert.match(preview,/Open slip/);
});
