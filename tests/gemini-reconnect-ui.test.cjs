const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const app=read("site/app.js"),simple=read("site/simple.js"),html=read("site/index.html");
const sw=read("site/sw.js"),config=read("site/account-config.js");
test("Billy exposes real Gemini connection diagnostics instead of a generic disconnected message",()=>{
 assert.match(app,/connectionError/);
 assert.match(app,/AI engine connection timed out/);
 assert.match(app,/Vision backend HTTP/);
 assert.match(app,/setTimeout\(\(\) => controller\.abort\(\), 15000\)/);
 assert.match(app,/visionStatus: \(\) =>/);
 assert.match(app,/connectVision: \(\) =>/);
 assert.match(simple,/AI engine connection failed: /);
 assert.match(simple,/Connecting to the AI engine/);
 assert.doesNotMatch(simple,/Gemini connected\. Ready to process/);
 assert.match(simple,/\$\("simpleProcessStatus"\)\.hidden = ready/);
});
test("Process Document retries automatically, with a manual visible fallback",()=>{
 assert.match(html,/id="simpleRetryVision"/);
 assert.match(simple,/window\.BillyApp\?\.connectVision\?\.\(\)/);
 assert.match(simple,/bind\("simpleRetryVision"/);
 assert.match(simple,/if \(next === "process"\)/);
 assert.match(app,/billy:account-ready/);
 assert.match(config,/apiUrl: "https:\/\//);
});
test("PWA uses refreshed assets after an earlier disconnected session",()=>{
 const appVersion=html.match(/app\.js\?v=(\d+)\.(\d+)\.(\d+)/);
 assert.ok(appVersion && (+appVersion[1]*1e6 + +appVersion[2]*1e3 + +appVersion[3]) >= 7001);
 const uiVersion=html.match(/simple\.js\?v=(\d+)\.(\d+)\.(\d+)/);
 assert.ok(uiVersion && (+uiVersion[1]*1e6 + +uiVersion[2]*1e3 + +uiVersion[3]) >= 1003002);
 const cacheVersion=sw.match(/billydpi-orbit-v(\d+)-/);
 assert.ok(cacheVersion && Number(cacheVersion[1]) >= 58);
});