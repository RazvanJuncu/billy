const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const html=read("site/index.html");
const app=read("site/financial.js");
const css=read("site/financial.css");
const simple=read("site/simple.js");
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
class FakeElement{
  constructor(tag,id){
    this.tagName=tag.toUpperCase();this.id=id||null;
    this.children=[];this.attributes={};this.listeners={};
    this.hidden=false;this.disabled=false;this.value="";this.className="";
    this.style={setProperty:(k,v)=>{this.attributes[k]=v;}};
    this._text="";this.title="";
  }
  set textContent(value){this.children=[];this._text=String(value);}
  get textContent(){return this._text+this.children.map(child=>child?.textContent||"").join("");}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;this._text="";}
  addEventListener(name,callback){this.listeners[name]=callback;}
  setAttribute(name,value){this.attributes[name]=value;}
  querySelector(tag){return tag==="span"&&this.id==="billyFinancialSectionBack"?this.backLabel:null;}
  click(){this.listeners.click?.({target:this,currentTarget:this,preventDefault(){}});}
}
function mockApp(data){
  const all=new Map(ids.map(id=>[id,new FakeElement("div",id)]));
  const back=all.get("billyFinancialSectionBack");
  back.backLabel=new FakeElement("span");
  const document={
    body:{dataset:{billyScreen:"financial"}},
    getElementById:id=>all.get(id)||null,
    createElement:tag=>new FakeElement(tag)
  };
  const window={
    BILLY_AUTH_CONFIG:{apiUrl:"https://synthetic.example"},
    BillyAccounts:{active:()=>true,sessionHeaders:async()=>({Authorization:"Bearer test"})},
    addEventListener() {}
  };
  const fetch=async url=>{
    assert.match(url,/\/api\/vision\/financial$/);
    return new Response(JSON.stringify(data),{status:200,headers:{"Content-Type":"application/json"}});
  };
  vm.runInNewContext(app,{window,document,fetch,Intl,Date,Map,Set,Number,Promise});
  return {window,all,at:id=>all.get(id),click:id=>all.get(id).click()};
}
const financialData={
 trend:{start_date:"2026-10-16",end_date:"2026-11-14",
  groups:[{currency:"EUR",documents:2,total_minor:37920,bars:[
   {start_date:"2026-10-16",total_minor:1200},
   {start_date:"2026-10-23",total_minor:0},
   {start_date:"2026-10-30",total_minor:0},
   {start_date:"2026-11-06",total_minor:36720},
   {start_date:"2026-11-13",total_minor:0}
  ]}]},
 ledger:[
  {id:"inv-a",vendor:"Bacau Airport",profile:"handling_invoice",aircraft:"YR-DDN",
   date:"2026-11-09",amount_minor:36720,currency:"EUR",payment_state:"payment_linked",issues:[]},
  {id:"inv-b",vendor:"Victor Hotel",profile:"city_tax_receipt",aircraft:"YR-WNT",
   date:"2026-10-22",amount_minor:1200,currency:"EUR",payment_state:"no_payment_proof",issues:[]},
  {id:"inv-c",vendor:"Victor Hotel",profile:"catering_bill",aircraft:null,date:null,
   amount_minor:null,currency:null,payment_state:"no_payment_proof",issues:["missing_currency","missing_date"]}
 ],
 attention:[
  {id:"inv-c",kind:"missing_financial_fields",vendor:"Victor Hotel",
   profile:"catering_bill",issues:["missing_currency","missing_date"],can_review:true},
  {id:"slip-x",kind:"unmatched_payment",vendor:"Other merchant",profile:"payment_slip",
   issues:["unmatched_payment"],date:"2026-11-13",amount_minor:1200,currency:"EUR",can_review:false}
 ],
 linked_payments:[{id:"link-1",expense_document_id:"inv-a",
    payment_document_id:"slip-a",amount_minor:36720,currency:"EUR",payment_result:"unverified"}],
 operational_counts:{expenses:3,missing_date:1,unmatched_payments:1,duplicate_expenses_excluded:2},
 counts:{linked:1,confirmed:0,unverified:1},partial:false
};
test("Financial homepage shows compact summary and routes, not expanded chart or ledger",async()=>{
 const {window,at}=mockApp(financialData);
 await window.BillyFinancial.refresh();
 assert.equal(at("billyFinancialLanding").hidden,false);
 assert.equal(at("billyFinancialDetail").hidden,true);
 assert.equal(at("billyFinancialAttentionNav").hidden,false);
 assert.equal(at("billyFinancialAttentionBadge").textContent,"2");
 assert.match(at("billyFinancialPeriod").textContent,/dated expenses/);
 assert.equal(at("billyFinancialInsightsSection").hidden,true);
 assert.equal(at("billyFinancialExpenseResults").hidden,true);
 assert.equal(at("billyFinancialLinkedPanel").hidden,true);
});
test("Expenses navigate by vendor and aircraft, maintain filters and return one level at a time",async()=>{
 const {window,at,click}=mockApp(financialData);
 await window.BillyFinancial.refresh();
 click("billyFinancialExpensesNav");
 assert.equal(at("billyFinancialExpensePaths").hidden,false);
 assert.equal(at("billyFinancialDetail").hidden,false);
 click("billyFinancialByVendor");
 assert.equal(at("billyFinancialExpenseGroups").hidden,false);
 const groups=at("billyFinancialExpenseGroups").children;
 assert.equal(groups.length,2);
 groups.find(group=>group.textContent.includes("Victor Hotel")).click();
 assert.equal(at("billyFinancialExpenseResults").hidden,false);
 assert.equal(at("billyFinancialVendor").value,"Victor Hotel");
 assert.equal(at("billyFinancialLedger").children.length,2);
 assert.equal(window.BillyFinancial.back(),true);
 assert.equal(at("billyFinancialExpenseGroups").hidden,false);
 assert.equal(window.BillyFinancial.back(),true);
 assert.equal(at("billyFinancialExpensePaths").hidden,false);
 assert.equal(window.BillyFinancial.back(),true);
 assert.equal(at("billyFinancialLanding").hidden,false);
 assert.equal(window.BillyFinancial.back(),false);
 click("billyFinancialExpensesNav");
 click("billyFinancialByAircraft");
 const aircraftGroups=at("billyFinancialExpenseGroups").children;
 aircraftGroups.find(group=>group.textContent.includes("Unassigned aircraft")).click();
 assert.equal(at("billyFinancialExpenseResults").hidden,false);
 assert.equal(at("billyFinancialLedger").children.length,1);
 assert.match(at("billyFinancialSectionTitle").textContent,/Unassigned aircraft/);
});
test("Payments drill down to linked/unmatched lists and keep open actions available",async()=>{
 const {window,at,click}=mockApp(financialData);
 await window.BillyFinancial.refresh();
 click("billyFinancialPaymentsNav");
 assert.equal(at("billyFinancialPaymentPaths").hidden,false);
 click("billyFinancialLinkedPayments");
 assert.equal(at("billyFinancialLinkedPanel").hidden,false);
 assert.equal(at("billyFinancialLinks").children.length,1);
 window.BillyFinancial.back();
 click("billyFinancialUnmatchedPayments");
 assert.equal(at("billyFinancialUnmatchedPanel").hidden,false);
 assert.equal(at("billyFinancialUnmatchedList").children.length,1);
 assert.match(at("billyFinancialUnmatchedList").textContent,/Other merchant/);
});
test("Insights owns the only graph; attention appears only for real exceptions",async()=>{
 const {window,at,click}=mockApp(financialData);
 await window.BillyFinancial.refresh();
 click("billyFinancialInsightsNav");
 assert.equal(at("billyFinancialInsightsSection").hidden,false);
 assert.equal(at("billyFinancialChart").children.length,5);
 assert.equal(at("billyFinancialInsightCurrency").value,"EUR");
 window.BillyFinancial.home();
 click("billyFinancialAttentionNav");
 assert.equal(at("billyFinancialAttentionSection").hidden,false);
 assert.equal(at("billyFinancialAttentionList").children.length,2);
 const attention=at("billyFinancialAttentionList").children[0];
 const review=attention.children[1].children.find(child=>child.textContent==="Review");
 review.click();
 assert.equal(at("billyFinancialReviewEditor").hidden,false);
 const data={...financialData,attention:[]};
 const empty=mockApp(data);
 await empty.window.BillyFinancial.refresh();
 assert.equal(empty.at("billyFinancialAttentionNav").hidden,true);
 assert.equal(empty.at("billyFinancialLanding").hidden,false);
});
test("Financial navigation uses a single source of approved data, with no invented finance actions",()=>{
 for(const id of ["billyFinancialAttentionNav","billyFinancialExpensesNav",
  "billyFinancialPaymentsNav","billyFinancialInsightsNav","billyFinancialByAircraft",
  "billyFinancialByVendor","billyFinancialAllExpenses","billyFinancialLinkedPayments",
  "billyFinancialUnmatchedPayments","billyFinancialInsightCurrency","billyFinancialSectionBack"]){
   assert.equal(ids.filter(value=>value===id).length,1,"Missing or duplicated "+id);
 }
 assert.ok(html.indexOf('id="billyFinancialLanding"')<
   html.indexOf('id="billyFinancialDetail"'));
 assert.match(css,/\.billy-financial-landing\[hidden\]/);
 assert.match(app,/function renderExpenseLedger\(/);
 assert.match(app,/function renderFinancialAttention\(/);
 assert.match(app,/function renderUnmatchedPayments\(/);
 assert.match(app,/function chartBars\(/);
 assert.match(simple,/window\.BillyFinancial\?\.back\?\.\(\)/);
 assert.match(app,/\/api\/vision\/financial-review/);
 assert.doesNotMatch(app,/\.innerHTML\s*=/);
 assert.doesNotMatch(html,/billyFinancialMiniChart|billyFinancialMiniCurrency/);
});
