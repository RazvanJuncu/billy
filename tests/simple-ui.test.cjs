const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const html=read("site/index.html"),css=read("site/simple.css"),flow=read("site/simple.js");
const app=read("site/app.js"),review=read("site/vision-review.js");
test("BillyDPI has only two prominent home choices and a sequential document workflow",()=>{
  assert.match(html,/id="simpleNewDocument"[^>]*class="simple-choice"|id="simpleNewDocument" class="simple-choice"/);
  assert.match(html,/id="simpleUploadedDocuments"[^>]*class="simple-choice"/);
  for(const id of ["simpleCapture","simpleAddFiles","simpleContinue","simpleRunProcess",
    "simpleDocumentsList","simpleBack","simpleExportCsv","simpleExportJson"]){
    assert.match(html,new RegExp('id="'+id+'"'),id);
    assert.match(flow,new RegExp('bind\\("'+id+'"'),"Unbound "+id);
  }
  assert.match(flow,/"new",\s*"uploaded",\s*"edit",\s*"process",\s*"review",\s*"upload"/);
  assert.match(flow,/billy:document-loaded/);
  assert.match(flow,/billy:ocr-ready/);
  assert.match(flow,/billy:document-approved/);
  assert.match(review,/dispatchEvent\(new CustomEvent\("billy:document-approved"/);
});
test("The new UI hides permanent rails and control center on desktop and mobile",()=>{
  assert.match(css,/\.studio-inspector,/);
  assert.match(css,/\.mobile-dock\{display:none!important\}/);
  assert.match(css,/body\[data-billy-screen="edit"\] \.source-panel/);
  assert.match(css,/body\[data-billy-screen="review"\] \.result-panel/);
  assert.match(css,/@media\(max-width:720px\)/);
});
test("UI only shows actionable steps, with honest incomplete backend state",()=>{
  assert.match(flow,/isOnline\(\)/);
  assert.match(flow,/action.disabled = !ready/);
  assert.match(html,/Upload to company Excel/);
  assert.match(html,/Not connected/);
  assert.match(flow,/not uploaded to company storage/);
  assert.match(flow,/sessionFiles/);
  assert.match(app,/window.BillyApp/);
  assert.match(app,/billy:process-complete/);
  assert.match(review,/Company storage and Excel are not connected/);
});
test("The visible interface is monochrome, borderless and has no gradient",()=>{
  assert.match(html,/<title>BillyDPI<\/title>/);
  assert.doesNotMatch(html,/class="auth-brand-tag"/);
  assert.doesNotMatch(read("site/accounts.css"),/radial-gradient|linear-gradient/);
  assert.doesNotMatch(css,/radial-gradient|linear-gradient|conic-gradient/i);
  assert.match(css,/background-image:none!important/);
  assert.match(css,/border:0!important/);
  assert.doesNotMatch(read("site/scanner.js"),/blue corner|#3a97ff|#297cd8/);
  assert.match(read("site/sw.js"),/"\.\/simple\.js"/);
  assert.match(read("site/sw.js"),/"\.\/simple\.css"/);
});
