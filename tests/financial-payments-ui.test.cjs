const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const page=read("site/index.html"),ui=read("site/financial-reconciliation.js");
const finance=read("site/financial.js"),backend=read("supabase/functions/billy-vision/index.ts");
const css=read("site/financial-payments.css");
const env={window:{},document:{getElementById:()=>null},Intl,Number,Date,Map,Set};
vm.runInNewContext(ui,env);
const groups=env.window.BillyFinancialReconciliation.groups;
const base={
 amount_minor:30000,currency:"EUR",remaining_minor:30000,
 proof_minor:0,reported_minor:0,status:"unclassified",can_review:true,
 allocations:[],vendor:"Test supplier",profile:"handling_invoice",date:"2026-11-09"
};
const row=(id,overrides={})=>({
 ...base,expense_document_id:id,...overrides
});
test("no slip does not exclude approved bills from the financial ledger",()=>{
 assert.match(backend,/const ledger=\[\],attention=\[\],counts=\{/);
 assert.match(backend,/const paymentLinks=byExpense\.get\(rec\.id\)\|\|\[\]/);
 assert.match(backend,/ledger\.push\(record\)/);
 assert.doesNotMatch(finance,/if\(!item\.linked_payment_count\)return false/);
});
test("explicit card paid-on-bill is evidence, not an inference from digits alone",()=>{
 assert.match(backend,/const bill_card_evidence=\/\^\(\?:card/);
 assert.match(backend,/transaction_status\|\|doc\.payment_status/);
 assert.match(backend,/bill_card_last4:bill_card_evidence\?bill_card_last4:null/);
 assert.match(backend,/bill_card_evidence:expense\.bill_card_evidence===true/);
 const split=groups({reconciliation:[
   row("ordinary",{bill_card_evidence:false,bill_card_last4:"2212"}),
   row("paid",{bill_card_evidence:true,bill_card_last4:"2212"})
 ]});
 assert.deepEqual(Array.from(split.noSlip,x=>x.expense_document_id),["ordinary"]);
 assert.deepEqual(Array.from(split.paidOnBill,x=>x.expense_document_id),["paid"]);
});
test("operator-classified invoices leave no-slip queue, including ON ACCOUNT unpaid",()=>{
 const split=groups({reconciliation:[
   row("unknown"),
   row("cash",{reported_minor:30000,remaining_minor:0,status:"covered_reported",
     allocations:[{id:"a",method:"cash",amount_minor:30000}]}),
   row("account",{status:"on_account",on_account:true,
     allocations:[{id:"b",method:"on_account",amount_minor:0}]}),
   row("partial",{status:"partial",remaining_minor:10000,reported_minor:20000,
     allocations:[{id:"c",method:"bank_transfer",amount_minor:20000}]}),
   row("has-slip",{proof_minor:30000,remaining_minor:0,status:"covered_by_confirmed_pos"})
 ]});
 assert.deepEqual(Array.from(split.noSlip,x=>x.expense_document_id),["unknown"]);
 assert.deepEqual(Array.from(split.classified,x=>x.expense_document_id),
   ["cash","account","partial"]);
 assert.equal(split.paidOnBill.length,0);
 assert.equal(split.classified.find(x=>x.expense_document_id==="account").remaining_minor,30000);
});
test("Payments has one direct workspace with JetRead-inspired workflow, Billy styling",()=>{
 const ids=["billyFinancialReconciliationPanel","billyFinancialReconciliationList",
  "billyFinancialNoSlipCount","billyFinancialPaidOnBillPanel",
  "billyFinancialPaidOnBillList","billyFinancialReportedPanel",
  "billyFinancialReportedList","billyFinancialCardsPanel",
  "billyFinancialLinkedPanel","billyFinancialUnmatchedPanel"];
 for(const id of ids){
   assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 const order=["billyFinancialReconciliationPanel","billyFinancialPaidOnBillPanel","billyFinancialReportedPanel","billyFinancialCardsPanel"].map(id=>page.indexOf('id="'+id+'"'));
 assert.ok(order.every((x,i)=>i===0||x>order[i-1]),"New sections are in the intended hierarchy");
 assert.ok(page.indexOf('id="billyFinancialReportedPanel"')<
   page.indexOf('id="billyFinancialCardsPanel"'));
 assert.match(page,/financial-payments\.css\?v=1\.2\.0/);
 assert.match(page,/financial-reconciliation\.js\?v=2\.1\.0/);
 assert.match(finance,/billyFinancialPaidOnBillPanel/);
 assert.match(finance,/billyFinancialReportedPanel/);
 assert.match(css,/\.billy-payments-bill-row/);
 assert.match(css,/@media\(max-width:600px\)/);
});
test("No-slip selection is explicit, auditable, and reversible without auto-settlement",()=>{
 assert.match(ui,/Paid by/);
 assert.match(ui,/function editor\(entry\)/);
 assert.match(ui,/financial-allocation"/);
 assert.match(ui,/financial-allocation-revoke"/);
 assert.match(ui,/method\.value==="on_account"\?0/);
 assert.match(ui,/NOT bank verification/);
 assert.match(ui,/No payment will be marked as received/);
 assert.match(ui,/Split payments are supported/);
 assert.match(ui,/window\.confirm/);
 assert.doesNotMatch(ui,/\.innerHTML\s*=/);
 assert.match(read("site/sw.js"),/v121-integrity-chevron/);
});

test("Collapsed Payments is a compact, single-surface disclosure shelf",()=>{
 const start=page.indexOf('class="billy-financial-payment-shelf"');
 const end=page.indexOf('id="billyFinancialInsightsSection"',start);
 assert.ok(start>0&&end>start);
 const shelf=page.slice(start,end);
 for(const id of ["billyFinancialPaidOnBillPanel","billyFinancialReportedPanel",
  "billyFinancialCardsPanel","billyFinancialLinkedPanel","billyFinancialUnmatchedPanel"])
  assert.match(shelf,new RegExp('id="'+id+'"'));
 assert.match(css,/\.billy-financial-payment-shelf\{[^}]*background:#222628/);
 assert.match(css,/\.billy-financial-payment-shelf > details \+ details/);
 assert.match(css,/min-height:54px/);
 assert.match(css,/details\[open\] > summary/);
 assert.match(css,/details\[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(page,/billyFinancialSectionBack/);
});
