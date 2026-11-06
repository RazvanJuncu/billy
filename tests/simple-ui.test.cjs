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

test("Original logo splash and inline processing loader use the same vector and are wired",()=>{
  const preloader=read("site/preloader.js"),css=read("site/preloader.css"),scanner=read("site/scanner.js"),accounts=read("site/accounts.js");
  assert.match(html,/id="billySplash"/);
  assert.match(html,/id="billyWorkLoader"/);
  assert.equal((html.match(/class="billy-loader-symbol"/g)||[]).length,2);
  assert.equal((html.match(/cx="100" cy="68" rx="90" ry="58"/g)||[]).length,2);
  assert.equal((html.match(/cx="146" cy="206" rx="135" ry="58"/g)||[]).length,2);
  assert.match(preloader,/window\.BillyLoader = \{startWork,endWork/);
  assert.match(preloader,/billy:auth-resolved/);
  assert.match(preloader,/window\.addEventListener\("load"/);
  assert.match(preloader,/\.classList\.add\("is-revealing"\)/);
  assert.match(preloader,/\.classList\.add\("is-leaving"\)/);
  assert.match(css,/@keyframes billy-head-path/);
  assert.doesNotMatch(css,/billy-head-deform|billy-base-deform|billy-top-squash|billy-bottom-squash/);
  assert.equal((html.match(/class="billy-top-flight"/g)||[]).length,2);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(accounts,/billy:auth-resolved/);
  assert.match(scanner,/BillyLoader\?\.startWork\("image"/);
  assert.match(scanner,/BillyLoader\?\.endWork\("image"/);
  assert.match(scanner,/BillyLoader\?\.startWork\("crop"/);
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
  assert.match(html,/>Home<\/span><\/button>/);
});

test("Magnetic orbit stays outside the lower oval for the entire flight",()=>{
  const css=read("site/preloader.css"),html=read("site/index.html"),js=read("site/preloader.js");
  assert.match(css,/--billy-motion-cycle:2350ms/);
  assert.match(js,/const cycleMs = 2350/);
  assert.doesNotMatch(css,/scale\(|squash|deform|jiggle|bounce/i);
  assert.doesNotMatch(html,/billy-top-squash|billy-bottom-squash/);
  const segment=css.match(/@keyframes billy-head-path\{([\s\S]*?)\n\}/);
  assert.ok(segment,"The magnetic orbit must be defined");
  const frames=[...segment[1].matchAll(/([\d.]+)%\{transform:translate\(([-\d.]+)px,([-\d.]+)px\);/g)]
    .map(m=>({t:+m[1],x:100+Number(m[2]),y:68+Number(m[3])}));
  assert.ok(frames.length>=18);
  assert.equal(frames[0].t,0);
  assert.equal(frames.at(-1).t,100);
  assert.deepEqual([frames[0].x,frames[0].y],[100,68]);
  assert.deepEqual([frames.at(-1).x,frames.at(-1).y],[100,68]);
  let clearance=Infinity;
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1],b=frames[i];
    assert.ok(b.t>a.t,"Timestamps must increase");
    for(let j=0;j<=100;j++){
      const u=j/100,x=a.x+(b.x-a.x)*u,y=a.y+(b.y-a.y)*u;
      clearance=Math.min(clearance,Math.hypot((x-146)/230,(y-206)/123));
    }
  }
  assert.ok(clearance>1.06,"Upper oval must keep an air gap: "+clearance);
  assert.match(css,/94%\{transform:translate\(0px,0px\)/);
  assert.match(css,/100%\{transform:translate\(0px,0px\)/);
});
