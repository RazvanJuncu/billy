const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const crop=read("site/quickverify-crop.js");
const ramp=read("site/ramp-review.js");
const html=read("site/index.html");
const css=read("site/ramp-review.css");
const sw=read("site/sw.js");

test("QuickVerify source crops remain local, bounded, and multi-page capable",()=>{
  const window={};
  vm.runInNewContext(crop,{window,console});
  const {cropBounds,validRegion}=window.BillyQuickVerifyCrop;
  const region={page:2,box_2d:[250,700,300,815]};
  assert.equal(validRegion(region),true);
  assert.equal(validRegion({page:1,box_2d:[900,800,700,1000]}),false);
  assert.equal(validRegion({page:31,box_2d:[100,200,300,400]}),false);
  const b=cropBounds(region,2000,3000);
  assert.ok(b.sx>=0&&b.sy>=0);
  assert.ok(b.sw>0&&b.sh>0);
  assert.ok(b.sx+b.sw<=2000&&b.sy+b.sh<=3000);
  assert.ok(b.sw<2000&&b.sh<3000); // Tight evidence crop, not a full-page screenshot.
  const edge=cropBounds({page:1,box_2d:[0,0,25,20]},1200,1800);
  assert.ok(edge.sx>=0&&edge.sy>=0);
  assert.equal(cropBounds({page:1,box_2d:[5,5,3,8]},900,1500),null);
  assert.match(crop,/sourceOnPage\(region\.page\)/);
  assert.match(crop,/URL\.createObjectURL\(file\)/);
  assert.match(crop,/URL\.revokeObjectURL\(sourceUrl\)/);
  assert.match(crop,/isEvalSupported:false,enableScripting:false/);
  assert.match(crop,/pdf\.destroy\(\)/);
  assert.match(crop,/if\(disposed\|\|current!==ticket\)return/);
  assert.doesNotMatch(crop,/fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(html,/quickverify-crop\.js\?v=1\.0\.0/);
  assert.ok(html.indexOf("quickverify-crop.js")<html.indexOf("ramp-review.js"));
  assert.match(sw,/"\.\/quickverify-crop\.js"/);
  assert.match(sw,/quickverify-crop\\\.js/);
});

function fakeDocument(){
  let focused=null;
  function make(tag){
    const el={
      tagName:tag.toUpperCase(),className:"",children:[],parentNode:null,
      hidden:false,disabled:false,value:"",textContent:"",dataset:{},attrs:{},style:{},
      listeners:new Map(),
      append(...children){for(const child of children)this.appendChild(child);},
      appendChild(child){
        if(child.parentNode){
          const old=child.parentNode.children;
          const i=old.indexOf(child);
          if(i>=0)old.splice(i,1);
        }
        this.children.push(child);child.parentNode=this;return child;
      },
      replaceChildren(...children){
        for(const child of this.children)child.parentNode=null;
        this.children=[];
        this.append(...children);
      },
      get firstChild(){return this.children[0]||null;},
      setAttribute(name,value){this.attrs[name]=String(value);},
      addEventListener(type,cb){
        if(!this.listeners.has(type))this.listeners.set(type,[]);
        this.listeners.get(type).push(cb);
      },
      dispatchEvent(event){
        event.target=event.target||this;
        for(const cb of this.listeners.get(event.type)||[])cb(event);
        if(event.bubbles&&this.parentNode)this.parentNode.dispatchEvent(event);
        return true;
      },
      click(){if(!this.disabled)this.dispatchEvent({type:"click",target:this,bubbles:false});},
      focus(){focused=this;},
      scrollIntoView(){},
      querySelectorAll(selector){
        const all=[];
        function walk(node){
          for(const child of node.children){
            if(selector==="[data-evidence-path]"&&child.dataset.evidencePath)all.push(child);
            else if(selector.startsWith(".")&&child.className.split(/\s+/).includes(selector.slice(1)))all.push(child);
            walk(child);
          }
        }
        walk(this);return all;
      },
      querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    };
    return el;
  }
  const root=make("main");
  return {document:{createElement:make,getElementById:id=>id==="formattedOutput"?root:null},root,make,
    focus:()=>focused};
}
function simulate(){
  const dom=fakeDocument(),cropped=[],disposals=[];
  const copied={
    supplier_name:"Supplier Ltd",supplier_tax_id:null,customer_name:null,
    invoice_number:"INV-42",issue_date:null,due_date:null,currency:"USD",
    subtotal:null,vat_total:null,grand_total:"119.00",lines:[],notes:[]
  };
  const rawRegion=(path,clarity)=>({
    field_path:path,visual_clarity:clarity,page:1,box_2d:[100,200,150,390],
    alternate_readings:[],visual_reason:"Faint ink"
  });
  let sourceDraft=structuredClone(copied);
  function renderOriginal(){
    dom.root.replaceChildren();
    const container=dom.make("section");
    container.className="legacy-review";
    const approve=dom.make("button");approve.className="review-approve";
    container.append(approve);
    for(const key of Object.keys(copied)){
      const input=dom.make("input");
      input.dataset.evidencePath=key;
      input.value=sourceDraft[key]||"";
      input.addEventListener("input",()=>{sourceDraft[key]=input.value||null;});
      container.append(input);
    }
    dom.root.append(container);
  }
  const window={
    BillyReview:{render:renderOriginal},
    BillyQuickVerifyCrop:{
      validRegion:item=>item?.page===1&&Array.isArray(item?.box_2d),
      create:()=>({
        show(region,slot){
          cropped.push(region?.field_path||null);
          slot.replaceChildren(dom.make("canvas"));
        },
        cancel(){cropped.push("cancelled");},
        dispose(){disposals.push("disposed");}
      })
    },
    addEventListener(){},dispatchEvent(){}
  };
  class Event{
    constructor(type,opts={}){this.type=type;this.bubbles=!!opts.bubbles;}
  }
  vm.runInNewContext(ramp,{window,document:dom.document,structuredClone,Event,console});
  const result={
    document_type:"invoice",invoice:copied,
    regions:[rawRegion("invoice_number","ambiguous"),rawRegion("grand_total","slight_uncertainty")],
    validation_warnings:[],translation:null
  };
  window.BillyReview.render(result,"https://example.supabase.co/functions/v1/billy-vision",
    async()=>({}),{name:"scan.jpg",type:"image/jpeg"});
  const find=cls=>dom.root.querySelector("."+cls);
  const segment=path=>dom.root.querySelectorAll(".ramp-segment")
    .find(x=>x.dataset.fieldPath===path);
  return {window,dom,find,segment,cropped,disposals,sourceDraft,result};
}

test("Correct confirms original reading and opens the next unresolved field automatically",()=>{
  const {window,find,segment,cropped,dom}=simulate();
  assert.equal(find("ramp-field-detail").hidden,true);
  assert.equal(window.BillyReview.canApprove(),false);
  segment("invoice_number").click();
  assert.equal(find("ramp-field-title").textContent,"Invoice number");
  assert.equal(find("ramp-current-value").textContent,"INV-42");
  assert.equal(find("ramp-field-input").hidden,true);
  assert.equal(find("ramp-confirm").textContent,"Correct");
  assert.equal(find("ramp-edit").textContent,"Edit");
  assert.equal(cropped[0],"invoice_number");
  assert.equal(find("ramp-source-crop").children[0].tagName,"CANVAS");
  find("ramp-confirm").click();
  assert.equal(find("ramp-field-title").textContent,"Grand total");
  assert.equal(find("ramp-current-value").textContent,"119.00");
  assert.equal(cropped[1],"grand_total");
  assert.equal(segment("invoice_number").className.includes("ramp-blue"),true);
  assert.deepEqual([...window.BillyReview.rampAudit().manual_confirmations],["invoice_number"]);
  assert.equal(window.BillyReview.canApprove(),false);
  // The last confirmation focuses Recheck; it does not approve anything.
  find("ramp-confirm").click();
  assert.equal(find("ramp-field-detail").hidden,true);
  assert.equal(find("ramp-feedback").textContent,"Ready for Recheck");
  assert.equal(find("ramp-primary").hidden,false);
  assert.equal(dom.focus().textContent,"Recheck with AI");
  assert.equal(segment("grand_total").className.includes("ramp-blue"),true);
  assert.equal(window.BillyReview.canApprove(),false);
});

test("Edit opens only on demand, saves the corrected field, then goes to next item",()=>{
  const {window,find,segment,sourceDraft}=simulate();
  segment("invoice_number").click();
  find("ramp-edit").click();
  assert.equal(find("ramp-field-input").hidden,false);
  assert.equal(find("ramp-current-value").hidden,true);
  assert.equal(find("ramp-confirm").textContent,"Save correction");
  find("ramp-field-input").value="INV-49";
  find("ramp-confirm").click();
  assert.equal(sourceDraft.invoice_number,"INV-49");
  assert.equal(find("ramp-field-title").textContent,"Grand total");
  assert.equal(segment("invoice_number").className.includes("ramp-blue"),true);
  assert.equal(window.BillyReview.rampAudit().final_approval_gate,"not_passed");
});

test("Missing values cannot be confirmed blindly; absence is retained as human review",()=>{
  const {window,find,segment,dom}=simulate();
  segment("grand_total").click();
  find("ramp-inspect-original").click();
  assert.equal(find("ramp-evidence").hidden,false);
  find("ramp-close").click();
  assert.equal(find("ramp-field-detail").hidden,true);
  segment("invoice_number").click();
  find("ramp-not-present").click();
  assert.deepEqual([...window.BillyReview.rampAudit().not_on_document],["invoice_number"]);
  assert.equal(segment("invoice_number").className.includes("ramp-blue"),true);
  assert.equal(find("ramp-field-title").textContent,"Grand total");
  assert.equal(window.BillyReview.canApprove(),false);
  assert.notEqual(dom.focus().textContent,"Approve & continue");
});

test("New document disposes the previous cropper; source fallback stays available",()=>{
  const {window,find,result,cropped,disposals}=simulate();
  const fallback={...result,regions:[]};
  window.BillyReview.render(fallback,"https://example.supabase.co/functions/v1/billy-vision",
    async()=>({}),{name:"another.jpg",type:"image/jpeg"});
  assert.equal(disposals.length,1);
  const segment=window.BillyReview.rampAudit();
  assert.equal(segment.manual_confirmations.length,0);
  assert.ok(cropped.length===0||cropped.every(x=>typeof x==="string"));
  assert.match(css,/\.ramp-source-crop\{/);
  assert.match(css,/\.ramp-current-value\{/);
  assert.match(css,/\.ramp-minor-actions\{/);
  assert.match(css,/\.ramp-field-detail \.ramp-detail-actions\{display:flex;flex-direction:row/);
});

test("QuickVerify draws a real bounded image crop and revokes the temporary file URL",async()=>{
  const drawCalls=[],revoked=[],slots=[],window={};
  let sourceDecoded=0;
  const document={
    createElement(tag){
      const n={
        tagName:tag.toUpperCase(),children:[],attrs:{},
        setAttribute(key,value){this.attrs[key]=value;},
        replaceChildren(...children){this.children=children;},
        append(child){this.children.push(child);}
      };
      if(tag==="canvas"){
        n.getContext=()=>({drawImage(...args){drawCalls.push(args);}});
      }
      return n;
    }
  };
  class Image{
    constructor(){this.naturalWidth=2000;this.naturalHeight=3000;}
    set src(value){this.url=value;}
    decode(){sourceDecoded++;return Promise.resolve();}
  }
  const URL={
    createObjectURL(){return "blob:quickverify-source";},
    revokeObjectURL(value){revoked.push(value);}
  };
  vm.runInNewContext(crop,{window,document,Image,URL,console});
  const viewer=window.BillyQuickVerifyCrop.create({type:"image/jpeg",name:"document.jpg"});
  const slot={children:[],replaceChildren(...children){this.children=children;slots.push(children);},append(...parts){this.children.push(...parts);}};
  await viewer.show({page:1,box_2d:[260,400,325,515]},slot);
  assert.equal(sourceDecoded,1);
  assert.equal(slot.children[0].tagName,"CANVAS");
  assert.equal(slot.children[0].attrs.role,"img");
  assert.match(slot.children[0].attrs["aria-label"],/AI-estimated location/);
  assert.equal(drawCalls.length,1);
  const args=drawCalls[0];
  assert.ok(args[1]>0&&args[2]>0&&args[3]>0&&args[4]>0);
  assert.ok(args[1]+args[3]<=2000);
  assert.ok(args[2]+args[4]<=3000);
  assert.ok(slot.children[0].width<=960&&slot.children[0].height<=420);
  await viewer.show({page:1,box_2d:[300,300,360,450]},slot);
  assert.equal(sourceDecoded,1); // Same file decoded just once.
  assert.equal(drawCalls.length,2);
  viewer.dispose();
  assert.deepEqual(revoked,["blob:quickverify-source"]);
  assert.ok(slots.length>=2);
});

test("Missing evidence doesn't invent an image, and stale crop results are ignored",async()=>{
  let resolveDecode;
  const window={};
  const document={
    createElement(tag){
      const n={
        tagName:tag.toUpperCase(),children:[],textContent:"",
        replaceChildren(...parts){this.children=parts;},
        setAttribute(){},
      };
      if(tag==="canvas")n.getContext=()=>({drawImage(){}});
      return n;
    }
  };
  class Image{
    constructor(){this.naturalWidth=1200;this.naturalHeight=1800;}
    set src(value){}
    decode(){return new Promise(resolve=>{resolveDecode=resolve;});}
  }
  const URL={createObjectURL:()=>"blob:stale",revokeObjectURL(){}};
  vm.runInNewContext(crop,{window,document,Image,URL,console});
  const viewer=window.BillyQuickVerifyCrop.create({type:"image/jpeg",name:"source.jpg"});
  const slot={children:[],replaceChildren(...parts){this.children=parts;},append(...parts){this.children.push(...parts);}};
  await viewer.show(null,slot);
  assert.match(slot.children[0].textContent,/Source crop unavailable/);
  const pending=viewer.show({page:1,box_2d:[200,200,250,300]},slot);
  viewer.cancel();
  resolveDecode();
  await pending;
  // Cancel must not allow a delayed crop to overwrite the current UI.
  assert.equal(slot.children[0].tagName,"P");
  assert.match(slot.children[0].textContent,/Preparing source crop/);
  viewer.dispose();
});
