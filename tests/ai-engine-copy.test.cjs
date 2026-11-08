const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const html=read("site/index.html"),simple=read("site/simple.js");
const app=read("site/app.js"),regions=read("site/vision-regions.js");
const ramp=read("site/ramp-review.js"),review=read("site/vision-review.js");
const edge=read("supabase/functions/billy-vision/index.ts");

test("User-facing Billy copy uses AI engine rather than mentioning the vendor",()=>{
  assert.doesNotMatch(html,/Gemini/i);
  for(const text of [simple,app,ramp]){
    assert.doesNotMatch(text,/"[^"\n]*Gemini[^"\n]*"/i);
  }
  assert.match(html,/>Retry AI engine connection<\/button>/);
  assert.match(simple,/Connecting to the AI engine/);
  assert.match(simple,/AI engine connection failed:/);
  assert.match(app,/AI engine connection timed out/);
  assert.match(app,/AI engine connected/);
  assert.match(ramp,/The AI engine is checking your values/);
  assert.match(review,/Download original AI engine JSON \(unverified\)/);
  assert.match(regions,/AI engine: /);
  assert.doesNotMatch(regions,/TrOCR|trocr|AI engine \\+ local /);
  assert.doesNotMatch(regions,/Gemini finished|Gemini: |Gemini extraction|Gemini \+ local/);
});
test("Backend errors are brand-neutral while real provider and model remain auditable",()=>{
  for(const line of edge.split("\n").filter(line=>/return error\("/.test(line))){
    assert.doesNotMatch(line,/Gemini/i);
  }
  assert.match(edge,/provider:"gemini"/);
  assert.match(edge,/GEMINI_API_KEY/);
  assert.match(edge,/model:MODEL/);
  assert.match(review,/review_status:"unverified_gemini_output"/);
});
