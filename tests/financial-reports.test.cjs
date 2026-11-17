const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const source=read("site/financial-reports.js");
const page=read("site/index.html");
const css=read("site/financial-reports.css");
const cardCSS=read("site/financial-cards.css");
const cardJS=read("site/financial-cards.js");
const edge=read("supabase/functions/billy-vision/index.ts");
const scope={window:{},document:{getElementById:()=>null},Intl,Number,Date,Map,Set,Object,RegExp};
vm.runInNewContext(source,scope);
const reports=scope.window.BillyFinancialReports;
const row=(id,changes={})=>({
 id,vendor:"Supplier A",airport:"LROP",aircraft:"YR-WNT",category:"handling",
 sender:null,profile:"handling_invoice",date:"2026-11-10",amount_minor:20000,
 currency:"EUR",fuel_litres:null,fuel_tonnes:null,...changes
});
test("Grouping respects all six dimensions without inventing sender or airport",()=>{
 const rows=[row("a"),row("b",{vendor:"Supplier B",airport:null,sender:"Inbox A"}),
  row("c",{vendor:"Supplier A",aircraft:null,date:null})];
 assert.equal(reports.aggregate(rows,"vendor").find(x=>x.name==="Supplier A").count,2);
 assert.equal(reports.aggregate(rows,"aircraft").find(x=>x.name==="Unassigned aircraft").count,1);
 assert.equal(reports.aggregate(rows,"airport").find(x=>x.name==="Unassigned airport").count,1);
 assert.equal(reports.aggregate(rows,"month").find(x=>x.name==="Undated").count,1);
 assert.equal(reports.aggregate(rows,"sender").find(x=>x.name==="Sender not identified").count,2);
 assert.equal(reports.aggregate(rows,"category")[0].count,3);
});
test("Money stays separated by currency and count includes approved but unpriced invoices",()=>{
 const groups=reports.aggregate([
  row("a",{amount_minor:12450,currency:"EUR"}),
  row("b",{amount_minor:3500,currency:"RON"}),
  row("c",{amount_minor:null,currency:"EUR"})
 ],"vendor");
 assert.equal(groups.length,1);
 const group=groups[0];
 assert.equal(group.count,3);
 assert.equal(group.priced,2);
 assert.equal(group.amounts.get("EUR"),12450);
 assert.equal(group.amounts.get("RON"),3500);
 assert.equal(group.amounts.size,2);
});
test("Fuel quantities are summed only with verified numeric values",()=>{
 const groups=reports.aggregate([
  row("a",{fuel_litres:1200,fuel_tonnes:null}),
  row("b",{fuel_litres:1500.5,fuel_tonnes:1.2}),
  row("c",{fuel_litres:null,fuel_tonnes:null})
 ],"vendor");
 assert.equal(groups[0].litres,2700.5);
 assert.equal(groups[0].litre_count,2);
 assert.equal(groups[0].tonnes,1.2);
 assert.equal(groups[0].tonne_count,1);
 assert.match(edge,/fuel_litres:\(\(\)=>\{/);
 assert.match(edge,/meta\.normalization\?\.approved\?\.fuel\?\.litres/);
 assert.match(edge,/fuel_tonnes:\(\(\)=>\{/);
 assert.match(edge,/meta\.normalization\?\.approved\?\.fuel\?\.metric_tonnes/);
});
test("CSV exports filtered source rows, escapes formula injection and avoids conversion",()=>{
 reports.render({ledger:[
   row("a",{vendor:'=HYPERLINK("evil")',amount_minor:1245}),
   row("b",{vendor:"Supplier B",amount_minor:3000,currency:"RON"})
 ],partial:false});
 const csv=reports.csv();
 assert.ok(csv.startsWith("\uFEFF"));
 assert.ok(csv.includes("'=HYPERLINK"));
 assert.ok(csv.includes("12.45"));
 assert.ok(csv.includes("30.00"));
 assert.ok(csv.includes("EUR"));
 assert.ok(csv.includes("RON"));
 assert.ok(!csv.includes("RON equivalent"));
 reports.render({ledger:[row("a")],partial:true});
 assert.equal(reports.csv(),null);
});
test("Reports replaces Insights nav but preserves chart and integrity checks",()=>{
 assert.match(page,/<strong>Reports<\/strong>/);
 assert.match(page,/id="billyFinancialReportAircraft"/);
 assert.match(page,/id="billyFinancialReportAirport"/);
 assert.match(page,/id="billyFinancialReportVendor"/);
 assert.match(page,/id="billyFinancialReportCategoryGroup"/);
 assert.match(page,/id="billyFinancialReportMonth"/);
 assert.match(page,/id="billyFinancialReportSender"/);
 assert.match(page,/id="billyFinancialReportCategory"/);
 assert.match(page,/type="date" aria-label="Report start date"/);
 assert.match(page,/id="billyFinancialReportExport"/);
 assert.match(page,/id="billyFinancialReportRows"/);
 assert.match(page,/Spending trend · 30 days/);
 assert.ok(page.indexOf('class="billy-reports-overview"')<page.indexOf('class="billy-reports-workspace"'));
 assert.match(page,/class="billy-reports-overview-integrity"/);
 assert.match(page,/id="billyFinancialChart"/);
 assert.match(page,/id="billyFinancialIntegrityChecks"/);
 assert.match(read("site/financial.js"),/BillyFinancialReports\?\.render/);
 assert.match(css,/\.billy-reports-row/);
 assert.match(page,/financial-reports\.js\?v=1\.0\.0/);
 assert.match(page,/financial-reports\.css\?v=1\.1\.0/);
 assert.match(read("site/sw.js"),/v119-financial-ux-cleanup/);
});
test("Card surfaces use solid shape and no decorative fake chip",()=>{
 assert.doesNotMatch(cardJS,/billy-fcard-chip/);
 assert.doesNotMatch(cardCSS,/billy-fcard-chip/);
 assert.match(cardCSS,/\.billy-financial-cards-panel\{display:block;border:0/);
 assert.match(cardCSS,/background:#373f43/);
 assert.match(cardCSS,/box-shadow:0 8px 22px/);
 assert.match(cardCSS,/\.billy-fcard\[data-selected="true"\] \.billy-fcard-art\{background:/);
 assert.match(cardCSS,/\.billy-fcard:focus-visible\{outline:/);
 assert.match(page,/financial-cards\.css\?v=1\.2\.0/);
});
