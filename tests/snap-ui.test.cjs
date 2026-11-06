const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const html=read("site/index.html");
const simple=read("site/simple.js");
const scanner=read("site/scanner.js");
const accounts=read("site/accounts.js");
const styles=read("site/simple.css");
const manifest=JSON.parse(read("site/manifest.webmanifest"));

test("Old Billy Crew and BillySnap links now open the same Billy home",()=>{
  assert.equal(manifest.name,"BillyDPI");
  assert.equal(manifest.start_url,"./");
  assert.match(html,/url\.searchParams\.has\("crew"\)/);
  assert.match(html,/url\.searchParams\.has\("snap"\)/);
  assert.match(html,/history\.replaceState/);
  assert.doesNotMatch(html,/dataset\.billySnap = "1"/);
  assert.doesNotMatch(html,/document\.title = "Billy Crew"/);
  assert.match(simple,/showScreen\("home"\)/);
});

test("Mobile Upload New opens the shared scanner; cancel returns to the simple home",()=>{
  assert.match(html,/id="simpleQuickSnap"/);
  assert.match(html,/>Upload New<\/span>/);
  assert.match(simple,/bind\("simpleQuickSnap", startSnapCamera\)/);
  assert.match(simple,/function startSnapCamera\(\)/);
  assert.match(simple,/BillyAccounts\?\.active\?\.\(\)/);
  assert.match(simple,/BillyScanner\?\.startCamera\?\.\(\)/);
  const functionSource=simple.slice(simple.indexOf("function startSnapCamera"),simple.indexOf("function toggleRevealedFunctions"));
  assert.doesNotMatch(functionSource,/showScreen\("new"\)/);
  assert.match(scanner,/close:hideOverlay/);
  assert.match(styles,/body:not\(\.billy-functions-revealed\) \.studio-header/);
  assert.match(accounts,/persistSession:true/);
});

test("Original document workflow is shared and does not simulate corporate upload",()=>{
  assert.match(simple,/billy:document-loaded/);
  assert.match(simple,/billy:ocr-ready/);
  assert.match(simple,/billy:document-approved/);
  assert.match(simple,/showScreen\("upload"\)/);
  assert.match(html,/id="simpleExportCsv"/);
  assert.match(html,/id="simpleExportJson"/);
  assert.match(html,/Company Excel upload is not connected yet/);
  assert.match(html,/id="filePicker"/);
  assert.match(scanner,/onUse\(file\)/);
});
