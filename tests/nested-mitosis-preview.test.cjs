const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const js=read("site/nested-mitosis.js");
const css=read("site/nested-mitosis.css");
const html=read("site/nested-mitosis-preview.html");

function environment(prefersReducedMotion=false){
  const timers=new Map();
  let next=0,now=0;
  class Element{
    constructor(tag){
      this.tag=tag;this.attributes={};this.children=[];this.style={values:{},
        setProperty:(key,val)=>{this.style.values[key]=val}};
      this.classNames=new Set();
      this.classList={
        add:(...names)=>names.forEach(x=>this.classNames.add(x)),
        remove:(...names)=>names.forEach(x=>this.classNames.delete(x)),
        contains:name=>this.classNames.has(name)
      };
      this.offsetWidth=520;
    }
    setAttribute(k,v){this.attributes[k]=v}
    append(...nodes){this.children.push(...nodes)}
    replaceChildren(...nodes){this.children=nodes}
  }
  const mql={
    matches:prefersReducedMotion,handlers:new Set(),
    addEventListener:(event,fn)=>{if(event==="change")mql.handlers.add(fn)},
    removeEventListener:(event,fn)=>{if(event==="change")mql.handlers.delete(fn)},
    change:(value)=>{mql.matches=value;for(const handler of mql.handlers)handler()}
  };
  const ctx={
    document:{createElementNS:(_,tag)=>new Element(tag)},
    window:{matchMedia:()=>mql},
    setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:now+delay});return id},
    clearTimeout:id=>timers.delete(id),Number,Boolean,Object,TypeError
  };
  vm.runInNewContext(js,ctx,{filename:"nested-mitosis.js"});
  const advance=ms=>{
    const end=now+ms;
    while(true){
      let soonest=null;
      for(const [id,task] of timers)
        if(task.at<=end&&(!soonest||task.at<soonest.at))soonest={...task,id};
      if(!soonest)break;
      timers.delete(soonest.id);now=soonest.at;soonest.fn();
    }
    now=end;
  };
  return {window:ctx.window,root:new Element("div"),advance,mql,timers};
}
test("Mitosis creates precisely three flat SVG circles with no document icons",()=>{
  const h=environment(),animation=h.window.BillyMitosis.mount(h.root);
  assert.equal(h.root.children.length,1);
  const svg=h.root.children[0];
  assert.equal(svg.tag,"svg");
  assert.equal(svg.attributes.viewBox,"0 0 510 224");
  assert.deepEqual(svg.children.map(x=>x.tag),["circle","g","g"]);
  assert.equal(svg.children[1].children[0].tag,"circle");
  assert.equal(svg.children[2].children[0].tag,"circle");
  assert.equal(h.root.attributes.role,"img");
  assert.ok(!svg.children.some(x=>x.tag==="image"),"No screenshots or image frames");
  assert.match(css,/\.billy-mitosis-parent\{fill:#f7f7f7\}/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|filter:blur|box-shadow/);
  animation.destroy();
});
test("The chain builds in order and remains visible after completion",()=>{
  const h=environment();let starts=0,completed=0;
  const a=h.window.BillyMitosis.mount(h.root,{
    duration:3500,onStart:()=>starts++,onComplete:()=>completed++
  });
  assert.equal(a.play(),true);
  assert.equal(starts,1);
  assert.equal(h.root.classList.contains("is-playing"),true);
  h.advance(3539);
  assert.equal(completed,0);
  h.advance(1);
  assert.equal(completed,1);
  assert.equal(h.root.classList.contains("is-complete"),true);
  assert.equal(a.isPlaying(),false);
  assert.equal(h.timers.size,0);
  a.play();
  assert.equal(starts,2);
  assert.equal(h.root.classList.contains("is-complete"),false);
  a.destroy();
  assert.equal(h.root.children.length,0);
  assert.equal(h.timers.size,0);
});
test("Optional loop and speed controls restart real browser animation",()=>{
  const h=environment();
  const a=h.window.BillyMitosis.mount(h.root,{duration:3500,hold:900,loop:true});
  a.play();h.advance(3540);
  assert.equal(h.root.classList.contains("is-complete"),true);
  h.advance(900);
  assert.equal(h.root.classList.contains("is-resetting"),true);
  h.advance(240);
  assert.equal(a.isPlaying(),true,"Loop must start a new animation cycle");
  a.setLoop(false);
  a.setDuration(2000);
  assert.equal(h.root.style.values["--billy-mitosis-duration"],"2000ms");
  assert.equal(a.isPlaying(),true);
  a.destroy();
  assert.equal(h.timers.size,0);
});
test("Reduced-motion users see a static three-circle final state",()=>{
  const h=environment(true);
  const a=h.window.BillyMitosis.mount(h.root,{loop:true});
  assert.equal(a.play(),false);
  assert.equal(h.root.classList.contains("is-complete"),true);
  assert.equal(h.timers.size,0);
  h.mql.change(false);
  assert.equal(a.isPlaying(),true);
  h.mql.change(true);
  assert.equal(a.isPlaying(),false);
  assert.equal(h.timers.size,0);
  a.destroy();
  assert.equal(h.mql.handlers.size,0);
});
test("Live preview loads the same production-ready CSS and JS, with no media files",()=>{
  assert.match(html,/nested-mitosis\.css\?v=0\.1\.0/);
  assert.match(html,/nested-mitosis\.js\?v=0\.1\.0/);
  assert.match(html,/window\.BillyMitosis\.mount\(root/);
  assert.match(html,/id="mitosisPreview"/);
  assert.match(html,/id="replayButton"/);
  assert.match(html,/id="loopToggle"/);
  assert.match(html,/id="speedSelect"/);
  assert.match(html,/Does not alter the live document-processing flow/);
  assert.doesNotMatch(html,/<video|<canvas|<iframe|\.gif|\.mp4|\.webm/);
  assert.doesNotMatch(js,/fetch\(|localStorage|sessionStorage|eval\(/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
