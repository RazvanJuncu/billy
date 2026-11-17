const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const backend=read("supabase/functions/billy-vision/index.ts");
const schema=read("supabase/migrations/202611171130_financial_payment_cards.sql");
const frontend=read("site/financial-cards.js");
const html=read("site/index.html");
const css=read("site/financial-cards.css");
const start=backend.indexOf("// Card spending 1.0:");
const end=backend.indexOf("async function financialGet(",start);
assert.ok(start>0&&end>start);
const doc=(id,profile,card,amount="100.00",currency="EUR",day="2026-11-14",sha="a")=>({
 id,state:"approved",parent_document_id:null,source_sha256:sha.repeat(64),
 reviewed_data:{card_last4:card,supplier_name:"Aviation Supplier",payment_method:"card",
  transaction_status:"Approved",issue_date:day},
 review_metadata:{classification:{profile},normalization:{
  approved:{values:{grand_total:Number(amount),currency,issue_date:day}}}}
});
const cards=[
 {id:"card-1",last4:"2212",holder_label:"Card holder A",display_currency:"EUR",program_label:null},
 {id:"card-2",last4:"9451",holder_label:"Card holder B",display_currency:"EUR",program_label:null}
];
const sandbox={
 assistantMoney:r=>{
  const vals=r.review_metadata?.normalization?.approved?.values||{};
  return vals.grand_total!==undefined?{currency:vals.currency,minor:Math.round(vals.grand_total*100)}:null;
 },
 assistantRecordDate:r=>({date:r.review_metadata?.normalization?.approved?.values?.issue_date||null}),
 assistantValue:(r,key)=>key==="vendor"?r.reviewed_data?.supplier_name||"":"",
 financialTransactionStatus:r=>r.reviewed_data?.transaction_status==="Approved"?"confirmed":"unverified",
 financialProfile:r=>r.review_metadata?.classification?.profile||"",
 Date,Number,Map,Set,Intl
};
vm.runInNewContext(backend.slice(start,end)+"\nthis.spend=cardTransactions;",sandbox);
const run=(proofs,roots=[],links=[])=>sandbox.spend(cards,proofs,roots,links,"2026-11-17");
test("Approved POS is attributed by exact last four; no FX conversion or fake totals",()=>{
 const result=run([doc("p1","payment_slip","2212","10.00","EUR","2026-11-14","a"),
  doc("p2","payment_slip","2212","14.50","RON","2026-11-15","b")]);
 const card=result.cards.find(c=>c.last4==="2212");
 assert.equal(card.transaction_count,2);
 assert.equal(card.totals.find(t=>t.currency==="EUR").total_minor,1000);
 assert.equal(card.totals.find(t=>t.currency==="RON").total_minor,1450);
 assert.equal(result.cards.find(c=>c.last4==="9451").transaction_count,0);
 assert.equal(result.cards.find(c=>c.last4==="9451").totals.length,0);
});
test("Undated, unpriced, unknown and unread cards are excluded rather than invented",()=>{
 const noCard=doc("a","payment_slip",null);
 const unknown=doc("b","payment_slip","9876",undefined,"EUR","2026-11-14","b");
 const old=doc("c","payment_slip","2212","12.00","EUR","2026-09-01","c");
 const missingDate=doc("d","payment_slip","2212","12.00","EUR",undefined,"d");
 missingDate.review_metadata.normalization.approved.values.issue_date=null;
 const res=run([noCard,unknown,old,missingDate]);
 assert.equal(res.without_card,1);
 assert.equal(res.unknown_card,1);
 assert.equal(res.excluded_undated,1);
 assert.equal(res.cards[0].transaction_count+res.cards[1].transaction_count,0);
});
test("Same source uploaded twice is counted once, distinct POS transactions counted separately",()=>{
 const first=doc("a","payment_slip","2212","10.00","EUR","2026-11-14","a");
 const duplicate=doc("b","payment_slip","2212","10.00","EUR","2026-11-14","a");
 const independent=doc("c","payment_slip","2212","10.00","EUR","2026-11-14","b");
 const res=run([first,duplicate,independent]);
 assert.equal(res.cards.find(c=>c.last4==="2212").transaction_count,2);
 assert.equal(res.duplicates_excluded,1);
});
test("Explicitly paid-on-card bill is counted only without matching POS evidence",()=>{
 const bill=doc("invoice","handling_invoice","2212","100.00","EUR","2026-11-14","c");
 const slip=doc("slip","payment_slip","2212","100.00","EUR","2026-11-14","b");
 const withSlip=run([slip],[bill]);
 assert.equal(withSlip.cards.find(c=>c.last4==="2212").transaction_count,1);
 const alone=run([],[bill]);
 assert.equal(alone.cards.find(c=>c.last4==="2212").transaction_count,1);
 assert.equal(alone.paid_on_bill_entries,1);
 const unconfirmed=doc("other","handling_invoice","2212","200.00","EUR","2026-11-14","f");
 unconfirmed.reviewed_data.transaction_status=null;
 assert.equal(run([],[unconfirmed]).cards.find(c=>c.last4==="2212").transaction_count,0);
});
test("Card directory stores only masked digits, is team scoped, RLS secured and owner managed",()=>{
 assert.match(schema,/last4 text not null check\(last4 ~ '\^\[0-9\]\{4\}\$'\)/);
 assert.match(schema,/billy_payment_cards_org_active_last4/);
 assert.match(schema,/create table if not exists public\.billy_payment_card_events/);
 assert.match(schema,/alter table public\.billy_payment_cards enable row level security/);
 assert.match(schema,/revoke all on public\.billy_payment_cards, public\.billy_payment_card_events/);
 assert.match(schema,/role='owner'/);
 assert.doesNotMatch(schema,/Melinte|Codreanu|Negulescu|2212|9451/);
 assert.match(backend,/principal\.role!=="owner"/);
 assert.match(backend,/\/api\/vision\/cards/);
 assert.match(backend,/organization_id:"eq\."\+principal\.organization_id/);
 assert.doesNotMatch(backend,/full_pan|card_cvv|expiry_date/);
});
test("Card UI stays inside Payments and cannot present imported JetRead totals",()=>{
 assert.match(html,/id="billyFinancialCardsPanel"/);
 assert.match(html,/financial-cards\.js\?v=1\.0\.0/);
 assert.match(html,/financial-cards\.css\?v=1\.2\.0/);
 assert.match(frontend,/No activity/);
 assert.match(frontend,/source transaction/);
 assert.doesNotMatch(frontend,/No balances or historical spending imported from JetRead/);
 assert.match(frontend,/Show all/);
 assert.match(frontend,/Archive card/);
 assert.match(frontend,/assistant-source\?record_id=/);
 assert.doesNotMatch(frontend,/\.innerHTML\s*=/);
 assert.match(css,/\.billy-financial-cards-grid/);
 assert.match(read("site/sw.js"),/v120-financial-copy-cleanup/);
});
