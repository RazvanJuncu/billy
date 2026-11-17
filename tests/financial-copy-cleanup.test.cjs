const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const page=read("site/index.html");
const expense=read("site/financial.js");
const payments=read("site/financial-reconciliation.js");
const cards=read("site/financial-cards.js");
const reports=read("site/financial-reports.js");
const paymentsCss=read("site/financial-payments.css");
const shapes=read("site/financial-categories.js");
class Node{
 constructor(type){this.type=type;this.children=[];this.attributes={};this.className="";this.title="";this.textContent="";}
 append(...nodes){this.children.push(...nodes);}
 setAttribute(name,value){this.attributes[name]=String(value);}
}
const sandbox={window:{},document:{createElement:x=>new Node(x),createElementNS:(uri,x)=>new Node(x)}};
vm.runInNewContext(shapes,sandbox);
const cats=sandbox.window.BillyFinancialCategories;
test("Screenshot categories map source profiles to compact all-caps names",()=>{
 const examples={
  catering_bill:"CATERING",taxi_receipt:"TAXI",city_tax_receipt:"CITY TAX",
  crew_expense_receipt:"CREW EXPENSES",hotel_bill:"HOTEL",handling_invoice:"HANDLING",
  fuel_invoice:"FUEL",parking_receipt:"PARKING",pax_gifts_receipt:"PAX GIFTS"
 };
 for(const [profile,label] of Object.entries(examples)){
  assert.equal(cats.resolve(profile,null).label,label,profile);
  const view=cats.make(profile,null);
  assert.equal(view.className,"billy-financial-category");
  assert.equal(view.children[0].type,"svg");
  assert.equal(view.children[0].attributes["aria-hidden"],"true");
  assert.ok(view.children[0].children.length>1);
  assert.equal(view.children[1].textContent,label);
 }
 assert.equal(cats.resolve("unrecognized","taxi").label,"TAXI");
 assert.equal(cats.resolve("unrecognized","unrecognized").label,"EXPENSE");
});
test("Expenses and Payments use shared category icons instead of raw profile names",()=>{
 assert.match(page,/financial-categories\.js\?v=1\.0\.0/);
 assert.match(expense,/BillyFinancialCategories\?\.make\?\.\(item\.profile,item\.category\)/);
 assert.match(payments,/BillyFinancialCategories\?\.make\?\.\(entry\.profile,entry\.category\)/);
 assert.doesNotMatch(expense,/item\.profile\|\|""\)\.replaceAll\("_"," "\)/);
 assert.doesNotMatch(payments,/String\(entry\.profile\|\|"Expense"\)\.replaceAll/);
 assert.match(paymentsCss,/\.billy-financial-category svg/);
 assert.match(paymentsCss,/\.billy-financial-expense-category/);
});
test("Financial screens omit explanatory paragraphs and duplicate count text",()=>{
 const removed=[
  "A slip is not required for an invoice",
  "Only approved bills explicitly marked card-paid appear here",
  "Operator-reported transfers, cash, other methods",
  "No balances or historical spending imported from JetRead",
  "Only approved Billy expenses; canonical records counted once",
  "POS slips are not additional expenses. Fuel volume",
  "4 of 4 approved expenses"
 ];
 for(const string of removed)for(const [sourceName,source] of [
  ["HTML",page],["expenses",expense],["payments",payments],
  ["cards",cards],["reports",reports]]){
   assert.equal(source.includes(string),false,sourceName+" still shows "+string);
  }
 assert.doesNotMatch(page,/billyFinancialLedgerCount/);
 assert.doesNotMatch(page,/billyFinancialCardNote/);
 assert.doesNotMatch(expense,/duplicate_expenses_excluded.*\?\s*" · duplicates excluded"/);
 assert.doesNotMatch(cards,/billyFinancialCardNote/);
 assert.match(cards,/No activity/);
 assert.match(reports,/Partial archive · CSV export unavailable/);
 assert.match(reports,/notice\.hidden=!data\?\.partial/);
 assert.match(page,/billyFinancialNoSlipCount/);
});
test("Collapsed controls have matching thin CSS chevrons and retain keyboard focus",()=>{
 assert.match(paymentsCss,/\.billy-financial-payment-shelf \.billy-financial-proof-summary::after/);
 assert.match(paymentsCss,/\.billy-financial-payment-shelf \.billy-financial-cards-summary::after/);
 assert.match(paymentsCss,/transform:rotate\(45deg\)/);
 assert.match(paymentsCss,/transform:rotate\(225deg\)/);
 assert.match(paymentsCss,/\.billy-payments-method-button::after/);
 assert.match(payments,/button\("Paid by","billy-payments-method-button"/);
 assert.doesNotMatch(payments,/button\("Paid by  ⌄"/);
 assert.match(paymentsCss,/\.billy-financial-proof-summary:focus-visible/);
});
test("PWA includes latest copy cleanup assets",()=>{
 assert.match(page,/financial\.js\?v=2\.3\.1/);
 assert.match(page,/financial-reports\.js\?v=1\.1\.0/);
 assert.match(page,/financial-reconciliation\.js\?v=2\.1\.0/);
 assert.match(page,/financial-cards\.js\?v=1\.1\.0/);
 assert.match(page,/financial-payments\.css\?v=1\.2\.0/);
 const sw=read("site/sw.js");
 assert.match(sw,/billydpi-orbit-v\d+-[a-z0-9-]+/);
 assert.match(sw,/\.\/financial-categories\.js/);
 assert.match(sw,/financial-categories\\\.js/);
});
