const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const html=read("site/index.html");
const css=read("site/brand.css");
const js=read("site/workspace.js");
test("Billy is a full-screen application shell rather than a marketing landing page",()=>{
  for(const name of ["studio-app","studio-rail","studio-stage","studio-inspector","mobile-dock"]){
    assert.ok(html.includes('class="'+name) || html.includes(" "+name),name);
  }
  assert.doesNotMatch(html,/<h1[^>]*>Your invoices/i);
  assert.match(css,/--black:#050607/);
  assert.match(css,/position:fixed;inset:0;display:grid/);
  assert.match(css,/@media\(max-width:720px\)/);
});
test("Original scan, OCR and editor hooks remain connected",()=>{
  for(const id of ["scanOpenCamera","scanImportPhoto","dropzone","filePicker","nativeGallery","nativeCapture","fixPerspective","replaceButton","scanButton","endpoint","connectButton","statusDot","statusText","ocrHint","settings","notification","resultToolbar","formattedOutput","rawOutput","outputPlaceholder","resultBody","pagePicker","outputFooter","downloadMd","downloadJson","scanVideo","scanCanvas","scanCapture","scanAuto","scanReset","scanRotate","scanApply","scanSave","scanUseOriginal","scannerClose"]){
    assert.match(html,new RegExp('id="'+id+'"'),"missing "+id);
  }
  assert.ok(html.indexOf('src="./perspective.js')<html.indexOf('src="./scanner.js'));
  assert.ok(html.indexOf('src="./scanner.js')<html.indexOf('src="./app.js'));
  assert.ok(html.indexOf('src="./app.js')<html.indexOf('src="./workspace.js'));
});
test("All desktop and mobile navigation controls are functional",()=>{
  for(const id of ["railCapture","railCamera","railImport","railReview","railEngine","topNew","desktopSource","desktopReview","mobileCaptureTab","mobileReviewTab","mobileEngineTab","reviewConnect","mobileFixButton","mobileReadButton"]){
    assert.match(html,new RegExp('id="'+id+'"'),"missing button "+id);
    assert.ok(js.includes('bind("'+id+'"'),"missing handler "+id);
  }
  assert.match(js,/billy:document-loaded/);
  assert.match(js,/billy:ocr-ready/);
  const app=read("site/app.js");
  assert.match(app,/dispatchEvent\(new CustomEvent\("billy:document-loaded"/);
  assert.match(app,/dispatchEvent\(new CustomEvent\("billy:ocr-ready"/);
});
test("Workflow uses real state transitions and source can be revisited",()=>{
  for(const [index,label] of ["Capture","Straighten","Extract","Review"].entries()){
    assert.match(html,new RegExp('data-stage="'+index+'"'));
    assert.match(html,new RegExp('step-title">'+label+'<'));
  }
  assert.match(css,/body\[data-view="review"\] \.source-panel\{display:none\}/);
  assert.match(js,/function showView\(view\)/);
  assert.match(js,/showView\("capture"\)/);
  assert.match(js,/showView\("review"\)/);
});
test("iPhone PWA and local-only scanner remain intact",()=>{
  assert.match(html,/apple-mobile-web-app-capable/);
  assert.match(html,/manifest.webmanifest/);
  assert.match(html,/capture="environment"/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(read("site/sw.js"),/"\.\/workspace.js"/);
  assert.equal(JSON.parse(read("site/manifest.webmanifest")).display,"standalone");
});
