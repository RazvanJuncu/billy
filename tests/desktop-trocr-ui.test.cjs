const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const controller=read("site/desktop-trocr.js");
const app=read("site/app.js");
const worker=read("site/desktop-trocr-worker.js");
const crop=read("site/quickverify-crop.js");
const ramp=read("site/ramp-review.js");
const html=read("site/index.html");
const sw=read("site/sw.js");

test("Desktop TrOCR uses a pinned pretrained model in a module worker",()=>{
  assert.match(worker,/@huggingface\/transformers@3\.8\.1/);
  assert.match(worker,/Xenova\/trocr-small-handwritten/);
  assert.match(worker,/pipeline\("image-to-text"/);
  assert.match(worker,/device:"wasm",dtype:"q8"/);
  assert.match(worker,/max_new_tokens:64/);
  assert.doesNotMatch(worker,/\/api\/handwriting\/examples|train\(|fit\(/);
  assert.match(html,/desktop-trocr\.js\?v=2/);
  assert.ok(html.indexOf("quickverify-crop.js")<html.indexOf("desktop-trocr.js"));
  assert.ok(html.indexOf("desktop-trocr.js")<html.indexOf("ramp-review.js"));
  assert.match(sw,/"\.\/desktop-trocr-worker\.js"/);
  assert.match(crop,/async function dataUrl\(region\)/);
  assert.match(crop,/toDataURL\("image\/png"\)/);
});

test("Local TrOCR respects desktop-only gating and never auto-writes the review",async()=>{
  let workers=0,crops=0,disposed=0;
  class WorkerMock {
    constructor(){workers++;}
    postMessage(data){
      assert.equal(data.kind,"read");
      assert.match(data.image,/^data:image\/png;base64,/);
      this.onmessage({data:{kind:"result",id:data.id,text:"71052"}});
    }
    terminate(){}
  }
  const region={field_path:"meter_start",page:1,box_2d:[10,20,30,70],
    script_type:"handwritten",transcription:"71053"};
  const callbacks=[],status=[];
  const context={
    window:{
      matchMedia:()=>({matches:true}),
      BillyQuickVerifyCrop:{
        validRegion:()=>true,
        create:()=>({async dataUrl(){crops++;return "data:image/png;base64,dGVzdA==";},
          dispose(){disposed++;}})
      }
    },
    navigator:{userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64)",platform:"Win32",maxTouchPoints:0},
    Worker:WorkerMock,
    console,Promise,Map,Set,Error,setTimeout,clearTimeout
  };
  vm.runInNewContext(controller,context);
  const agent=context.window.BillyDesktopTrOCR;
  assert.equal(agent.desktop(),true);
  const job=agent.inspect({file:{name:"test.jpg"},regions:[region],
    onStatus:m=>status.push(m),onReading:r=>callbacks.push(r)});
  assert.equal(job.enabled,true);
  assert.equal((await job.done).status,"completed");
  assert.equal(workers,1);
  assert.equal(crops,1);
  assert.equal(disposed,1);
  assert.equal(callbacks.length,1);
  assert.equal(callbacks[0].text,"71052");
  assert.ok(status.some(s=>s.includes("Local TrOCR checked")));
  assert.match(ramp,/handwriting_disagreement=differs/);
  assert.match(ramp,/region.trocr_comparison=compared/);
  assert.match(ramp,/showLocalReading\(field_path\)/);
  assert.doesNotMatch(ramp,/doc\[field_path\]=text|setAt\(doc,field_path,text\)/);
  context.navigator.userAgent="iPhone";
  assert.equal(agent.desktop(),false);
  const skipped=agent.inspect({file:{},regions:[region]});
  assert.equal(skipped.enabled,false);
  assert.equal((await skipped.done).status,"skipped");
  assert.equal(workers,1);
});

test("No photo-learning or identical-file approval recall remains in the web flow",()=>{
  const backend=read("supabase/functions/billy-vision/index.ts");
  const review=read("site/vision-review.js");
  const simple=read("site/simple.js");
  assert.doesNotMatch(backend,/billy_intelligence_examples|approvedIdenticalSource|intelligence_audit|intelligence_opt_in/);
  assert.doesNotMatch(review,/handwriting\/examples|Submit & Learn|intelligenceOptIn/);
  assert.doesNotMatch(simple,/simpleInspectLearning|renderLearningAudit/);
  assert.doesNotMatch(ramp,/previouslyVerified|intelCheckbox|Billy Intelligence/);
  assert.doesNotMatch(html,/Inspect Billy Intelligence/);
});

test("Review stays hidden until BOTH extraction and TrOCR settle",async()=>{
  const begin=app.indexOf("async function renderResult() {");
  const end=app.indexOf("async function scanInvoice() {",begin);
  assert.ok(begin>=0&&end>begin);
  const fragment=app.slice(begin,end);
  assert.match(fragment,/await window.BillyReview.render/);
  const scan=app.slice(end,app.indexOf("function downloadFile(",end));
  assert.ok(scan.indexOf("await renderResult();")>=0);
  assert.ok(scan.indexOf("await renderResult();")<scan.indexOf('new CustomEvent("billy:ocr-ready"'));
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let called=0;
  const elements=new Map();
  const get=id=>{
    if(!elements.has(id))elements.set(id,{hidden:false});
    return elements.get(id);
  };
  const sandbox={
    state:{result:{invoice:{grand_total:"100"}},api:"test-api",file:{name:"doc.jpg"}},
    setStage:()=>{},document:{querySelector:()=>({classList:{add:()=>{}}})},
    window:{BillyReview:{render:()=>{called++;return gate;}},
      BillyAccounts:{sessionHeaders:()=>({})}},
    $:get,Promise
  };
  vm.runInNewContext(fragment+"\nthis.triggerRender=renderResult;",sandbox);
  const renderPromise=sandbox.triggerRender();
  assert.equal(get("formattedOutput").hidden,true);
  assert.equal(called,1);
  release();
  await renderPromise;
  assert.equal(get("formattedOutput").hidden,false);
  assert.match(controller,/const done=Promise.race\(\[task,timeout\]\)/);
  assert.match(controller,/return \{enabled:true,cancel:run.cancel,done\}/);
});
