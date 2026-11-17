const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const source=read("supabase/functions/billy-vision/index.ts");
const migration=read("supabase/migrations/202611162100_financial_reconciliation_3b2.sql");
const frontend=read("site/financial-reconciliation.js");
const html=read("site/index.html");
const start=source.indexOf("// Financial Reconciliation 3B.2.");
const end=source.indexOf("async function financialGet(",start);
assert.ok(start>0&&end>start);
const scope={Map,Number,JSON,Set};
vm.runInNewContext(source.slice(start,end)+"\nthis.coverage=financialCoverage;",scope);
const expense={id:"expense-1",vendor:"Bacau Airport",amount_minor:36720,
 currency:"EUR",can_review:true};
const payment=(amount,confirmed=false)=>({
 expense_document_id:"expense-1",payment_document_id:"slip",
 amount_minor:amount,payment_result:confirmed?"confirmed":"unverified"
});
const reported=(amount,method="bank_transfer")=>({
 id:"allocation-1",expense_document_id:"expense-1",created_by:"person-a",
 amount_minor:amount,currency:"EUR",method,state:"active"
});
const outcome=(links,allocations)=>scope.coverage([expense],links,allocations)[0];
test("manual partial payments and POS are separated and do not count as extra expenses",()=>{
 const item=outcome([payment(12000)],[reported(10000)]);
 assert.equal(item.proof_minor,12000);
 assert.equal(item.reported_minor,10000);
 assert.equal(item.covered_minor,22000);
 assert.equal(item.remaining_minor,14720);
 assert.equal(item.status,"partial");
 assert.equal(item.allocations.length,1);
});
test("on account is explicitly unpaid and never covers the invoice",()=>{
 const item=outcome([],[reported(0,"on_account")]);
 assert.equal(item.covered_minor,0);
 assert.equal(item.remaining_minor,36720);
 assert.equal(item.on_account,true);
 assert.equal(item.status,"on_account");
});
test("confirmed card proof is distinct from unverified evidence and operator reports",()=>{
 assert.equal(outcome([payment(36720,true)],[]).status,"covered_by_confirmed_pos");
 assert.equal(outcome([payment(36720,false)],[]).status,"covered_reported");
 assert.equal(outcome([], [reported(36720)]).status,"covered_reported");
 const mix=outcome([payment(10000,true)],[reported(26720,"cash")]);
 assert.equal(mix.status,"covered_reported");
 assert.equal(mix.remaining_minor,0);
});
test("legacy conflicting evidence is exposed, never silently labelled paid",()=>{
 const item=outcome([payment(36720)],[reported(500,"cash")]);
 assert.equal(item.status,"overallocated");
 assert.equal(item.remaining_minor,0);
});
test("DB rejects amount overcoverage from both POS links and reported amounts",()=>{
 assert.match(migration,/function private\.billy_financial_allocation_validate/);
 assert.match(migration,/for update/);
 assert.match(migration,/used_amount\+new\.amount_minor>expected_amount/);
 assert.match(migration,/private\.billy_financial_link_coverage/);
 assert.match(migration,/allocated\+new\.amount_minor>limit_minor/);
 assert.match(migration,/billy_financial_one_active_account_flag/);
 assert.match(migration,/method='on_account' and amount_minor=0/);
 assert.match(migration,/create table if not exists public\.billy_financial_allocation_events/);
 assert.match(migration,/alter table public\.billy_financial_allocations enable row level security/);
 assert.match(migration,/revoke all on public\.billy_financial_allocations,public\.billy_financial_allocation_events/);
 assert.match(migration,/only revocation is allowed/);
});
test("API requires a signed-in owner and cannot alter OCR or create bank confirmation",()=>{
 assert.match(source,/async function financialAllocate\(req,principal\)/);
 assert.match(source,/async function financialRevokeAllocation\(req,principal\)/);
 assert.match(source,/document\.created_by!==principal\.user_id/);
 assert.match(source,/current\[0\]\.created_by!==principal\.user_id/);
 assert.match(source,/\/api\/vision\/financial-allocation-revoke/);
 assert.match(source,/\/api\/vision\/financial-allocation/);
 assert.match(source,/reconciliation,linked_payments:links/);
 assert.doesNotMatch(source.slice(start,end),/payment_result:"confirmed"/);
});
test("UI keeps the single-page Billy Payments workspace and reversible operator reports",()=>{
 assert.match(html,/id="billyFinancialReconciliationPanel"/);
 assert.match(html,/id="billyFinancialReconciliationList"/);
 assert.match(html,/financial-reconciliation\.js\?v=2\.1\.0/);
 assert.match(frontend,/Bank transfer/);
 assert.match(frontend,/On account/);
 assert.match(frontend,/Split payments are supported/);
 assert.match(frontend,/Revoke this payment classification/i);
 assert.match(frontend,/financial-allocation-revoke/);
 assert.match(frontend,/financial-allocation/);
 assert.match(frontend,/amount_minor:minor/);
 assert.match(frontend,/window\.confirm/);
 assert.doesNotMatch(frontend,/\.innerHTML\s*=/);
 assert.match(read("site/financial.js"),/BillyFinancialReconciliation\?\.render/);
 assert.match(read("site/sw.js"),/v121-integrity-chevron/);
});
