const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");

const html=read("site/index.html");
const scanner=read("site/scanner.js");
const simple=read("site/simple.js");
const app=read("site/app.js");
const ramp=read("site/ramp-review.js");
const rampCss=read("site/ramp-review.css");
const simpleCss=read("site/simple.css");

test("Scanner removes decorative breadcrumb and trailing arrows, without changing scanner controls",()=>{
  assert.doesNotMatch(html,/\/ SCANNER/);
  assert.match(scanner,/mode === "camera" \? "Capture document" : "Adjust Corners"/);
  assert.doesNotMatch(scanner,/Adjust the document/);
  assert.match(html,/id="scanApply"[^>]*>Use this scan<\/button>/);
  assert.doesNotMatch(html,/Use this scan →/);
  assert.match(html,/id="scanAuto"/);
  assert.match(html,/id="scanReset"/);
  assert.match(html,/id="scanRotate"/);
  assert.match(html,/id="scanButton"[^>]*><span id="scanLabel">Select a document first<\/span><\/button>/);
});

test("Document classification uses a clear title and arrow-free choice cards",()=>{
  assert.match(html,/What kind of document is this\?/);
  assert.doesNotMatch(html,/DOCUMENT CLASSIFICATION/);
  assert.doesNotMatch(html,/Choose the correct type before Billy sends it to Gemini/);
  assert.doesNotMatch(html,/simple-type-arrow/);
  assert.doesNotMatch(simpleCss,/\.simple-type-kicker/);
  assert.doesNotMatch(simpleCss,/\.simple-type-help/);
  assert.match(html,/id="simpleChooseInvoice"/);
  assert.match(html,/id="simpleChooseFuelRelease"/);
  assert.match(html,/<span>Process document<\/span><\/button>/);
  // Continue is navigation: preserve its arrow, unlike other action buttons.
  assert.match(html,/id="simpleContinue"[\s\S]*?<span>Continue<\/span><svg[^>]*>[\s\S]*?<\/svg><\/button>/);
});

test("Connected processing and completed extraction are quiet while errors remain visible",()=>{
  assert.doesNotMatch(simple,/Gemini connected\. Ready to process\./);
  assert.match(simple,/\$\("simpleProcessStatus"\)\.hidden = ready/);
  assert.match(simple,/Gemini connection failed:/);
  assert.match(simple,/Connecting to Billy Gemini cloud/);
  assert.match(simpleCss,/\.simple-process-status\[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(app,/Check the extracted values against the original before approval/);
  assert.match(app,/showNotification\("Could not scan this document:/);
});

test("Ramp review hides redundant counts and helper copy but keeps review and consent",()=>{
  assert.doesNotMatch(ramp,/BILLY \/ RAMP REVIEW/);
  assert.doesNotMatch(ramp,/ramp-kicker|ramp-count|count\.textContent/);
  assert.match(ramp,/create\("h3","ramp-heading","Document check"\)/);
  assert.match(rampCss,/\.formatted-output \.ramp-heading\{/);
  assert.match(rampCss,/color:#f5f5f5!important/);
  assert.match(ramp,/ramp-jar/);
  assert.match(ramp,/ramp-segment-check/);
  assert.doesNotMatch(ramp,/previous team correction example\(s\)/);
  assert.doesNotMatch(ramp,/Opt in only for documents your team is allowed to retain/);
  assert.match(ramp,/Learn from my corrections \(team-only text examples; no image archive\)/);
  assert.match(ramp,/intelCheckbox\.checked=false/);
  assert.match(ramp,/Recheck with AI/);
  assert.match(ramp,/Approve & continue/);
});
