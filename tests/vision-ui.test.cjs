const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=(p)=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const html=read("site/index.html"),review=read("site/vision-review.js"),app=read("site/app.js");
test("Vision review is loaded before the app and uses escaping DOM text",()=>{
  assert.match(html,/vision-review.js\?v=/);
  assert.ok(html.indexOf("vision-review.js")<html.indexOf("app.js?v="));
  assert.match(review,/textContent=content/);
  assert.doesNotMatch(review,/innerHTML/);
});
test("Source, review, approval and exports are wired without client keys",()=>{
  assert.match(app,/\/api\/vision\/extract/);
  assert.match(app,/\/api\/vision\/health/);
  assert.match(review,/\/api\/vision\/approve/);
  assert.match(review,/I verified the invoice values/);
  assert.match(review,/function exportCSV/);
  assert.match(review,/source_sha256/);
  assert.doesNotMatch(html,/GEMINI_API_KEY\s*=\s*[^<]/);
});
test("Review does not invent confidence or post to Excel",()=>{
  assert.match(review,/confidence is not calibrated/);
  assert.match(review,/Excel not modified/);
  assert.match(read("site/sw.js"),/vision-review.js/);
  assert.match(read("site/sw.js"),/review.css/);
});
