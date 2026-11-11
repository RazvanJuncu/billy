const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const html=read("site/index.html");
const scanner=read("site/scanner.js");
const styles=read("site/scanner-enhance.css");

test("Scan editor has a white/gray sparkles icon enabled by default, not a text toggle",()=>{
  assert.match(html,/id="scanEnhance" class="scan-enhance-icon" type="button" aria-pressed="true"/);
  assert.doesNotMatch(html,/<span>Enhance text<\/span>/);
  assert.match(html,/id="scanCanvasWrap"[\s\S]*?id="scanEnhance"/);
  assert.match(scanner,/let enhanceText = true/);
  assert.match(scanner,/enhanceText = true;\s*updateEnhanceControl\(\)/);
  assert.match(scanner,/scanEnhance"\)\.addEventListener\("click"/);
  assert.match(scanner,/aria-pressed/);
  assert.match(styles,/\.scan-enhance-icon\[aria-pressed="false"\]/);
  assert.match(styles,/color:#fff/);
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
