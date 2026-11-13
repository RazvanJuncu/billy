const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const transitionCode=read("site/nested-transition.js");
const nestedCode=read("site/nested-documents.js");
const appCode=read("site/app.js");
const simpleCode=read("site/simple.js");
const css=read("site/simple.css");
const html=read("site/index.html");

function environment(){
  const listeners=new Map(),opened=[],timers=[];
  const mitosis={mounts:[],plays:0,destroys:0};
  class Element{
    constructor(tag){
      this.tag=tag;this.children=[];this.attributes={};this.className="";this.style={cssText:""};
      this.classList={
        values:new Set(),
        add:key=>this.classList.values.add(key),
        remove:key=>this.classList.values.delete(key),
        contains:key=>this.classList.values.has(key)
      };
    }
    setAttribute(key,value){this.attributes[key]=value}
    append(...nodes){this.children.push(...nodes)}
    remove(){this.removed=true}
  }
  const body=new Element("body");
  body.append=node=>{body.children.push(node);node.parent=body;};
  const document={
    body,
    createElement:tag=>{
      if(tag==="canvas")return {
        width:0,height:0,getContext:()=>({drawImage:()=>{}}),
        toBlob:cb=>cb({size:2048})
      };
      return new Element(tag);
    },
    createElementNS:(_ns,tag)=>new Element(tag)
  };
  const emit=(type,detail)=>{
    for(const fn of listeners.get(type)||[])fn({type,detail});
  };
  const win={
    addEventListener:(event,fn)=>listeners.set(event,[...(listeners.get(event)||[]),fn]),
    dispatchEvent:event=>emit(event.type,event.detail),
    BillyApp:{openFile:file=>opened.push(file)},
    BillyMitosis:{mount:(el,opts)=>{
      mitosis.mounts.push({el,opts});
      return {
        play:()=>{mitosis.plays++;return true;},
        destroy:()=>{mitosis.destroys++;}
      };
    }}
  };
  const file={name:"handling.jpg",type:"image/jpeg",size:8000};
  const image={naturalWidth:1000,naturalHeight:1200,decode:async()=>{}};
  class MockFile{
    constructor(parts,name,opts){this.name=name;this.type=opts.type;this.size=2048;}
  }
  const ctx={
    window:win,document,
    URL:{createObjectURL:()=> "blob:scan",revokeObjectURL:()=>{}},
    Image:class{constructor(){return image}},
    File:MockFile,Math,JSON,Number,
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},
    CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail}}
  };
  vm.runInNewContext(transitionCode,ctx);
  vm.runInNewContext(nestedCode,ctx);
  const classification={
    status:"confident",profile:"handling_invoice",
    expense_category:"handling",multiple_documents_visible:true,
    nested_documents:[{label:"Payment slip",x1:10,y1:20,x2:280,y2:440}]
  };
  return {window:win,document,opened,timers,emit,file,classification,mitosis};
}

test("Nested transition persists until the child has actually reached review",async()=>{
  const h=environment();
  const nested=h.window.BillyNested,ui=h.window.BillyNestedTransition;
  assert.equal(await nested.start(h.file,h.classification),true);
  assert.equal(h.opened.length,1);
  h.emit("billy:document-approved",{approvalId:"parent"});
  h.emit("billy:original-archived",{recordId:"parent"});
  assert.equal(ui.isActive(),true,"The handoff must start only after original archive");
  assert.equal(h.document.body.classList.contains("billy-nested-transition-open"),true);
  assert.equal(h.timers.length,1);
  assert.equal(h.timers[0].ms,1450,"Wait for the one-time visual animation");
  const nextFile=h.window.BillyNested.isHandoff(h.file);
  assert.equal(nextFile,false,"The source/parent is not a child handoff");
  h.timers.shift().fn();
  assert.equal(h.opened.length,2);
  const child=h.opened[1];
  assert.equal(nested.isHandoff(child),true);
  assert.equal(ui.isActive(),true,"Never stop just because a fixed animation timer expired");
  const layer=h.document.body.children.at(-1);
  assert.equal(layer.classList.contains("is-reading"),true);
  // Regression for a real screenshot where the SVG expanded to full
  // viewport width and separated the title from the animation.
  assert.match(layer.style.cssText,/display:flex/);
  assert.match(layer.style.cssText,/align-items:center;justify-content:center/);
  const stage=layer.children[0];
  assert.match(stage.style.cssText,/flex-direction:column/);
  assert.match(stage.style.cssText,/max-width:460px/);
  const visual=stage.children.find(el=>el.className==="billy-nested-transition-visual");
  assert.ok(visual);
  assert.match(visual.style.cssText,/width:400px/);
  assert.match(visual.style.cssText,/max-width:100%/);
  assert.match(css,/\.billy-nested-transition-visual\{[^}]*width:min\(400px,100%\)/);
  assert.match(css,/\.billy-nested-transition-visual \.billy-mitosis-svg\{/);
  const text=layer.children[0].children.find(el=>el.tag==="strong");
  assert.equal(text.textContent,"Preparing nested document");
  assert.equal(h.mitosis.mounts.length,1);
  assert.equal(h.mitosis.plays,1);
  assert.equal(h.mitosis.mounts[0].opts.loop,true);
  assert.equal(h.mitosis.mounts[0].opts.duration,2800);
  assert.equal(nested.finishHandoff(),true);
  assert.equal(h.mitosis.destroys,1,
    "Completing review must stop animation frames and detach listeners");
  assert.equal(ui.isActive(),false);
  assert.equal(h.document.body.classList.contains("billy-nested-transition-open"),false);
  assert.equal(nested.isHandoff(child),false);
  assert.equal(nested.finishHandoff(),false,"Dismissal is idempotent");
  const form={values:new Map(),set(key,value){this.values.set(key,value)}};
  nested.prepare(form,child);
  assert.equal(form.values.get("parent_document_id"),"parent");
});

test("Reset or a different user-selected file clears the active handoff",async()=>{
  const h=environment();
  const nested=h.window.BillyNested,ui=h.window.BillyNestedTransition;
  await nested.start(h.file,h.classification);
  h.emit("billy:document-approved",{approvalId:"parent"});
  h.emit("billy:original-archived",{recordId:"parent"});
  h.timers.shift().fn();
  assert.equal(ui.isActive(),true);
  nested.fileLoaded({name:"unrelated.jpg"});
  assert.equal(ui.isActive(),false);
  assert.equal(nested.active(),false);
  assert.equal(h.mitosis.destroys,1,
    "Selecting an unrelated file must cancel the active mitosis");
});

test("Generic orbit never replaces the active nested transition during extraction",()=>{
  assert.match(appCode,/const nestedHandoff=Boolean\(window\.BillyNested\?\.isHandoff\?\.\(state\.file\)\)/);
  assert.match(appCode,/if\(!nestedHandoff\)window\.BillyLoader\?\.startWork\("ai","Processing document"\)/);
  assert.match(appCode,/if\(!nestedHandoff\)window\.BillyLoader\?\.endWork\("ai"\)/);
  assert.match(simpleCode,/showScreen\("review"\);\s*\/\/ The child has reached/);
  assert.match(simpleCode,/window\.BillyNested\?\.finishHandoff\?\.\(\)/);
  const failure= simpleCode.slice(simpleCode.indexOf('window.addEventListener("billy:process-complete"'),
    simpleCode.indexOf('window.addEventListener("billy:engine-updated"'));
  assert.match(failure,/window\.BillyNested\?\.finishHandoff\?\.\(\)/);
  const manual=simpleCode.slice(simpleCode.indexOf('window.addEventListener("billy:classification-needs-review"'),
    simpleCode.indexOf('window.addEventListener("billy:process-complete"'));
  assert.match(manual,/window\.BillyNested\?\.finishHandoff\?\.\(\)/);
  assert.match(css,/\.billy-nested-transition-stage\{/);
  assert.match(css,/\.billy-nested-transition-visual \.billy-mitosis\{/);
  assert.match(css,/\.billy-nested-transition\{[^}]*background:#050607/);
  assert.match(html,/nested-mitosis\.css\?v=0\.3\.0/);
  assert.match(html,/nested-mitosis\.js\?v=0\.3\.0/);
  assert.match(html,/nested-transition\.js\?v=1\.3\.0/);
  assert.ok(html.indexOf("nested-mitosis.js")<html.indexOf("nested-transition.js"),
    "Mitosis component must load before its production caller");
  assert.match(transitionCode,/window\.BillyMitosis\.mount\(visual,\{loop:true,duration:2800\}\)/);
  assert.doesNotMatch(transitionCode,/Reading nested document/);
  assert.doesNotMatch(transitionCode,/billy-nested-transition-child|billy-nested-transition-path/);
  assert.match(html,/nested-documents\.js\?v=1\.3\.0/);
});

test("Nested transition no longer stops itself unconditionally on a 1450ms timer",()=>{
  assert.doesNotMatch(nestedCode,
    /setTimeout\(\(\)=>\{\s*window\.BillyNestedTransition\?\.stop\?\.\(\)/);
  assert.match(nestedCode,/if\(transition\)window\.BillyNestedTransition\?\.reading\?\.\(\)/);
  assert.match(nestedCode,/const transition=window\.BillyNestedTransition\?\.play\?\.\(label\)===true/);
});
