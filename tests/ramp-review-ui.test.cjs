const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const html=read("site/index.html");
const css=read("site/ramp-review.css");
const ramp=read("site/ramp-review.js");
const review=read("site/vision-review.js");
const backend=read("supabase/functions/billy-vision/index.ts");
const sw=read("site/sw.js");
test("Ramp UI scripts and reverse verifier are valid JavaScript",()=>{
  assert.doesNotThrow(()=>new vm.Script(ramp,{filename:"ramp-review.js"}));
  assert.doesNotThrow(()=>new vm.Script(backend,{filename:"billy-vision/index.ts"}));
  assert.match(html,/ramp-review\.css\?v=/);
  assert.match(html,/ramp-review\.js\?v=/);
  assert.ok(html.indexOf("vision-review.js")<html.indexOf("ramp-review.js"));
  assert.ok(html.indexOf("ramp-review.js")<html.indexOf("app.js"));
  assert.match(sw,/"\.\/ramp-review\.js"/);
  assert.match(sw,/"\.\/ramp-review\.css"/);
});
test("Segmented color indicators are unlabeled visually yet accessible to screen readers",()=>{
  assert.match(ramp,/ramp-jar/);
  assert.match(ramp,/ramp-segment ramp-/);
  assert.match(ramp,/setAttribute\("aria-label",labelFor\(/);
  assert.match(ramp,/create\("span","ramp-segment-number"/);
  assert.match(css,/\.ramp-green\{background:#57b885/);
  assert.match(css,/\.ramp-yellow\{background:#ebc66a/);
  assert.match(css,/\.ramp-red\{background:#e67872/);
  assert.match(ramp,/No value extracted\. Verify the source/);
});
test("Only selected fields open for confirmation and original evidence is initially hidden",()=>{
  assert.match(ramp,/advanced\.hidden=true/);
  assert.match(ramp,/evidence\.hidden=true/);
  assert.match(ramp,/ramp-field-detail/);
  assert.match(ramp,/detail\.hidden=true/);
  assert.match(ramp,/fieldConfirm\.addEventListener\("click"/);
  assert.match(ramp,/fieldInput\.focus/);
  assert.match(ramp,/Show original document and colored regions/);
  assert.match(ramp,/evidence\.hidden=!evidence\.hidden/);
});
test("Reverse AI recheck is image-bound and cannot auto-save or auto-replace operator edits",()=>{
  assert.match(backend,/async function recheck\(req,principal\)/);
  assert.match(backend,/await sha256\(bytes\)!==record\.source_sha256/);
  assert.match(backend,/created_by:"eq\."\+principal\.user_id/);
  assert.ok(backend.includes('"/api/vision/recheck"'));
  assert.match(backend,/AI did not verify this field/);
  assert.match(backend,/approval_unlocked:false/);
  assert.match(ramp,/form\.append\("reviewed_document",JSON\.stringify\(doc\)\)/);
  assert.match(ramp,/checkedRevision=revision/);
  assert.match(ramp,/Meter readings or fuel totals are mathematically inconsistent/);
  assert.match(ramp,/ai_assessment_not_a_calibrated_confidence:true/);
});
test("Approve and upload remain gated; no ramp UI writes to company Excel",()=>{
  assert.match(review,/BillyReview\?\.canApprove/);
  assert.match(ramp,/window\.BillyReview\.canApprove=readyToApprove/);
  assert.match(ramp,/readyToApprove\(\)/);
  assert.match(ramp,/oldButton\.click\(\)/);
  assert.match(ramp,/rampAudit/);
  assert.match(review,/ramp_review:window\.BillyReview\?\.rampAudit/);
  assert.match(css,/\.ramp-primary\[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(ramp,/\/api\/vision\/approve|excel\.com|xlsx/i);
});

test("Absent-field button clears the value, skips AI lookup and retains human audit",()=>{
  assert.match(ramp,/create\("button","ramp-not-present","Not on document"\)/);
  assert.match(ramp,/fieldNotPresent\.addEventListener\("click"/);
  assert.match(ramp,/saveValue\(path,null\)/);
  assert.match(ramp,/notOnDocument\.add\(path\)/);
  assert.match(ramp,/notOnDocument\.delete\(path\)/);
  assert.match(ramp,/if\(notOnDocument\.has\(path\)\)/);
  assert.match(ramp,/form\.append\("not_on_document",JSON\.stringify\(\[\.\.\.notOnDocument\]\)\)/);
  assert.match(ramp,/not_on_document:\[\.\.\.notOnDocument\]/);
  assert.match(ramp,/pending===0&&\(revision===0\|\|checkedRevision===revision\)/);
  assert.match(css,/\.ramp-not-present\{/);
  assert.match(review,/not_on_document:window\.BillyReview\?\.rampAudit/);
  assert.match(backend,/function checkedAbsentPaths\(/);
  assert.match(backend,/skipped_not_on_document:absentPaths/);
  assert.match(backend,/review_metadata:\{not_on_document:absentPaths/);
});

test("Operator-confirmed fields turn blue with centered check and stay distinct from initial AI green",()=>{
  assert.match(css,/\.ramp-blue\{background:#72aff4!important\}/);
  assert.match(css,/\.ramp-segment-check\{/);
  assert.match(ramp,/if\(item\.level==="blue"\)\{/);
  assert.match(ramp,/create\("span","ramp-segment-check","✓"\)/);
  assert.match(ramp,/icon\.setAttribute\("aria-hidden","true"\)/);
  assert.doesNotMatch(ramp,/count\.textContent/);
  assert.match(ramp,/const totals=riskCounts\(\)/);
  assert.match(ramp,/state\.set\(path,\{level:"blue",reason:"Operator confirmed absent/);
  assert.match(ramp,/state\.set\(path,\{level:"blue",reason:"Operator accepted unclear/);
  assert.match(ramp,/state\.set\(path,\{level:"blue",reason:checkedRevision===revision/);
  assert.match(ramp,/humanReviewed\.has\(path\)\?"blue":"green"/);
  assert.match(ramp,/state\.set\(path,\{level:"red",reason:item\.reason/);
});

test("Blue is visually reviewed, but modified fields still require AI recheck before approval",()=>{
  assert.match(ramp,/const count=\{green:0,blue:0,yellow:0,red:0\}/);
  assert.match(ramp,/entry\.level==="green"\|\|entry\.level==="blue"/);
  assert.match(ramp,/const readyToApprove=\(\)=>!busy&&allResolved\(\)&&/);
  assert.match(ramp,/revision===0\|\|checkedRevision===revision/);
  assert.match(ramp,/const changed=value!==String\(before\?\?""\)/);
  assert.match(ramp,/revision\+\+;\s*checkedRevision=-1/);
  assert.match(ramp,/recheck\.hidden=needsReview\.length>0/);
  assert.match(ramp,/\(value\.level==="red"\|\|value\.level==="yellow"\)&&!humanReviewed\.has\(path\)/);
  assert.match(ramp,/statusText=allResolved\(\)/);
});

test("Billy Intelligence is explicitly opt-in and shown without replacing ramp review",()=>{
  assert.match(ramp,/Billy Intelligence/);
  assert.doesNotMatch(ramp,/previous team correction example\(s\) used for this scan/);
  assert.match(ramp,/intelCheckbox\.checked=false/);
  assert.match(ramp,/window\.BillyReview\.intelligenceOptIn=\(\)=>intelCheckbox\.checked/);
  assert.match(ramp,/window\.BillyReview\.intelligenceOptIn=null/);
  assert.match(ramp,/Learn from my corrections and confirmations \(team-only text examples\)/);
  assert.match(css,/\.ramp-intelligence-consent\{/);
  assert.match(review,/intelligence_opt_in:window\.BillyReview\?\.intelligenceOptIn\?\.\(\)===true/);
  assert.match(review,/manual_confirmations:window\.BillyReview\?\.rampAudit\?\.\(\)\?\.manual_confirmations\|\|\[\]/);
  assert.match(review,/intelligence:approvalResult\?\.intelligence\|\|null/);
});
test("Historical corrections are text-only, tenant-scoped, and never treated as current OCR values",()=>{
  assert.match(backend,/const INTELLIGENCE_EXCLUDED_FIELDS=new Set\(/);
  assert.match(backend,/function correctionLessons\(before,after,type\)/);
  assert.match(backend,/async function lookupIssueMemory\(principal,issues\)/);
  assert.match(backend,/organization_id:"eq\."\+principal\.organization_id/);
  assert.match(backend,/Document scans, entire invoices and handwritten signatures are never archived/);
  assert.match(backend,/Never copy numeric values or identifiers from examples/);
  assert.match(backend,/model_fine_tuned:false/);
  assert.match(backend,/const consent=data\.intelligence_opt_in===true/);
});

test("A missing fuel unit must not mark known meter readings as critical",()=>{
  const injected=ramp.replace("  function mount(result,endpoint,getHeaders,sourceFile){",
    "  window.__testClassify=classification;\n  function mount(result,endpoint,getHeaders,sourceFile){");
  const context={window:{BillyReview:{render:()=>{}}}};
  vm.runInNewContext(injected,context);
  const classify=context.window.__testClassify;
  assert.equal(typeof classify,"function");
  const doc={meter_start:"71058",meter_finish:"71072",delivered_quantity:"14",
    quantity_unit:null,aircraft_registration:"1719P",fueler_name:"EB"};
  const clear=field_path=>({field_path,visual_clarity:"clear",alternate_readings:[]});
  const unitWarning=["Fuel quantity unit missing or unreadable."];
  assert.equal(classify("meter_start",doc,"fuel_release",[clear("meter_start")],unitWarning).level,"green");
  assert.equal(classify("meter_finish",doc,"fuel_release",[clear("meter_finish")],unitWarning).level,"green");
  assert.equal(classify("delivered_quantity",doc,"fuel_release",[clear("delivered_quantity")],unitWarning).level,"green");
  const absent=classify("quantity_unit",doc,"fuel_release",[],unitWarning);
  assert.equal(absent.level,"yellow");
  assert.match(absent.reason,/Not on document/);
  const meterWarnings=[...unitWarning,"Meter arithmetic matches (14), but verify both original meter readings visually. Arithmetic is not proof of OCR accuracy."];
  assert.equal(classify("meter_start",doc,"fuel_release",[clear("meter_start")],meterWarnings).level,"yellow");
  assert.notEqual(classify("meter_start",doc,"fuel_release",[clear("meter_start")],meterWarnings).level,"red");
});

test("Competing readings override Gemini's own visually clear classification",()=>{
  const injected=ramp.replace("  function mount(result,endpoint,getHeaders,sourceFile){",
    "  window.__testClassify=classification;\n  function mount(result,endpoint,getHeaders,sourceFile){");
  const ctx={window:{BillyReview:{render:()=>{}}}};
  vm.runInNewContext(injected,ctx);
  const classify=ctx.window.__testClassify;
  const doc={aircraft_registration:"1719P",meter_start:"71058",release_number:"M 04569",
    fueler_name:"EB"};
  const region=(field_path,alternates,visual_clarity="clear")=>
    ({field_path,visual_clarity,alternate_readings:alternates});
  assert.equal(classify("aircraft_registration",doc,"fuel_release",[
    region("aircraft_registration",["17191"])
  ],[]).level,"yellow");
  assert.equal(classify("meter_start",doc,"fuel_release",[
    region("meter_start",["71053"])
  ],[]).level,"yellow");
  // A number printed with an optional one-letter prefix is not a competing digit reading.
  assert.equal(classify("release_number",doc,"fuel_release",[
    region("release_number",["04569"])
  ],[]).level,"green");
  assert.equal(classify("fueler_name",doc,"fuel_release",[
    region("fueler_name",["EO","EF"],"ambiguous")
  ],[]).level,"red");
});

test("Human checks create a separate Intelligence signal, not a calibrated AI confidence",()=>{
  assert.match(ramp,/manual_confirmations:\[\.\.\.humanReviewed\]/);
  assert.match(ramp,/ambiguity_acknowledgements:\[\.\.\.manualAcknowledged\]/);
  assert.match(backend,/function confirmationLessons\(before,after,type,regions,claims\)/);
  assert.match(backend,/const clarity=String\(region\?\.visual_clarity\|\|"unassessed"\)/);
  const confirmationBlock=backend.slice(backend.indexOf("function confirmationLessons("),
    backend.indexOf("const INTELLIGENCE_LOOKUP_MAX"));
  assert.doesNotMatch(confirmationBlock,/if\(!region\)continue/);
  assert.match(backend,/if\(!a\|\|!b\|\|a!==b\)continue/);
  assert.match(backend,/feedback_type:"confirmed"/);
  assert.match(backend,/Never assert certainty based on historical agreement/);
  assert.match(backend,/manual_confirmations:confirmationClaims/);
  assert.match(backend,/model_fine_tuned:false/);
});

test("Only matching values on identical files can turn yellow into previously verified blue",()=>{
  assert.match(backend,/function previouslyVerifiedPaths\(priorRows,fresh,type\)/);
  assert.match(backend,/previously_verified_paths:previouslyVerifiedPaths/);
  assert.match(backend,/now!==fieldAtPath\(latest,path,type\)/);
  assert.match(ramp,/entry.level==="yellow"&&previouslyVerified.has\(path\)/);
  assert.match(ramp,/entry.level="blue"/);
  assert.match(ramp,/Previously verified by an operator on this identical file/);
  assert.match(ramp,/New edits still require recheck/);
  assert.doesNotMatch(ramp,/entry.level!=="red"&&previouslyVerified.has\(path\)/);
});
