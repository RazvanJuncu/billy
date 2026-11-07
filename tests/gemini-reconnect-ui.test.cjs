const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const app=read("site/app.js"),simple=read("site/simple.js"),html=read("site/index.html");
const sw=read("site/sw.js"),config=read("site/account-config.js");
test("Billy exposes real Gemini connection diagnostics instead of a generic disconnected message",()=>{
 assert.match(app,/connectionError/);
 assert.match(app,/Gemini connection timed out/);
 assert.match(app,/Vision backend HTTP/);
 assert.match(app,/setTimeout\(\(\) => controller\.abort\(\), 15000\)/);
 assert.match(app,/visionStatus: \(\) =>/);
 assert.match(app,/connectVision: \(\) =>/);
 assert.match(simple,/Gemini connection failed: /);
 assert.match(simple,/Connecting to Billy Gemini cloud/);
 assert.match(simple,/Gemini connected\. Ready to process/);
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
 assert.match(html,/app\.js\?v=0\.6\.5/);
 assert.match(html,/simple\.js\?v=1\.2\.5/);
 assert.match(sw,/v31-fuel-release-audit/);
});