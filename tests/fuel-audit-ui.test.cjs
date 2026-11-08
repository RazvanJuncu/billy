const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const review=read("site/vision-review.js");
const simple=read("site/simple.js");
const css=read("site/review.css");
const html=read("site/index.html");
const edge=read("supabase/functions/billy-vision/index.ts");

test("Fuel Review keeps meter values separate and rechecks them in browser",()=>{
  for(const value of ["meter_start","meter_finish","delivered_quantity"]){
    assert.ok(review.includes(value));
    assert.ok(edge.includes(value));
  }
  assert.match(review,/function localMeterCheck\(doc\)/);
  assert.match(review,/METER MISMATCH/);
  assert.match(review,/arithmetic is not OCR proof/);
  assert.match(review,/review-meter-check/);
  assert.match(css,/review-meter-check/);
});

test("Original form label and handwriting remain distinct from interpretation",()=>{
  assert.match(review,/Original field label/);
  assert.match(review,/Raw handwriting/);
  assert.match(review,/interpreted_as/);
  assert.match(edge,/interpreted_as:textSchema/);
  assert.match(edge,/!FUEL_FIELDS\.includes\(v\)/);
});

test("Original Gemini draft can be exported before approval and is never overwritten",()=>{
  assert.match(review,/function exportRawJSON/);
  assert.match(review,/unverified_gemini_output/);
  assert.match(review,/Download original AI engine JSON \(unverified\)/);
  assert.match(review,/original_extraction:original/);
  assert.match(review,/changes_from_original:auditChanges\(\)/);
  assert.match(simple,/original_extraction:initial/);
  assert.match(simple,/changes_from_original:changes/);
  assert.match(edge,/extracted_data:fields/);
  assert.match(edge,/reviewed_data:checked/);
  assert.doesNotMatch(review,/GEMINI_API_KEY/);
});

test("Review highlights uncertain evidence and browser cache version is advanced",()=>{
  assert.match(review,/flaggedPaths/);
  assert.match(review,/review-field-alert/);
  assert.match(css,/review-field-alert/);
  assert.match(html,/vision-review\.js\?v=0\.10\.3/);
  assert.match(html,/simple\.js\?v=1\.2\.11/);
  assert.match(read("site/sw.js"),/v43-intelligence-confirmations/);
});
