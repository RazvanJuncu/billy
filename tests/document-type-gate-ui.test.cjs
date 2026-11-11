const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const html=read("site/index.html");
const flow=read("site/simple.js");
const app=read("site/app.js");
const css=read("site/simple.css");

test("Dedicated classification step is prominent and has no Invoice default",()=>{
  assert.match(html,/id="simpleType"/);
  assert.match(html,/id="simpleChooseInvoice"/);
  assert.match(html,/id="simpleChooseFuelRelease"/);
  assert.match(html,/id="simpleSelectedType"/);
  assert.match(html,/id="simpleChangeType"/);
  assert.match(html,/<option value="" selected disabled>Choose document type<\/option>/);
  assert.doesNotMatch(html,/<option value="invoice" selected/);
  assert.match(css,/\.simple-type-grid/);
  assert.match(css,/\.simple-type-card/);
  assert.match(css,/min-height:168px/);
  assert.match(css,/body\[data-billy-screen\] \.document-type-control\{display:none!important\}/);
  assert.match(app,/if \(!\["invoice","fuel_release"\]\.includes\(\$\("documentType"\)\.value\)\)/);
  assert.match(app,/!validType \|\| state\.busy/);
});

function bootFlow(onlineInitially=true){
  const elements=new Map(),windowEvents=new Map();
  const element=id=>{
    if(elements.has(id))return elements.get(id);
    const handlers=new Map(),attributes=new Map();
    const node={
      id,hidden:false,disabled:false,value:"",textContent:"",dataset:{},
      classList:{toggle:()=>false,add:()=>{},remove:()=>{}},
      addEventListener(type,fn){handlers.set(type,fn);},
      dispatchEvent(event){handlers.get(event.type)?.(event);return true;},
      setAttribute(name,value){attributes.set(name,value);},
      getAttribute(name){return attributes.get(name)},
      click(){handlers.get("click")?.({type:"click",preventDefault(){}});},
      querySelector:()=>null,
    };
    elements.set(id,node);
    return node;
  };
  const invoice=element("simpleChooseInvoice");
  invoice.dataset.documentType="invoice";
  const fuel=element("simpleChooseFuelRelease");
  fuel.dataset.documentType="fuel_release";
  const body={dataset:{},classList:{toggle:()=>false,add:()=>{},remove:()=>{}}};
  const doc={
    body,documentElement:{dataset:{}},
    getElementById:element,
    querySelectorAll:selector=>selector===".simple-type-card"?[invoice,fuel]:[],
  };
  let scans=0,online=onlineInitially;
  element("scanButton").click=()=>{scans++;};
  const sandbox={
    window:{
      BillyApp:{isOnline:()=>online,visionStatus:()=>({online})},
      BillyAccounts:{active:()=>false},
      addEventListener(type,fn){windowEvents.set(type,fn)}
    },
    document:doc,Event,
    console,Math,
  };
  vm.runInNewContext(flow,sandbox,{filename:"simple.js"});
  return {element,sandbox,getScans:()=>scans,setOnline:value=>{online=value;},emit:(type,detail)=>windowEvents.get(type)?.({detail})};
}

test("Each new document requires explicit type selection and selecting the type starts processing",()=>{
  const {element,sandbox,getScans,emit}=bootFlow();
  assert.equal(sandbox.window.BillySimple.getState().screen,"home");
  const first={name:"fuel-ticket.jpg"};
  emit("billy:document-loaded",{file:first});
  // Crop confirmation/import now goes straight to classification.
  assert.equal(sandbox.window.BillySimple.getState().screen,"type");
  assert.equal(element("documentType").value,"");
  element("simpleRunProcess").click();
  assert.equal(getScans(),0);
  assert.equal(sandbox.window.BillySimple.getState().screen,"type");
  element("simpleChooseFuelRelease").click();
  assert.equal(element("documentType").value,"fuel_release");
  assert.equal(sandbox.window.BillySimple.getState().screen,"process");
  assert.equal(element("simpleSelectedType").textContent,"Fuel Release");
  assert.equal(getScans(),1);
  assert.equal(element("simpleRunProcess").disabled,true);
  element("simpleChangeType").click();
  assert.equal(sandbox.window.BillySimple.getState().screen,"type");
  assert.equal(element("simpleChooseFuelRelease").getAttribute("aria-pressed"),"true");
  const next={name:"invoice-2.pdf"};
  emit("billy:document-loaded",{file:next});
  assert.equal(sandbox.window.BillySimple.getState().screen,"type");
  assert.equal(element("documentType").value,"");
  element("simpleChooseInvoice").click();
  assert.equal(element("documentType").value,"invoice");
  assert.equal(element("simpleSelectedType").textContent,"Invoice");
  assert.equal(getScans(),2);
});

test("Back navigation stays in the new flow and never opens the legacy editor",()=>{
  const h=bootFlow();
  h.emit("billy:document-loaded",{file:{name:"ticket.jpg"}});
  assert.equal(h.sandbox.window.BillySimple.getState().screen,"type");
  h.element("simpleBack").click();
  assert.equal(h.sandbox.window.BillySimple.getState().screen,"new");
  h.sandbox.window.BillySimple.showScreen("type");
  h.element("simpleChooseInvoice").click();
  assert.equal(h.sandbox.window.BillySimple.getState().screen,"process");
  h.emit("billy:ocr-ready");
  assert.equal(h.sandbox.window.BillySimple.getState().screen,"review");
  h.element("simpleBack").click();
  assert.equal(h.sandbox.window.BillySimple.getState().screen,"type");
  h.emit("billy:document-revised");
  assert.equal(h.sandbox.window.BillySimple.getState().screen,"type");
});

test("Choosing a type while engine connects starts once on readiness, not after Back",()=>{
  const h=bootFlow(false);
  h.emit("billy:document-loaded",{file:{name:"ticket.jpg"}});
  h.element("simpleChooseFuelRelease").click();
  assert.equal(h.sandbox.window.BillySimple.getState().screen,"process");
  assert.equal(h.getScans(),0);
  h.setOnline(true);
  h.emit("billy:engine-updated");
  assert.equal(h.getScans(),1);
  h.emit("billy:engine-updated");
  assert.equal(h.getScans(),1);

  const cancelled=bootFlow(false);
  cancelled.emit("billy:document-loaded",{file:{name:"other.jpg"}});
  cancelled.element("simpleChooseInvoice").click();
  cancelled.element("simpleBack").click();
  assert.equal(cancelled.sandbox.window.BillySimple.getState().screen,"type");
  cancelled.setOnline(true);
  cancelled.emit("billy:engine-updated");
  assert.equal(cancelled.getScans(),0);
});
