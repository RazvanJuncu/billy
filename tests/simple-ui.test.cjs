const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const html=read("site/index.html"),css=read("site/simple.css"),flow=read("site/simple.js");
const app=read("site/app.js"),review=read("site/vision-review.js");
test("Phones and tablets start with only the centered Upload New button and an opt-in reveal control",()=>{
  assert.match(html,/dataset\.billyMobile = "1"/);
  assert.match(html,/navigator\.maxTouchPoints > 1/);
  assert.match(html,/pointer: coarse/);
  assert.match(html,/id="simpleQuickSnap"/);
  assert.match(html,/id="simpleRevealFunctions"/);
  assert.match(html,/aria-expanded="false" aria-controls="simpleFunctionArea"/);
  assert.match(html,/class="simple-quick-art"/);
  assert.match(html,/>Tap to QuickScan<\/span>/);
  assert.match(css,/body:not\(\.billy-functions-revealed\) \.simple-home-expanded\{display:none!important\}/);
  assert.match(css,/body:not\(\.billy-functions-revealed\) \.studio-header\{display:none!important\}/);
  assert.match(css,/body\.billy-functions-revealed \.simple-home-expanded\{display:contents\}/);
  assert.match(flow,/bind\("simpleRevealFunctions", toggleRevealedFunctions\)/);
  assert.match(flow,/body\.classList\.toggle\("billy-functions-revealed"\)/);
  assert.match(flow,/aria-expanded/);
  assert.doesNotMatch(flow,/localStorage\.setItem\("billy-functions-revealed"/);
});

test("QuickScan uses the supplied scan logo, with obvious clickable feedback",()=>{
  const artwork=read("site/upload-new-mark.svg");
  const sw=read("site/sw.js");
  assert.match(html, /src="\.\/upload-new-mark\.svg\?v=2"/);
  assert.doesNotMatch(html, /<svg class="simple-quick-art"/);
  assert.match(artwork, /viewBox="0 0 320 320"/);
  assert.match(artwork, /cx="134\.93"/);
  assert.match(artwork, /cx="161\.81"/);
  assert.match(html, /class="simple-quick-cta">Tap to QuickScan<\/span>/);
  assert.doesNotMatch(html, /class="simple-quick-label">Upload New/);
  assert.doesNotMatch(html, /simple-quick-cta-arrow/);
  assert.match(css, /#simpleQuickSnap\{[\s\S]*?border:0!important/);
  assert.doesNotMatch(css, /border:1px solid #363a40!important/);
  assert.match(css, /box-shadow:0 14px 34px/);
  assert.match(css, /#simpleQuickSnap:active\{/);
  assert.match(css, /#simpleQuickSnap:focus-visible\{/);
  assert.match(sw, /"\.\/upload-new-mark\.svg"/);
});

test("BillyDPI has a responsive Quick Snap action and sequential document workflow",()=>{
  assert.match(html,/id="simpleQuickSnap"/);
  assert.match(flow,/bind\("simpleQuickSnap", startSnapCamera\)/);
  assert.match(css,/any-pointer:coarse/);
  assert.match(css,/background:#2b2d30!important;color:#f2f2f2!important/);
  assert.doesNotMatch(css,/background:#f0f0f0!important;color:#101112!important/);
  assert.match(css,/\.simple-home \.simple-choice-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html,/id="simpleNewDocument"[^>]*class="simple-choice"|id="simpleNewDocument" class="simple-choice"/);
  assert.match(html,/id="simpleUploadedDocuments"[^>]*class="simple-choice"/);
  for(const id of ["simpleCapture","simpleAddFiles","simpleContinue","simpleRunProcess",
    "simpleBack","simpleExportCsv","simpleExportJson"]){
    assert.match(html,new RegExp('id="'+id+'"'),id);
    assert.match(flow,new RegExp('bind\\("'+id+'"'),"Unbound "+id);
  }
  assert.match(html,/id="simpleDocumentsList"/);
  assert.match(flow,/\$\("simpleDocumentsList"\)/);
  assert.match(flow,/"new",\s*"uploaded",\s*"edit",\s*"type",\s*"process",\s*"review",\s*"upload"/);
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
test("UI only shows actionable steps, with persistent Gemini data but no company Excel connector",()=>{
  assert.match(flow,/isOnline\(\)/);
  assert.match(flow,/action.disabled = !ready/);
  assert.match(html,/Upload to company Excel/);
  assert.match(html,/Not connected/);
  assert.match(flow,/Some older records contain only extracted fields/);
  assert.match(flow,/api\/vision\/records/);
  assert.match(flow,/sessionFiles/);
  assert.match(app,/window.BillyApp/);
  assert.match(app,/billy:process-complete/);
  assert.match(review,/Original archival follows separately/);
  assert.match(review,/company Excel is not updated/);
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

test("One new greeting per refresh, without cycling, mixing named and playful copy",()=>{
  const accounts=read("site/accounts.js");
  const matches=flow.match(/\["[^"\n]+",\s*"[^"\n]+"\]/g)||[];
  assert.equal(matches.length,15);
  const named=matches.filter(x=>x.includes("{name}"));
  assert.ok(named.length>=3 && named.length<15);
  assert.match(flow,/Look who's back, back again/);
  assert.match(flow,/localStorage\.getItem/);
  assert.match(flow,/localStorage\.setItem/);
  assert.match(flow,/greetingSelected/);
  assert.doesNotMatch(flow,/setInterval\(rotateGreeting|setTimeout\(rotateGreeting/);
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
    "site/manifest.webmanifest","site/simple.css","site/accounts.css","site/brand.css",
    "site/preloader.css","site/preloader.js"];
  for(const name of files) assert.equal(read(name).includes("\u2014"),false,name);
});

test("Both loaders rotate round circles and morph to the exact BillyDPI mark",()=>{
  const css=read("site/preloader.css"),preloader=read("site/preloader.js");
  const logo=read("site/billydpi-logo.svg");
  assert.match(html,/id="billySplash"/);
  assert.match(html,/id="billyWorkLoader"/);
  assert.equal((html.match(/class="billy-loader-symbol"/g)||[]).length,2);
  assert.equal((html.match(/class="billy-bottom-circle" cx="146" cy="206" r="95"/g)||[]).length,2);
  assert.equal((html.match(/class="billy-top-circle" cx="146" cy="18" r="63"/g)||[]).length,2);
  assert.match(css,/@keyframes billy-circle-orbit/);
  assert.match(css,/rotate\(360deg\)/);
  assert.match(css,/transform-origin:146px 206px/);
  assert.match(css,/translate\(-46px,50px\) scale\(1\.428571429,0\.920634921\)/);
  assert.match(css,/scale\(1\.421052632,0\.610526316\)/);
  assert.match(logo,/<ellipse id="billydpi-head" cx="100" cy="68" rx="90" ry="58"/);
  assert.match(logo,/<ellipse id="billydpi-base" cx="146" cy="206" rx="135" ry="58"/);
  // Logo proportions are not changed: 2:3 width ratio in the circular state.
  assert.ok(Math.abs(63/95-2/3)<.005);
  assert.match(preloader,/animationiteration/);
  assert.match(preloader,/\.classList\.add\("is-settling"\)/);
  assert.match(preloader,/\.classList\.add\("is-revealing"\)/);
  assert.match(preloader,/\.classList\.add\("is-leaving"\)/);
  assert.match(preloader,/billy:auth-resolved/);
  assert.match(preloader,/window\.addEventListener\("load"/);
  assert.match(preloader,/window\.BillyLoader=\{startWork,endWork/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css,/squash|jiggle|billy-head-path|billy-head-deform|billy-base-deform/i);
  assert.match(read("site/accounts.js"),/billy:auth-resolved/);
  assert.match(read("site/scanner.js"),/BillyLoader\?\.startWork\("image"/);
  assert.match(read("site/scanner.js"),/BillyLoader\?\.endWork\("crop"/);
  assert.match(app,/BillyLoader\?\.startWork\("ai"/);
  assert.match(app,/BillyLoader\?\.endWork\("ai"/);
  assert.match(read("site/sw.js"),/preloader\.js/);
  assert.match(read("site/sw.js"),/preloader\.css/);
});

test("Workspace label and all diagonal card arrows are removed",()=>{
  assert.doesNotMatch(html,/class="simple-home-label"/);
  assert.doesNotMatch(html,/class="simple-choice-arrow"/);
  assert.doesNotMatch(html,/Your workspace is ready\./);
  assert.doesNotMatch(html,/>Workspace<\/span><\/button>/);
  assert.doesNotMatch(html,/id="simpleUploadedBackToHome"/);
});


test("Uploaded Documents has distinct monochrome icons for all service categories",()=>{
  const index=read("site/documents-index.js");
  const css=read("site/simple.css");
  for(const category of ["Fuel","Handling","Taxi","Catering","Hotel","City Tax","Parking",
    "Crew Expenses","Aircraft Supplies","Pax Gifts","Other","Unassigned"]){
    assert.ok(index.includes(category+":" )||index.includes("'"+category+"':"),
      "No icon for "+category);
  }
  assert.match(index,/createElementNS\("http:\/\/www\.w3\.org\/2000\/svg","svg"\)/);
  assert.match(index,/header\.append\(serviceIcon\(key\)\)/);
  assert.match(index,/button\.prepend\(serviceIcon\(node\.__billyDocument\.service\)\)/);
  assert.match(css,/\.billy-service-icon/);
  assert.match(read("site/index.html"),/documents-index\.js\?v=1\.4\.0/);
});

test("Uploaded archive opens a saved-document preview instead of downloading JSON",()=>{
  const flow=read("site/simple.js"),preview=read("site/document-preview.js");
  const index=read("site/documents-index.js"),html=read("site/index.html");
  assert.match(flow,/BillyDocumentPreview\?\.open\(record\)/);
  assert.doesNotMatch(flow,/link\.download="billy-"\+record\.id/);
  assert.match(preview,/function open\(record\)/);
  assert.match(preview,/aria-modal/);
  assert.match(preview,/Original PDF\/photo is not archived/);
  assert.match(preview,/function exportJSON\(record\)/);
  assert.match(preview,/addField\(brief,"Aircraft"/);
  assert.match(preview,/addField\(brief,"Airport"/);
  assert.match(preview,/document\.createElement\(tag\)/);
  assert.match(index,/Fuel:\['path:M4 21V6/);
  assert.match(html,/document-preview\.js\?v=1\.2\.0/);
  assert.match(read("site/sw.js"),/document-preview\.js/);
});

test("Uploaded Documents defaults to a visual hub with no recent documents",()=>{
  const index=read("site/documents-index.js");
  const hub=read("site/documents-hub.js");
  const css=read("site/simple.css");
  assert.match(index,/mode:"Home",aircraft:null/);
  assert.match(index,/function navigate\(mode,aircraft=null\)/);
  assert.match(index,/function back\(\)/);
  assert.match(index,/function start\(list\)/);
  assert.match(flow,/BillyDocumentsIndex\?\.start\?\.\(list\)/);
  assert.match(flow,/BillyDocumentsIndex\?\.back\?\.\(\)/);
  assert.match(hub,/const views=\["All","Aircraft","Services","Airports","Vendors"\]/);
  assert.match(hub,/billy-hub-circle/);
  assert.match(css,/#simpleUploaded\[data-billy-doc-view="Home"\] #simpleDocumentsList/);
  assert.match(hub,/if\(state.mode==="Home"\)/);
  assert.match(hub,/if\(state.mode!=="Aircraft"\)return/);
  assert.match(read("site/index.html"),/documents-hub\.js\?v=1\.2\.0/);
});
test("Fleet is explicitly registered; no OCR-constructed aircraft cards",()=>{
  const hub=read("site/documents-hub.js");
  const index=read("site/documents-index.js");
  for(const reg of ["YR-WNT","YR-DSR","YR-WHO","YR-DDN","YR-WSF","YR-NKA","YR-BIG"]){
    assert.ok(hub.includes('registration:"'+reg+'"'),"Missing fleet aircraft: "+reg);
  }
  assert.equal((hub.match(/registration:"YR-[A-Z]{3}"/g)||[]).length,7);
  assert.match(hub,/photo:null/);
  assert.match(hub,/const unmatched=state\.records\.filter/);
  assert.match(index,/knownAircraft\.has\(node\.__billyDocument\.aircraft\)/);
  assert.match(hub,/billy-fleet-card/);
  assert.match(hub,/billy-fleet-hero/);
  assert.match(read("site/simple.css"),/prefers-reduced-motion:reduce/);
});

test("Uploaded Documents has neutral headings and only one proper back chevron",()=>{
  const hub=read("site/documents-hub.js");
  const css=read("site/simple.css");
  const flow=read("site/simple.js");
  assert.doesNotMatch(hub,/billy-hub-home/);
  assert.doesNotMatch(hub,/icon\("All","billy-hub-back-icon"\)/);
  assert.doesNotMatch(hub,/const back=make\("button","billy-hub-back"\)/);
  assert.match(flow,/if\(now==="uploaded"&&window\.BillyDocumentsIndex\?\.back\?\.\(\)\)return/);
  assert.doesNotMatch(flow,/bind\("simpleUploadedBackToHome"/);
  assert.match(css,/#simpleUploaded \.billy-hub-title/);
  assert.match(css,/-webkit-text-fill-color:#f1f1f1!important/);
  assert.match(hub,/Airports:\["M20 10c0 5/);
  assert.match(hub,/Vendors:\["M20\.6 13\.1/);
  assert.match(hub,/All:\["M8 3h11/);
  assert.match(read("site/index.html"),/documents-hub\.js\?v=1\.2\.0/);
});
