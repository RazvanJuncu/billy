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
  assert.match(html,/vision-review\.js\?v=0\.11\.2/);
  const uiVersion=html.match(/simple\.js\?v=(\d+)\.(\d+)\.(\d+)/);
  assert.ok(uiVersion && (+uiVersion[1]*1e6 + +uiVersion[2]*1e3 + +uiVersion[3]) >= 1003002);
  const cacheVersion=read("site/sw.js").match(/billydpi-orbit-v(\d+)-/);
  assert.ok(cacheVersion && Number(cacheVersion[1]) >= 58);
});

test("Multilingual extraction keeps source-language audit and exports English-readable fields",()=>{
  const ramp=read("site/ramp-review.js"),rampCss=read("site/ramp-review.css");
  assert.match(edge,/document_language:\{type:"string"\}/);
  assert.match(edge,/english_translations:ENGLISH_TRANSLATIONS/);
  assert.match(edge,/function applyEnglishTranslations\(sourceDoc,type,language,raw\)/);
  assert.match(edge,/translationNumberTokens\(source\)!==translationNumberTokens\(english\)/);
  assert.match(edge,/translation_metadata:translation/);
  assert.match(edge,/source_text:pair\.source_text/);
  assert.match(edge,/English translations are not supposed to be literal character matches/);
  assert.match(review,/translatedHandwritingKeys/);
  assert.match(review,/English meaning/);
  assert.match(review,/Raw handwriting/);
  assert.match(review,/translation:auditMeta\?\.translation\|\|null/);
  assert.match(review,/translation/i);
  assert.match(ramp,/translatedPaths/);
  assert.match(ramp,/entry\.level="yellow"/);
  assert.match(ramp,/Original \("/);
  assert.match(rampCss,/\.ramp-translation-note/);
  assert.match(read("site/review.css"),/\.review-translation-note/);
  assert.match(read("site/excel-preview.js"),/Excel Preview/);
});
