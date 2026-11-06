const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.resolve(__dirname, "../", file), "utf8");

test("Billy brand stylesheet is loaded after base UI styles", () => {
  const html = read("site/index.html");
  assert.ok(html.indexOf('href="./styles.css"') < html.indexOf('href="./brand.css"'));
  assert.match(read("site/brand.css"), /--brand-blue:#326dcc/);
  assert.match(read("site/brand.css"), /\.result-panel:not\(\.has-results\)\{display:none\}/);
});

test("Capture-first workflow has four ordered stages", () => {
  const html = read("site/index.html");
  for(const [index,label] of ["Capture","Straighten","Extract","Review"].entries()) {
    assert.match(html,new RegExp('data-stage="'+index+'"'));
    assert.match(html,new RegExp('step-title">'+label+'<'));
  }
  assert.ok(html.indexOf('id="scanOpenCamera"') < html.indexOf('id="statusDot"'));
  assert.ok(html.indexOf('id="scanOpenCamera"') < html.indexOf('id="resultToolbar"'));
  assert.equal((html.match(/id="notification"/g)||[]).length,1);
});

test("Scan and OCR states drive workflow instead of decorative steps", () => {
  const app=read("site/app.js");
  const scanner=read("site/scanner.js");
  assert.match(app,/function setStage\(index\)/);
  assert.match(app,/setStage\(2\)/);
  assert.match(app,/setStage\(3\)/);
  assert.match(app,/billy:scanner-stage/);
  assert.match(scanner,/billy:scanner-stage/);
  assert.match(app,/result-panel"\)\?\.classList\.add\("has-results"\)/);
});

test("Mobile design keeps scanner and OCR status non-obstructive", () => {
  const css=read("site/brand.css");
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/\.settings-body\{position:static/);
  assert.match(css,/\.camera-button\{min-height:48px/);
  assert.match(read("site/sw.js"),/"\.\/brand.css"/);
});
