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
  // Reflect the initial visibility of elements in the HTML template.
  for(const [id,node] of all){
    const pos=html.indexOf('id="'+id+'"');
    assert.ok(pos>=0);
    const tag=html.slice(html.lastIndexOf("<",pos),html.indexOf(">",pos)+1);
    node.hidden=/\shidden(?:\s|>)/.test(tag);
  }
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

test("Financial home keeps circular navigation and hides empty attention",async()=>{
 const {window,at}=mockApp(financialData);
 await window.BillyFinancial.refresh();
 assert.equal(at("billyFinancialLanding").hidden,false);
 assert.equal(at("billyFinancialDetail").hidden,true);
 assert.equal(at("billyFinancialPageTitle").hidden,false);
 assert.equal(at("billyFinancialAttentionBadge").textContent,"2");
 assert.equal(at("billyFinancialAttentionNav").hidden,false);
 assert.equal(at("billyFinancialExpenseResults").hidden,true);
 assert.equal(at("billyFinancialLinkedPanel").hidden,true);
 const empty=mockApp({...financialData,attention:[]});
 await empty.window.BillyFinancial.refresh();
 assert.equal(empty.at("billyFinancialAttentionNav").hidden,true);
});
test("Expenses opens the ledger in one tap and filters directly by aircraft, vendor and search",async()=>{
 const {window,at,click}=mockApp(financialData);
 await window.BillyFinancial.refresh();
 click("billyFinancialExpensesNav");
 assert.equal(at("billyFinancialExpenseResults").hidden,false);
 assert.equal(at("billyFinancialLedger").children.length,3);
 assert.equal(at("billyFinancialPageTitle").hidden,true);
 assert.equal(at("billyFinancialSectionTitle").textContent,"Expenses");
 assert.equal(at("billyFinancialSectionBack").backLabel.textContent,"Financial");
 at("billyFinancialVendor").value="Victor Hotel";
 at("billyFinancialVendor").listeners.change({target:{value:"Victor Hotel"}});
 assert.equal(at("billyFinancialLedger").children.length,2);
 at("billyFinancialAircraft").value="YR-WNT";
 at("billyFinancialAircraft").listeners.change({target:{value:"YR-WNT"}});
 assert.equal(at("billyFinancialLedger").children.length,1);
 at("billyFinancialSearch").value="not found";
 at("billyFinancialSearch").listeners.input({target:{value:"not found"}});
 assert.match(at("billyFinancialLedger").textContent,/No expenses match these filters/);
 assert.equal(window.BillyFinancial.back(),true);
 assert.equal(at("billyFinancialLanding").hidden,false);
 assert.equal(at("billyFinancialPageTitle").hidden,false);
 assert.equal(window.BillyFinancial.back(),false);
});
test("Payments opens linked and unmatched evidence together without extra menu pages",async()=>{
 const {window,at,click}=mockApp(financialData);
 await window.BillyFinancial.refresh();
 click("billyFinancialPaymentsNav");
 assert.equal(at("billyFinancialSectionTitle").textContent,"Payments");
 assert.equal(at("billyFinancialLinkedPanel").hidden,false);
 assert.equal(at("billyFinancialUnmatchedPanel").hidden,false);
 assert.equal(at("billyFinancialLinks").children.length,1);
 assert.equal(at("billyFinancialUnmatchedList").children.length,1);
 assert.match(at("billyFinancialUnmatchedList").textContent,/Other merchant/);
 assert.match(at("billyFinancialLinks").textContent,/Payment evidence linked/);
 assert.equal(window.BillyFinancial.back(),true);
 assert.equal(at("billyFinancialLanding").hidden,false);
});
test("Attention still opens an audited correction editor and Insights keeps the chart",async()=>{
 const {window,at,click}=mockApp(financialData);
 await window.BillyFinancial.refresh();
 click("billyFinancialAttentionNav");
 assert.equal(at("billyFinancialAttentionSection").hidden,false);
 assert.equal(at("billyFinancialAttentionList").children.length,2);
 const review=at("billyFinancialAttentionList").children[0].children[1].children
  .find(child=>child.textContent==="Review");
 review.click();
 assert.equal(at("billyFinancialReviewEditor").hidden,false);
 window.BillyFinancial.back();
 click("billyFinancialInsightsNav");
 assert.equal(at("billyFinancialChart").children.length,5);
 assert.equal(at("billyFinancialInsightCurrency").value,"EUR");
 assert.match(html,/<details class="billy-financial-integrity"/);
 assert.match(html,/<summary class="billy-financial-integrity-summary"/);
 assert.doesNotMatch(html,/<details[^>]*\sopen(?:\s|>)/);
});
test("Financial routes preserve one approved-data source and authenticated preview",()=>{
 for(const id of ["billyFinancialAttentionNav","billyFinancialExpensesNav",
  "billyFinancialPaymentsNav","billyFinancialInsightsNav",
  "billyFinancialExpenseResults","billyFinancialVendor","billyFinancialAircraft",
  "billyFinancialPeriodFilter","billyFinancialSearch","billyFinancialSectionBack",
  "billyFinancialLinkedPanel","billyFinancialUnmatchedPanel",
  "billyFinancialIntegrityRefresh","billyFinancialPageTitle"]){
  assert.equal(ids.filter(value=>value===id).length,1,id);
 }
 for(const removed of ["billyFinancialExpensePaths","billyFinancialExpenseGroups",
  "billyFinancialByAircraft","billyFinancialByVendor","billyFinancialAllExpenses",
  "billyFinancialPaymentPaths","billyFinancialLinkedPayments","billyFinancialUnmatchedPayments"]){
  assert.doesNotMatch(html,new RegExp(removed));
  assert.doesNotMatch(app,new RegExp(removed));
 }
 assert.match(app,/function renderExpenseLedger\(/);
 assert.match(app,/function renderFinancialAttention\(/);
 assert.match(app,/function renderUnmatchedPayments\(/);
 assert.match(app,/\/api\/vision\/financial-review/);
 assert.match(app,/\/api\/vision\/assistant-source/);
 assert.match(app,/\/api\/vision\/financial/);
 assert.match(simple,/window\.BillyFinancial\?\.back\?\.\(\)/);
 assert.doesNotMatch(app,/\.innerHTML\s*=/);
 assert.doesNotMatch(html,/billyFinancialMiniChart|billyFinancialMiniCurrency/);
});
test("Billy's large circular hub is preserved and PWA CSS/JS caches are refreshed",()=>{
 const archive=read("site/simple.css");
 assert.match(archive,/\.billy-hub-grid\{display:grid/);
 assert.match(css,/\.billy-financial-landing > \.billy-financial-nav\{[^}]*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.billy-financial-landing \.billy-financial-nav-icon\{[^}]*width:106px;height:106px/);
 assert.match(css,/\.billy-financial-landing \.billy-financial-nav-arrow\{display:none\}/);
 assert.match(css,/\.simple-financial > \.simple-heading\[hidden\]\{display:none!important\}/);
 assert.match(html,/financial\.css\?v=1\.7\.0/);
 assert.match(html,/financial\.js\?v=1\.7\.0/);
 assert.match(read("site/sw.js"),/v113-financial-direct-workspaces/);
});
