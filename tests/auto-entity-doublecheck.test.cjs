const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const backend=fs.readFileSync(path.join(__dirname,"..","supabase/functions/billy-vision/index.ts"),"utf8");
const review=fs.readFileSync(path.join(__dirname,"..","site/ramp-review.js"),"utf8");

function loadPlanner(){
  const from=backend.indexOf("const PUBLIC_ENTITY_FIELDS=");
  const to=backend.indexOf("function safeFileName",from);
  assert.ok(from>0&&to>from,"public entity planner must exist");
  const ctx={URL,console};
  vm.runInNewContext(backend.slice(from,to)+"\nthis.plan=entityLookupPlan;this.clean=cleanPublicEntity;",ctx);
  return ctx;
}
const ambiguous=field_path=>({field_path,transcription:"",visual_clarity:"ambiguous",alternate_readings:[]});
test("Autonomous entity checks are selective, public and bounded",()=>{
  const h=loadPlanner();
  assert.equal(h.plan({supplier_name:"ANA",airport_icao:"LSZH"},[]).length,0,
    "a short but legible company name should not waste an online search");
  const checks=h.plan({
    supplier_name:"CAT Air Service AG",airport_icao:"LSZH",invoice_number:"CAS-57075",
    flight_number:"MYJ832",grand_total:"714.91",customer_name:"Private Guest"
  },[ambiguous("supplier_name"),ambiguous("airport_icao")]);
  assert.equal(checks.length,2);
  assert.deepEqual(Array.from(checks,x=>x.field_path),["supplier_name","airport_icao"]);
  assert.ok(checks.every(x=>!JSON.stringify(x).includes("MYJ832")));
  assert.equal(h.clean("ceo@example.com"),null);
  assert.equal(h.clean("https://example.com"),null);
  assert.equal(h.clean("not provided"),null);
  assert.equal(h.clean("1234567890"),null);
  assert.equal(h.clean("LSZH","airport"),"LSZH");
  assert.equal(h.plan({supplier_name:null,airport:null},[]).length,0,
    "No source fragment means no responsible online identification");
  const truncated=h.plan({supplier_name:"Airserv..."},[]);
  assert.equal(truncated.length,1);
});
test("Search grounding is a provenance sidecar, never an OCR auto-correction",()=>{
  assert.match(backend,/async function autoVerifyEntities\(fields,regions\)/);
  assert.match(backend,/const externalChecks=await autoVerifyEntities\(fields,regions\)/);
  assert.match(backend,/review_metadata:\{classification,extraction_profile_version:"1\.1",external_checks:externalChecks\}/);
  assert.match(backend,/tools:\[\{google_search:\{\}\}\]/);
  assert.match(backend,/candidate\?\.groundingMetadata/);
  assert.match(backend,/MAX_AUTO_ENTITY_LOOKUPS=2/);
  assert.match(backend,/status==="possible_match"/);
  assert.doesNotMatch(backend,/api\/vision\/verify-entity/);
  assert.match(backend,/MAX_AUTO_ENTITY_LOOKUPS=2/);
  assert.match(review,/result\.external_checks\?\.checks/);
  assert.match(review,/Possible public match/);
  assert.match(review,/Public sources are suggestions/);
  assert.match(review,/doubleCheck\.addEventListener/);
});
