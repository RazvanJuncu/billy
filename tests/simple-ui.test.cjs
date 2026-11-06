const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const html=read("site/index.html"),css=read("site/simple.css"),flow=read("site/simple.js");
const app=read("site/app.js"),review=read("site/vision-review.js");
test("BillyDPI has only two prominent home choices and a sequential document workflow",()=>{
  assert.match(html,/id="simpleNewDocument"[^>]*class="simple-choice"|id="simpleNewDocument" class="simple-choice"/);
  assert.match(html,/id="simpleUploadedDocuments"[^>]*class="simple-choice"/);
  for(const id of ["simpleCapture","simpleAddFiles","simpleContinue","simpleRunProcess",
    "simpleBack","simpleExportCsv","simpleExportJson"]){
    assert.match(html,new RegExp('id="'+id+'"'),id);
    assert.match(flow,new RegExp('bind\\("'+id+'"'),"Unbound "+id);
  }
  assert.match(html,/id="simpleDocumentsList"/);
  assert.match(flow,/\$\("simpleDocumentsList"\)/);
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

test("Greeting rotation uses 15 playful messages and the signed-in user's first name",()=>{
  const accounts=read("site/accounts.js");
  assert.match(html,/id="simpleGreetingTitle"/);
  assert.match(html,/id="simpleGreetingSubtitle"/);
  const matches=flow.match(/\["[^"\n]*\{name\}[^"\n]*",\s*"[^"\n]*"\]/g)||[];
  assert.equal(matches.length,15);
  assert.match(flow,/window\.setInterval\(rotateGreeting,6500\)/);
  assert.match(flow,/prefers-reduced-motion: reduce/);
  assert.match(flow,/billy:account-ready/);
  assert.match(accounts,/firstNameFor\(user\)/);
  assert.match(accounts,/firstName:firstNameFor\(user\)/);
});
test("Profile menu has a user icon, a chevron and working menu actions",()=>{
  const accounts=read("site/accounts.js");
  for(const id of ["profileWrap","profileMenu","profileMyAccount","profileWorkspace",
    "profileSignOut","accountButtonName"]){
    assert.match(html,new RegExp('id="'+id+'"'));
    assert.match(accounts,new RegExp(id));
  }
  assert.match(html,/id="accountButton"[^>]+aria-haspopup="menu"/);
  assert.match(accounts,/closeProfileMenu\(\)/);
  assert.match(accounts,/openAccountSheet\(true\)/);
  assert.match(accounts,/client\.auth\.signOut/);
  assert.match(css,/\.profile-menu\{/);
});
test("Card labels occupy separate rows and scan or add file cards use consistent icons",()=>{
  assert.match(css,/\.simple-choice-title\{\s*display:block/);
  assert.match(css,/\.simple-choice-caption\{\s*display:block/);
  assert.match(css,/\.simple-new \.simple-choice\{\s*display:flex!important;flex-direction:row!important/);
  assert.match(html,/Use your camera/);
  assert.match(html,/PDF or image/);
  assert.match(html,/class="ui-icon"/);
  assert.match(css,/\.simple-choice:active/);
});
test("No em dashes in user-facing BillyDPI site assets",()=>{
  const files=["site/index.html","site/app.js","site/simple.js","site/accounts.js",
    "site/vision-review.js","site/scanner.js","site/workspace.js",
    "site/manifest.webmanifest","site/simple.css","site/accounts.css","site/brand.css"];
  for(const name of files) assert.equal(read(name).includes("\u2014"),false,name);
});
