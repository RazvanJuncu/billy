const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const edge=read("supabase/functions/billy-vision/index.ts");
const ui=read("site/intelligence-assistant.js");
const html=read("site/index.html");
const css=read("site/intelligence-assistant.css");
function engine(){
  const start=edge.indexOf("// Billy Intelligence Assistant v0.1.");
  const end=edge.indexOf("Deno.serve(async req=>",start);
  assert.ok(start>0&&end>start,"assistant backend exists");
  const scope={ORGANIZATION_SERVICES:["fuel","handling","taxi","hotel","other"],
    ISO_CURRENCIES:new Set(["EUR","RON","USD"])};
  vm.runInNewContext(edge.slice(start,end)+
    "\nthis.intent=assistantIntent;this.aggregate=assistantAggregate;"+
    "this.money=assistantMoney;this.date=assistantRecordDate;"+
    "this.day=assistantDay;this.registration=assistantRegistration;",scope);
  return scope;
}
function record(id,amount=100,currency="EUR",overrides={}){
  return {id,state:"approved",parent_document_id:null,document_type:"invoice",
    reviewed_data:{supplier_name:"Handler X",invoice_number:id,
      aircraft_registration:"YR-DSR",airport_icao:"LROP",service_date:"2026-11-11",
      grand_total:String(amount),currency,flight_number:"MYJ832",...overrides},
    review_metadata:{classification:{profile:"handling_invoice",expense_category:"handling"},
      normalization:{approved:{values:{grand_total:amount,currency,
        service_date:"2026-11-11",aircraft_registration:"YR-DSR",flight_number:"MYJ832"},
        fields:{grand_total:{status:"unchanged"},currency:{status:"unchanged"}}}}}};
}
test("Romanian and English relative dates resolve from trusted Bucharest calendar, not a model guess",()=>{
  const e=engine(),today="2026-11-12";
  const parsed={intent:"costs",language:"ro",aircraft_registration:null,
    start_date:"1990-01-01",end_date:"1990-01-01",expense_category:null,
    vendor_name:null,flight_number:null};
  const r=e.intent(parsed,"Cât a costat Gulfstream-ul ieri?",today);
  assert.equal(r.aircraft_registration,"YR-DSR");
  assert.equal(r.start_date,"2026-11-11");
  assert.equal(r.end_date,"2026-11-11");
  assert.equal(e.intent({...parsed,language:"en"},"How much did YR-DSR cost yesterday?",today).language,"en");
  assert.equal(e.registration("YR DSR"),"YR-DSR");
});
test("No cross-currency totals, no duplicate payment slips/children, service-date only",()=>{
  const e=engine(),first=record("first",100,"EUR"),second=record("second",22.45,"EUR"),
    third=record("third",55,"USD");
  const child=record("child",100,"EUR");
  child.parent_document_id="first";
  const slip=record("slip",200,"EUR");
  slip.review_metadata.classification.profile="payment_slip";
  const issued=record("issued",999,"EUR");
  delete issued.reviewed_data.service_date;
  delete issued.review_metadata.normalization.approved.values.service_date;
  issued.reviewed_data.issue_date="2026-11-11";
  const r=e.aggregate([first,second,third,child,slip,issued],
    {aircraft_registration:"YR-DSR",start_date:"2026-11-11",end_date:"2026-11-11",
     expense_category:null,vendor_name:null,flight_number:null},false);
  const sums=Object.fromEntries(r.groups.map(x=>[x.currency,x.total_minor]));
  assert.equal(sums.EUR,12245);
  assert.equal(sums.USD,5500);
  assert.equal(r.coverage.matched_records,4);
  assert.equal(r.coverage.priced_records,3);
  assert.equal(r.coverage.skipped_invoice_date_only,1);
  assert.equal(r.coverage.mission_verified,false);
  assert.equal(r.coverage.skylegs_connected,false);
});
test("Repeated uploads of the same approved invoice do not double-count",()=>{
  const e=engine(),a=record("original",99,"EUR"),b=record("copy",99,"EUR");
  a.source_sha256="a".repeat(64);b.source_sha256=a.source_sha256;
  a.reviewed_data.invoice_number="INV-77";b.reviewed_data.invoice_number="INV-77";
  const filter={aircraft_registration:"YR-DSR",start_date:"2026-11-11",end_date:"2026-11-11",
    expense_category:null,vendor_name:null,flight_number:null};
  const r=e.aggregate([a,b],filter,false);
  assert.equal(r.groups[0].total_minor,9900);
  assert.equal(r.coverage.duplicate_records_excluded,1);
  const different=record("other",40,"EUR");
  different.source_sha256=a.source_sha256;
  different.reviewed_data.invoice_number="INV-78";
  const expanded=e.aggregate([a,b,different],filter,false);
  assert.equal(expanded.groups[0].total_minor,13900);
  assert.equal(expanded.coverage.duplicate_records_excluded,1);
});
test("Ambiguous money is excluded, no raw OCR arithmetic or assumed exchange rates",()=>{
  const e=engine(),a=record("x",9,"EUR");
  delete a.review_metadata.normalization.approved.values.grand_total;
  assert.equal(e.money(a),null);
  const b=record("y",9,"EUR");
  b.review_metadata.normalization.approved.fields.grand_total.status="ambiguous";
  assert.equal(e.money(b),null);
  const c=record("z",8,"USD");
  assert.equal(e.money(c).minor,800);
});
test("Assistant endpoint is authenticated, scoped to the team and rejects arbitrary model SQL",()=>{
  assert.match(edge,/const ASSISTANT_INTENT_SCHEMA=/);
  assert.match(edge,/responseJsonSchema:ASSISTANT_INTENT_SCHEMA/);
  assert.match(edge,/organization_id:"eq\."\+principal\.organization_id/);
  assert.match(edge,/state:"eq\.approved",parent_document_id:"is\.null"/);
  assert.ok(edge.includes('if(suffix==="/api/vision/assistant")return await assistantAsk(req,principal)'));
  assert.ok(edge.includes('if(suffix==="/api/vision/assistant-source")return await assistantSource(req,principal)'));
  assert.match(edge,/const principal=await trusted\(req\)/);
  assert.match(edge,/select:"id,document_type,state,created_at,approved_at,extracted_data/);
  assert.doesNotMatch(edge.slice(edge.indexOf("async function assistantRows("),
    edge.indexOf("async function assistantAsk(")),/eval\(|SELECT \*/);
});
test("Home-only animated bubble displays verified breakdown and allows opening source records",()=>{
  assert.match(html,/id="billyAssistantLaunch"/);
  assert.match(html,/id="billyAssistantPanel"/);
  assert.match(html,/id="billyAssistantForm"/);
  assert.match(html,/intelligence-assistant\.js\?v=0\.3\.0/);
  assert.match(html,/intelligence-assistant\.css\?v=0\.3\.4/);
  assert.match(css,/body\[data-billy-screen="home"\] \.billy-ai-dock/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(ui,/window\.BillyAccounts\.sessionHeaders\(\)/);
  assert.match(ui,/\/api\/vision\/assistant-source\?record_id=/);
  assert.match(ui,/window\.BillyDocumentPreview\.open\(result\.record\)/);
  assert.match(ui,/result\.groups/);
  assert.match(ui,/result\.notes/);
  assert.doesNotMatch(ui,/\.innerHTML\s*=|localStorage|sessionStorage/);
});

test("Billy assistant follows flat product UI, not a large stand-alone chat widget",()=>{
  assert.match(html,/class="billy-ai-head-mark" src="\.\/piggybank-mark\.svg"/);
  assert.match(html,/Ask about costs, flights, or documents\./);
  assert.doesNotMatch(html,/Answers use your team's approved documents\. Flight-level totals will need Skylegs/);
  assert.doesNotMatch(html,/Approved records · Operational insights/);
  assert.match(css,/height:min\(242px,calc\(100dvh - 108px\)\)/);
  assert.match(css,/\.billy-ai-panel\.has-thread\{height:min\(575px/);
  assert.match(css,/body\.auth-locked \.billy-ai-dock\{display:none!important\}/);
  assert.match(css,/\.billy-ai-welcome\[hidden\]\{display:none!important\}/);
  assert.match(css,/\.billy-ai-disclosure/);
  assert.match(css,/@media\(max-width:640px\)/);
  assert.match(css,/width:100vw;height:100dvh/);
  assert.match(css,/\.billy-ai-orbit/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|conic-gradient/);
  assert.match(ui,/panel\.classList\.add\("has-thread"\)/);
  assert.match(ui,/make\("details","billy-ai-disclosure"\)/);
  assert.match(ui,/welcome\.hidden=true/);
});

test("Piggybank identity and HUD use the official portal hierarchy",()=>{
  const hud=read("site/piggybank-hud.js"),mark=read("site/piggybank-mark.svg");
  assert.match(html,/aria-label="Open Piggybank"/);
  assert.match(html,/<strong>Piggybank<\/strong>/);
  assert.match(html,/id="piggybankHudBackdrop"/);
  assert.match(html,/id="piggybankHud" class="piggybank-hud"/);
  assert.match(html,/id="piggybankHudClose"/);
  assert.match(html,/piggybank-hud\.js\?v=1\.0\.0/);
  assert.match(mark,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(mark,/<title id="piggyTitle">Piggybank<\/title>/);
  assert.match(css,/\.piggybank-hud-backdrop\{/);
  assert.match(css,/backdrop-filter:blur\(10px\)/);
  assert.match(css,/\.billy-ai-dock\{z-index:1700\}/);
  assert.match(css,/z-index:1650/);
  assert.match(css,/\.piggybank-hud\{position:fixed/);
  assert.match(css,/@media\(max-width:1050px\)/);
  assert.match(css,/body\[data-billy-screen="home"\] \.billy-preview-overlay\{z-index:2100!important\}/);
  assert.match(hud,/window\.PiggybankHUD=\{show,hide,active:/);
  assert.match(hud,/group\.categories/);
  assert.match(hud,/group\.vendors/);
  assert.match(hud,/result\.documents/);
  assert.match(hud,/result\.notes/);
  assert.doesNotMatch(hud,/\.innerHTML\s*=|localStorage|sessionStorage/);
  assert.match(ui,/result\.filter\?\.intent==="costs"/);
  assert.match(ui,/renderHudNotice\(result,prompt\)/);
  assert.match(ui,/window\.PiggybankHUD\?\.show\(result,prompt\)/);
  assert.match(ui,/window\.PiggybankHUD\?\.hide\(false\)/);
  assert.match(ui,/window\.BillyIntelligenceAssistant=\{ask,openSource\}/);
  assert.match(ui,/window\.Piggybank=\{ask\}/);
  assert.doesNotMatch(ui,/<script|\.innerHTML\s*=/);
});
