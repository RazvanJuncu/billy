const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const html=read("site/index.html");
const scanner=read("site/scanner.js");
const styles=read("site/brand.css");

test("Scan editor offers an optional enhancement switch, defaulting to original",()=>{
  assert.match(html,/id="scanEnhance"/);
  assert.match(html,/Enhance text/);
  assert.match(scanner,/let enhanceText = false/);
  assert.match(scanner,/enhanceText = false;\s*\$\("scanEnhance"\)\.checked = false/);
  assert.match(scanner,/scanEnhance"\)\.addEventListener\("change"/);
  assert.match(styles,/\.scan-enhance-toggle/);
});
test("Enhanced scan creates a derivative; original pixels remain available",()=>{
  assert.match(scanner,/if \(!enhanceText\) return out/);
  assert.match(scanner,/const derivative = document\.createElement\("canvas"\)/);
  assert.match(scanner,/derivativeContext\.filter = TEXT_FILTER/);
  assert.match(scanner,/derivativeContext\.drawImage\(out,0,0\)/);
  assert.match(scanner,/return derivative/);
  assert.match(scanner,/stem\+\(enhanceText\?"-billy-enhanced\.jpg":"-billy-scan\.jpg"\)/);
  assert.match(scanner,/originalFile=file/);
  assert.doesNotMatch(scanner,/imageCanvas = derivative/);
});
