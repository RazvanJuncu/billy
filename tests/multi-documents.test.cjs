const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const edge=read("supabase/functions/billy-vision/index.ts");
const client=read("site/multi-documents.js");
const app=read("site/app.js");

test("classifier detects paper boundaries without adding a second AI request",()=>{
  assert.match(edge,/documents:\{type:"array",maxItems:4/);
  assert.match(edge,/required:\["status","profile","expense_category","multiple_documents_visible","nested_documents","documents","reason"\]/);
  assert.match(edge,/coordinates are INTEGERS|Coordinates are INTEGERS/);
  assert.match(edge,/documentBoxes\(data\.documents,data\.multiple_documents_visible\)/);
  assert.match(edge,/Multiple physical documents detected\. Review their boundaries/);
  assert.match(app,/await window\.BillyNested\.start\(currentFile,responseBody\.classification\)/);
  assert.doesNotMatch(app,/multi.*\/api\/vision\/separate/i);
});

test("unreliable, overlapping and single guessed regions never become two documents",()=>{
  const start=edge.indexOf("function validDocumentBox(");
  const end=edge.indexOf("// Classifier sees only",start);
  assert.ok(start>0&&end>start);
  const context={Number,Math};
  vm.runInNewContext(edge.slice(start,end)+"\nthis.validate=documentBoxes;",context);
  const box=(x1,y1,x2,y2)=>({label:"A",x1,y1,x2,y2});
  const check=(boxes,multiple)=>Array.from(context.validate(boxes,multiple));
  assert.equal(check([box(0,0,450,500),box(550,0,1000,500)],true).length,2);
  assert.equal(check([box(0,0,1000,1000)],true).length,0);
  assert.equal(check([box(0,0,500,500),box(10,10,490,490)],true).length,0);
  assert.equal(check([box(0,0,500,500),box(510,0,1000,500)],false).length,0);
  assert.equal(check([box(-1,0,500,500),box(510,0,1000,500)],true).length,0);
  assert.equal(check([box(0,0,60,500),box(510,0,1000,500)],true).length,0);
  assert.equal(check([box(0,0,500,500),box(510,0,1000,500),box(0,500,500,1000),box(510,500,1000,1000),box(0,0,200,200)],true).length,4);
});

test("separation stays on-device with explicit human crop confirmation",()=>{
  assert.match(client,/const normalize=regions/);
  assert.match(client,/if\(!validBox\(b\)\)throw Error/);
  assert.match(client,/canvas\.getContext\("2d"\)\.drawImage/);
  assert.match(client,/new File\(\[blob\],filename/);
  assert.match(client,/pointerdown/);
  assert.match(client,/pointermove/);
  assert.match(client,/window\.BillyApp\.openFile\(file\)/);
  assert.match(client,/session\.completed\.add\(session\.selected\)/);
  assert.match(client,/Next separated document/);
  assert.match(client,/billy:document-approved/);
  assert.match(read("site/index.html"),/Full photo \/ multiple docs/);
  assert.match(read("site/index.html"),/nested-documents\.js\?v=1\.3\.0/);
  assert.match(read("site/sw.js"),/multi-documents\.css/);
});

test("a composite image cannot silently enter one-document approval",()=>{
  assert.match(app,/classification\?\.multiple_documents_visible/);
  assert.match(app,/window\.BillyNested\?\.start/);
  assert.match(app,/if\s*\(responseBody\.classification_required\)/);
  const block=app.slice(app.indexOf("if (responseBody.classification_required)"),app.indexOf("if (!(responseBody.invoice"));
  assert.match(block,/return;/);
  assert.doesNotMatch(block,/billy:ocr-ready/);
});
