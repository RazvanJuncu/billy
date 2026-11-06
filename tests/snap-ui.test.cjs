const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

const html = read("site/index.html");
const simple = read("site/simple.js");
const scanner = read("site/scanner.js");
const accounts = read("site/accounts.js");
const styles = read("site/snap.css");
const manifest = JSON.parse(read("site/snap.webmanifest"));

test("Billy Crew has a separate installable identity using the same origin and document studio", () => {
  assert.equal(manifest.name, "Billy Crew");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./?crew=1");
  assert.notEqual(manifest.id, JSON.parse(read("site/manifest.webmanifest")).id);
  assert.match(html, /id="billyManifest"/);
  assert.match(html, /dataset\.billySnap = "1"/);
  assert.match(html, /\.\/snap\.webmanifest/);
  assert.match(styles, /data-billy-snap="1"/);
  assert.match(read("site/sw.js"), /"\.\/snap\.webmanifest"/);
  assert.match(read("site/sw.js"), /"\.\/snap\.css"/);
});

test("Billy Crew skips home, starts camera only after team auth, supports normal file import", () => {
  for (const id of ["snapStartCamera","snapLaunchUpload","snapCameraUpload"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
    assert.match(simple, new RegExp('bind\\("' + id + '"'));
  }
  assert.match(simple, /snapMode \? "new" : "home"/);
  assert.match(simple, /BillyAccounts\?\.active\?\.\(\)/);
  assert.match(simple, /billy:account-ready/);
  assert.match(simple, /BillyScanner\?\.startCamera\?\.\(\)/);
  assert.match(simple, /BillyScanner\?\.close\?\.\(\)/);
  assert.match(simple, /\$\("filePicker"\)\.click\(\)/);
  assert.match(scanner, /close:hideOverlay/);
  assert.match(accounts, /persistSession:true/);
});

test("Original New Document workflow remains shared, no fake corporate upload", () => {
  assert.match(simple, /billy:document-loaded/);
  assert.match(simple, /billy:ocr-ready/);
  assert.match(simple, /billy:document-approved/);
  assert.match(simple, /showScreen\("upload"\)/);
  assert.match(html, /id="simpleExportCsv"/);
  assert.match(html, /id="simpleExportJson"/);
  assert.match(html, /Company Excel upload is not connected yet/);
  assert.match(html, /id="filePicker"/);
  assert.match(scanner, /onUse\(file\)/);
});
