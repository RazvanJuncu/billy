const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const html=read("site/index.html");
const installer=read("site/install.html");
const js=read("site/install.js");
const manifest=JSON.parse(read("site/snap.webmanifest"));
const sw=read("site/sw.js");
test("Billy homepage prioritizes Quick Snap without advertising the legacy companion",()=>{
  assert.doesNotMatch(html, /class="crew-install-cta" href="\.\/install\.html"/);
  assert.doesNotMatch(html, /Get Billy Crew/);
  assert.match(html, /id="simpleQuickSnap"/);
  assert.equal(manifest.start_url,"./?crew=1");
  assert.match(html,/params\.get\("crew"\)/);
});
test("Installer has dedicated Crew manifest and device guide/QR states",()=>{
  assert.match(installer,/rel="manifest" href="\.\/snap\.webmanifest"/);
  for(const id of ["platformChoice","desktopGuide","mobileGuide","qrCode","copyLink",
    "installButton","steps","openCrew"]){
    assert.match(installer,new RegExp('id="'+id+'"'),id);
  }
  assert.match(js,/detectPlatform/);
  assert.match(js,/iphone\|ipad\|ipod/i);
  assert.match(js,/huawei\|honor\|harmonyos\|emui/i);
  assert.match(js,/beforeinstallprompt/);
  assert.match(js,/navigator\.clipboard\.writeText\(PUBLIC_INSTALL_URL\)/);
  assert.match(js,/prompt\.prompt\(\)/);
});
test("QR contains only the public onboarding link, no third-party image requests",()=>{
  assert.match(js,/https:\/\/razvanjuncu\.github\.io\/billy\/install\.html/);
  assert.match(js,/QR_ROWS/);
  assert.match(js,/createElementNS/);
  assert.doesNotMatch(installer,/api\.qrserver|quickchart|chart\.googleapis/);
  assert.doesNotMatch(js,/fetch\(/);
  assert.doesNotMatch(installer,/access_token|password=|auth\/callback/i);
});
test("Service worker can cache install page separately from primary offline app shell",()=>{
  for(const item of ["./install.html","./install.css","./install.js"]) assert.ok(sw.includes('"'+item+'"'));
  assert.match(sw,/pathname\.endsWith\("\/install\.html"\)/);
  assert.match(sw,/cache\.put\(fallback,copy\)/);
  assert.match(js,/display-mode: standalone/);
});
