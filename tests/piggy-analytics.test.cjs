const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const edge=read("supabase/functions/billy-vision/index.ts");
const hud=read("site/piggy-analytics-hud.js");
const client=read("site/intelligence-assistant.js");
const html=read("site/index.html");
const start=edge.indexOf("// Piggy Intelligence 2.0");
const end=edge.indexOf("async function assistantAsk(",start);
assert.ok(start>0&&end>start);
const scope={
 assistantLanguage:(q)=>q.includes("Cât")||q.includes("ultimele")?"ro":"en",
 validIsoDay:iso=>/^\d{4}-\d{2}-\d{2}$/.test(iso)&&
   new Date(iso+"T00:00:00Z").toISOString().slice(0,10)===iso,
 ISO_CURRENCIES:new Set(["EUR","RON","USD","CHF"]),
 financialProfile:row=>row.profile,
 financialFingerprint:row=>row.sha?row.sha+"|"+row.reference:"",
 assistantMoney:row=>row.amount_minor===null?null:{
   minor:row.amount_minor,currency:row.currency
 },
 assistantRecordDate:row=>({date:row.date,basis:row.date_basis}),
 assistantValue:(row,key)=>row[key]||"",
 cardTransactions:()=>({cards:[],duplicates_excluded:0,excluded_unpriced:0,
   unknown_card:0,without_card:0}),
 Date,Math,Map,Set,Object,Intl,RegExp,Number,JSON
};
vm.runInNewContext(edge.slice(start,end)+
 "\nthis.plan=piggyPlan;this.select=piggySelect;this.report=piggyAnalyticsResult;"+
 "this.expenses=piggyAnalyticsExpenses;this.cards=piggyAnalyticsCards;"+
 "this.schema=PIGGY_PLAN_SCHEMA;",scope);
const raw=(mod={})=>({
 intent:"report",language:"en",kind:"expenses",group_by:"vendor",chart:"auto",
 metric:"spend",compare_previous:false,start_date:null,end_date:null,
 vendor:null,airport:null,destination_airport:null,aircraft:null,
 flight_number:null,category:null,card_currency:null,card_last4:null,...mod
});
const plan=(mod={})=>scope.plan(raw(mod),"Show spending by vendor","2026-11-17");
const row=(id,currency="EUR",minor=10000,mod={})=>({
 id,amount_minor:minor,currency,date:"2026-11-16",date_basis:"service",
 vendor:"Aviation Supplier",category:"handling",airport:"LRCL",aircraft:"YR-WNT",
 flight_number:"MYJ009",card_display_currency:null,card_last4:null,
 card_holder:null,...mod
});
const source=rows=>({rows,duplicate_excluded:0,missing_values:0,without_card:0,unverified_card:0});
test("Planner is an allowlisted spec, not SQL or an LLM calculated sum",()=>{
 const keys=Object.keys(scope.schema.properties);
 assert.ok(keys.includes("group_by")&&keys.includes("card_currency"));
 assert.ok(!keys.includes("sql")&&!keys.includes("total_minor")&&!keys.includes("source_document_id"));
 assert.throws(()=>scope.plan({...raw(),sql:"DELETE FROM invoices"},"", "2026-11-17"),/Invalid analytics plan/);
 assert.throws(()=>scope.plan(raw({card_last4:"12345678"}),"","2026-11-17"),/Invalid (?:report filter|masked card)/);
 assert.throws(()=>scope.plan(raw({start_date:"2026-11-20",end_date:"2026-11-10"}),"","2026-11-17"),/range/);
});
test("Romanian relative last three days overrides hallucinated model dates",()=>{
 const spec=scope.plan(raw({start_date:"1999-01-01",end_date:"1999-01-01"}),
   "Cât s-a cheltuit în ultimele 3 zile?","2026-11-17");
 assert.equal(spec.start_date,"2026-11-15");
 assert.equal(spec.end_date,"2026-11-17");
});
test("RON-denominated cards include their EUR transactions, never convert EUR to RON",()=>{
 const spec=plan({kind:"card_spending",group_by:"card",card_currency:"RON"});
 const data=source([
   row("pos-a","EUR",10000,{card_last4:"9451",card_display_currency:"EUR",card_holder:"Card A"}),
   row("pos-b","EUR",20000,{card_last4:"7962",card_display_currency:"RON",card_holder:"Card B"}),
   row("pos-c","RON",3500,{card_last4:"7620",card_display_currency:"RON",card_holder:"Card C"})
 ]);
 const result=scope.report(data,spec,"2026-11-17");
 assert.equal(result.groups.length,2);
 assert.equal(result.groups.find(x=>x.currency==="EUR").total_minor,20000);
 assert.equal(result.groups.find(x=>x.currency==="RON").total_minor,3500);
 assert.equal(result.coverage.matching_documents,2);
 assert.deepEqual(Array.from(result.groups.find(x=>x.currency==="EUR").breakdown,
   x=>x.label),["•••• 7962 · Card B"]);
});
test("Dynamic categories, vendor, airport, aircraft, month and day filter independently",()=>{
 const data=source([row("one","EUR",10000),row("two","EUR",3000,{
   vendor:"Other",category:"fuel",airport:"LROP",date:"2026-10-10"
 })]);
 const groups=["vendor","category","airport","aircraft","day","month"];
 for(const dim of groups){
   const result=scope.report(data,plan({group_by:dim}),"2026-11-17");
   assert.ok(result.groups[0].breakdown.length>=1,dim);
   assert.ok(result.groups[0].total_minor===13000,dim);
 }
 const filtered=scope.report(data,plan({airport:"LRCL"}),"2026-11-17");
 assert.equal(filtered.groups[0].total_minor,10000);
 const after=scope.report(data,plan({start_date:"2026-11-15",end_date:"2026-11-17"}),"2026-11-17");
 assert.equal(after.coverage.matching_documents,1);
});
test("Previous period comparison uses equally long period and includes prior-only currencies",()=>{
 const spec=plan({start_date:"2026-11-15",end_date:"2026-11-17",
   compare_previous:true,group_by:"day",chart:"line"});
 const data=source([row("now","EUR",16000),
   row("earlier","EUR",10000,{date:"2026-11-13"}),
   row("historic","RON",3500,{date:"2026-11-13"})]);
 const r=scope.report(data,spec,"2026-11-17");
 const euro=r.groups.find(g=>g.currency==="EUR");
 assert.equal(euro.total_minor,16000);
 assert.equal(euro.previous_total_minor,10000);
 assert.equal(euro.delta_minor,6000);
 assert.equal(euro.change_percent,60);
 const ron=r.groups.find(g=>g.currency==="RON");
 assert.equal(ron.total_minor,0);
 assert.equal(ron.previous_total_minor,3500);
 assert.equal(ron.change_percent,-100);
});
test("Flight/date caveat: issue-only dates excluded for flight-scoped periods",()=>{
 const spec=plan({flight_number:"MYJ009",start_date:"2026-11-15",end_date:"2026-11-17"});
 const data=source([
   row("valid","EUR",10000,{date_basis:"service"}),
   row("issue","EUR",90000,{date_basis:"document"})]);
 const r=scope.report(data,spec,"2026-11-17");
 assert.equal(r.groups[0].total_minor,10000);
 assert.equal(r.coverage.unverified_flight_dates,1);
 assert.ok(r.notes.some(t=>/not externally verified/.test(t)));
});
test("Canonical expense dedup and POS excluded from invoice spending",()=>{
 const expense=(id,profile,sha,amount)=>({
   id,profile,sha,reference:"X001",state:"approved",parent_document_id:null,
   amount_minor:amount,currency:"EUR",date:"2026-11-16",date_basis:"service",
   vendor:"Supplier",category:"handling"
 });
 const e=scope.expenses([
   expense("inv","handling_invoice","hash-x",10000),
   expense("copy","handling_invoice","hash-x",10000),
   expense("pos","payment_slip","hash-pos",10000),
   expense("missing","hotel_bill","missing",null)
 ]);
 assert.equal(e.rows.length,1);
 assert.equal(e.duplicate_excluded,1);
 assert.equal(e.missing_values,1);
});
test("Backend is authenticated, tenant scoped, and explicitly blocks unverifiable destinations",()=>{
 assert.match(edge,/\/api\/vision\/analytics/);
 assert.match(edge,/const principal=await trusted\(req\)/);
 assert.match(edge,/organization_id:"eq\."\+principal\.organization_id/);
 assert.match(edge,/if\(plan\.destination_airport\)/);
 assert.match(edge,/Skylegs integration is required/);
 assert.match(edge,/if\(plan\.compare_previous&&!plan\.start_date\)/);
 assert.match(edge,/PIGGY_PLAN_SCHEMA/);
 assert.match(edge,/responseJsonSchema:PIGGY_PLAN_SCHEMA/);
 assert.match(client,/lastAnalyticsPlan/);
});
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.textContent="";
   this.style={};this.scrollTop=0;this.handlers={};}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(key,fn){this.handlers[key]=fn;}
}
function gather(x){return (x?.textContent||"")+" "+(x?.children||[]).map(gather).join(" ");}
test("HUD builds chart and table from server result, with no made-up currency conversions",()=>{
 const win={BillyIntelligenceAssistant:{openSource:()=>{}}};
 const sandbox={window:win,document:{
   createElement:x=>new Element(x),createElementNS:(ns,x)=>new Element(x),
   createDocumentFragment:()=>new Element("fragment")
 },Intl,Number,Math};
 vm.runInNewContext(hud,sandbox);
 const output=new Element("div"),title=new Element("h2"),kicker=new Element("span");
 const report=scope.report(source([
   row("a","EUR",10000,{vendor:"Fuel Service"}),
   row("b","USD",2000,{vendor:"Handling Service"})
 ]),plan({group_by:"vendor"}),"2026-11-17");
 win.PiggyAnalyticsHUD.render(report,"Show expenses by supplier",output,title,kicker);
 assert.match(gather(output),/Fuel Service/);
 assert.match(gather(output),/Handling Service/);
 assert.match(gather(output),/€100\.00/);
 assert.match(gather(output),/\$20\.00/);
 assert.doesNotMatch(gather(output),/€120\.00/);
 const line=scope.report(source([row("a","EUR",10000)]),
   plan({group_by:"day",chart:"line"}),"2026-11-17");
 win.PiggyAnalyticsHUD.render(line,"Show trend",output,title,kicker);
 function findSvg(x){return x.tag==="svg"||x.children.some(findSvg);}
 assert.equal(findSvg(output),true);
});
test("Conversation sends previous typed plan and preserves legacy document assistant",()=>{
 assert.match(client,/lastAnalyticsPlan=null/);
 assert.match(client,/\/api\/vision\/analytics/);
 assert.match(client,/previous_plan:lastAnalyticsPlan/);
 assert.match(client,/\/api\/vision\/assistant"/);
 assert.match(client,/result\.filter\?\.intent==="costs"/);
 assert.match(html,/piggy-analytics-hud\.js\?v=2\.0\.0/);
 assert.match(html,/piggybank-hud\.js\?v=1\.1\.0/);
 assert.match(html,/intelligence-assistant\.js\?v=0\.4\.0/);
 assert.match(read("site/sw.js"),/v123-piggy-analytics/);
 assert.doesNotMatch(client,/\.innerHTML\s*=|localStorage|sessionStorage/);
 assert.doesNotMatch(hud,/\.innerHTML\s*=|localStorage|sessionStorage/);
});
