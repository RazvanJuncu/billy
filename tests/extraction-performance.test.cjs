const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const server=read("supabase/functions/billy-vision/index.ts");
const app=read("site/app.js");
const panel=read("site/performance-diagnostics.js");
const html=read("site/index.html");
const sw=read("site/sw.js");
const nested=read("site/nested-documents.js");

test("Every extraction reports privacy-safe timed phases including classification-only returns",()=>{
  assert.match(server,/function extractionTimer\(authMs=0\)/);
  assert.match(server,/processing_timing:trace/);
  assert.match(server,/server_total_ms:/);
  assert.match(server,/const authenticationMs=.*-authStarted/);
  assert.match(server,/await extract\(req,principal,authenticationMs\)/);
  assert.match(server,/timing\.mark\("file_read_ms",readStarted\)/);
  assert.match(server,/timing\.mark\("classification_ms",classificationStarted\)/);
  assert.match(server,/timing\.mark\("extraction_ai_ms",extractionStarted\)/);
  assert.match(server,/timing\.mark\("db_write_ms",saveStarted\)/);
  assert.match(server,/timing\?\.count\("classifier_calls"\)/);
  assert.match(server,/timing\?\.mark\("nested_geometry_ai_ms",nestedStarted\)/);
  assert.match(server,/timing\?\.count\("date_recheck_calls"\)/);
  assert.match(server,/return timedJson\(\{classification_required:true,classification/);
  assert.match(server,/return timedJson\(\{\s*schema_version:"0\.7"/);
  assert.match(server,/console\.info\("Billy extraction performance",JSON\.stringify\(\{/);
  const logged=server.slice(server.indexOf('console.info("Billy extraction performance"'),server.indexOf('return json({...data,processing_timing:trace}'));
  assert.doesNotMatch(logged,/file\.name|invoice|organization_id|user_id|regions_data|source_sha256/);
  const extract=server.slice(server.indexOf("async function extract("),server.indexOf("\nfunction checkedAbsentPaths"));
  assert.doesNotMatch(extract,/return error\(|return json\(\{classification_required:true|return json\(\{\s*schema_version/);
});

test("Independent date rereading and public entity checks run concurrently without dropping validations",()=>{
  const start=server.indexOf("const [dateVisualCorrections,externalChecks]=await Promise.all([");
  assert.ok(start>0);
  const end=server.indexOf('timing.mark("verification_wall_ms"',start);
  const block=server.slice(start,end);
  assert.match(block,/visuallyRecheckDates\(bytes,mime,fields,regions,timing\)/);
  assert.match(block,/autoVerifyEntities\(fields,regions,identityHints\)/);
  assert.match(block,/timing\.mark\("date_recheck_ms",started\)/);
  assert.match(block,/timing\.mark\("entity_verification_ms",started\)/);
  assert.match(block,/timing\.count\("entity_lookup_calls",result\.attempts\)/);
  assert.match(block,/return \[\];/);
  const afterward=server.slice(end,end+550);
  assert.match(afterward,/const warnings=validate\(fields,type,regions,profile\)/);
  assert.match(afterward,/const normalized=normalizeDocument\(fields,type,profile\)/);
  assert.match(server,/date_visual_corrections:dateVisualCorrections/);
  assert.match(server,/external_checks:externalChecks/);
});

test("Frontend captures timings on every response, including manual-classification and error paths",()=>{
  assert.match(app,/const clickedAt=performance\.now\(\)/);
  assert.match(app,/serverTiming = responseBody\?\.processing_timing \|\| null/);
  assert.match(app,/outcome = "classification"/);
  assert.match(app,/outcome = "extracted"/);
  assert.match(app,/state\.lastProcessingTiming = \{/);
  assert.match(app,/window\.BillyPerformance\?\.record\?\.\(\{/);
  assert.match(app,/preflight_ms:/);
  assert.match(app,/request_ms:/);
  assert.match(app,/review_ms:/);
  assert.match(app,/total_ms:/);
  assert.match(html,/performance-diagnostics\.js\?v=1\.0\.0/);
  assert.match(html,/app\.js\?v=0\.9\.3/);
  assert.ok(html.indexOf("performance-diagnostics.js")<html.indexOf("app.js"));
  assert.match(sw,/performance-diagnostics\.js/);
});

test("On-demand dashboard remains invisible without ?perf=1 and stores no document payload",()=>{
  let msg=null;
  const context={
    window:{},location:{search:""},
    console:{info:(...args)=>{msg=args}},
    document:{addEventListener:()=>{throw Error("No DOM listeners should run in normal mode")}},
    URLSearchParams
  };
  vm.runInNewContext(panel,context,{filename:"performance-diagnostics.js"});
  const perf=context.window.BillyPerformance;
  assert.equal(typeof perf?.record,"function");
  perf.record({
    outcome:"extracted",
    client:{total_ms:22000,auth_ms:200,request_ms:21000,parse_ms:15,review_ms:40,preflight_ms:0},
    server:{server_total_ms:19800,stages_ms:{
      authentication_ms:150,file_read_ms:100,classification_ms:5000,
      classifier_ai_ms:4900,extraction_ai_ms:10000,
      verification_wall_ms:3500,date_recheck_ms:3400,entity_verification_ms:1500,
      db_write_ms:300
    },calls:{classifier_calls:1,extraction_calls:1}}
  });
  const list=Array.from(perf.breakdown()).map(x=>({label:x.label,ms:x.ms}));
  assert.equal(perf.latest().outcome,"extracted");
  assert.ok(list.some(x=>x.label==="AI classification"&&x.ms===5000));
  assert.ok(list.some(x=>x.label==="AI extraction"&&x.ms===10000));
  assert.ok(list.some(x=>x.label==="Checks (parallel wall time)"&&x.ms===3500));
  assert.ok(list.some(x=>x.label==="Transfer / gateway overhead"&&x.ms===1200));
  assert.equal(list.some(x=>x.label==="Classifier AI"),false,
    "Classifier AI is a subset of classification and must not be double-counted in the stacked chart");
  assert.ok(msg);
  assert.equal(perf.history().length,1);
  const source=JSON.stringify(perf.latest());
  assert.doesNotMatch(source,/filename|invoice_number|api_key|supplier_name|document_text/);
  assert.doesNotMatch(panel,/localStorage|sessionStorage|fetch\(/);
});

test("Nested processing starts without an artificial 1.45-second pause",()=>{
  assert.doesNotMatch(nested,/transition\?1450:150/);
  assert.match(nested,/setTimeout\(\(\)=>\{/);
  assert.match(nested,/\},150\);/);
  assert.match(html,/nested-documents\.js\?v=1\.4\.0/);
});