const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const html=read("site/index.html");
const installer=read("site/install.html");
const guide=read("site/install.js");
const manifest=JSON.parse(read("site/manifest.webmanifest"));
const legacy=JSON.parse(read("site/snap.webmanifest"));
const sw=read("site/sw.js");

test("Billy uses one installable identity and links to the installer from the homepage and account menu",()=>{
  assert.equal(manifest.name,"BillyDPI");
  assert.equal(manifest.start_url,"./");
  assert.deepEqual(legacy,manifest);
  assert.match(html,/id="billyManifest" href="\.\/manifest\.webmanifest"/);
  assert.match(installer,/rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html,/class="billy-install-guide"/);
  assert.match(html,/class="profile-install-link"/);
  assert.doesNotMatch(html,/Get Billy Crew/);
  assert.doesNotMatch(installer,/Billy Crew|openCrew|\?crew=1/);
});

test("The installation guide walks iPhone, iPad, Android, Samsung and Huawei users through installing Billy",()=>{
  for(const id of ["platformChoice","desktopGuide","mobileGuide","qrCode","copyLink",
    "installButton","steps","openBilly"]){
    assert.match(installer,new RegExp('id="'+id+'"'),id);
  }
  assert.match(guide,/detectPlatform/);
  assert.match(guide,/iphone\|ipad\|ipod/i);
  assert.match(guide,/huawei\|honor\|harmonyos\|emui/i);
  assert.match(guide,/beforeinstallprompt/);
  assert.match(guide,/Open Billy/);
  assert.match(guide,/Add to Home Screen/);
  assert.match(guide,/navigator\.clipboard\.writeText\(PUBLIC_INSTALL_URL\)/);
  assert.match(guide,/prompt\.prompt\(\)/);
  assert.match(guide,/location\.replace\("\.\/"\)/);
});

test("The QR code embeds only the public guide address without personal tokens",()=>{
  assert.match(guide,/https:\/\/razvanjuncu\.github\.io\/billy\/install\.html/);
  assert.match(guide,/QR_ROWS/);
  assert.match(guide,/createElementNS/);
  assert.doesNotMatch(installer,/api\.qrserver|quickchart|chart\.googleapis/);
  assert.doesNotMatch(guide,/fetch\(/);
  assert.doesNotMatch(installer,/access_token|password=|auth\/callback/i);
});

test("Installation guide remains cached separately from main app shell",()=>{
  for(const item of ["./install.html","./install.css","./install.js"])assert.ok(sw.includes('"'+item+'"'));
  assert.match(sw,/pathname\.endsWith\("\/install\.html"\)/);
  assert.match(sw,/cache\.put\(fallback,copy\)/);
  assert.match(guide,/display-mode: standalone/);
});
