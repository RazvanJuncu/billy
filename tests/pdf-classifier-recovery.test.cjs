const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const edge=read("supabase/functions/billy-vision/index.ts");
const app=read("site/app.js");
const pdf=read("site/pdf-separation.js");

function harness(answers){
  const start=edge.indexOf("function parseClassificationResponse(");
  const end=edge.indexOf("function manualClassification(",start);
  assert.ok(start>=0&&end>start,"Classifier is present.");
  const calls=[];
  const mock={
    MODEL:"gemini-test",CLASSIFIER_PROMPT:"test",CLASSIFIER_SCHEMA:{type:"object"},
    PROFILE_NAMES:["generic_invoice","handling_invoice","unknown"],CATEGORIES:["handling","unknown"],
    FORCED_CATEGORY:{},documentBoxes:()=>[],b64:()=>"base64",
    providerKey:()=>"secret",AbortSignal,
    console:{warn:()=>{}},
    fetch:async(_url,opts)=>{
      calls.push(JSON.parse(opts.body).generationConfig.maxOutputTokens);
      const answer=answers[calls.length-1];
      if(answer===undefined)throw Error("Unexpected extra request");
      if(answer.status)return {ok:false,status:answer.status};
      return {ok:true,json:async()=>answer};
    }
  };
  vm.runInNewContext(edge.slice(start,end)+"\nthis.classify=classifyDocument;",mock);
  return {classify:mock.classify,calls};
}
const valid={candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify({
  status:"confident",profile:"handling_invoice",expense_category:"handling",
  multiple_documents_visible:false,documents:[],reason:"one paper"
})}]}}]};
test("Normal classifier answers only use one Gemini request",async()=>{
  const h=harness([valid]);
  const result=await h.classify(new Uint8Array([1,2]),"application/pdf");
  assert.equal(result.profile,"handling_invoice");
  assert.deepEqual(h.calls,[2048]);
});
test("Incomplete JSON is retried once with larger budget, without reporting bad document",async()=>{
  const h=harness([{candidates:[{finishReason:"MAX_TOKENS",content:{parts:[{text:'{"status":'}]}}]},valid]);
  assert.equal((await h.classify(new Uint8Array([1]),"application/pdf")).profile,"handling_invoice");
  assert.deepEqual(h.calls,[2048,4096]);
});
test("Repeated malformed output gets bounded failure; HTTP errors do not retry",async()=>{
  let h=harness([{candidates:[{content:{parts:[{text:"invalid"}]}}]},{candidates:[{content:{parts:[{text:"invalid"}]}}]}]);
  await assert.rejects(h.classify(new Uint8Array([1]),"application/pdf"),/invalid JSON after retry/);
  assert.deepEqual(h.calls,[2048,4096]);
  h=harness([{status:429}]);
  await assert.rejects(h.classify(new Uint8Array([1]),"application/pdf"),/HTTP 429/);
  assert.deepEqual(h.calls,[2048]);
});
test("PDF requires operator decision: multipage is not automatically two documents",()=>{
  assert.match(pdf,/if\(count<=1\)return false/);
  assert.match(pdf,/A multi-page invoice can stay together/);
  assert.match(pdf,/Process full PDF as one document/);
  assert.match(pdf,/copyPages\(current\.pdf,\[index\]\)/);
  assert.match(pdf,/window\.BillyApp\.openFile\(new File/);
  assert.match(pdf,/window\.BillyPdfSeparator=\{preflight,toImage:renderPage,showPages\}/);
  assert.match(pdf,/pdfjs-dist@3\.11\.174/);
  assert.match(app,/await window\.BillyPdfSeparator\.preflight\(pendingFile\)/);
  assert.match(app,/await window\.BillyPdfSeparator\.toImage\(currentFile\)/);
  assert.match(read("site/simple.js"),/\$\("simpleRunProcess"\)\.disabled=false/);
  assert.match(read("site/index.html"),/pdf-separation\.js\?v=1\.0\.0/);
});
