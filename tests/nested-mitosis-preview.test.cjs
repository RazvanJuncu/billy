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
test("Exactly two flat circles render, with an alpha-based organic bud but no icons",()=>{
  const h=environment(),a=h.window.BillyMitosis.mount(h.root);
  assert.equal(h.root.children.length,1);
  const svg=h.root.children[0];
  assert.equal(svg.tag,"svg");
  assert.equal(svg.attributes.viewBox,"0 0 510 224");
  assert.deepEqual(svg.children.map(x=>x.tag),["defs","g"]);
  assert.deepEqual(svg.children[1].children.map(x=>x.tag),["g","g"]);
  const [parent,child]=svg.children[1].children;
  assert.equal(parent.children[0].tag,"circle");
  assert.equal(child.children[0].tag,"circle");
  assert.equal(parent.children[0].attributes.r,"56");
  assert.equal(child.children[0].attributes.r,"56");
  assert.equal(parent.children[0].attributes.cx,"255");
  assert.equal(child.children[0].attributes.cx,"255");
  assert.equal(h.root.attributes.role,"img");
  assert.equal(svg.children[0].children[0].tag,"filter");
  assert.deepEqual(svg.children[0].children[0].children.map(x=>x.tag),
    ["feGaussianBlur","feColorMatrix"]);
  assert.match(css,/\.billy-mitosis-cells\{fill:#f7f7f7\}/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|box-shadow/);
  assert.doesNotMatch(js,/create\("image"|create\("video"/);
  a.destroy();
});
test("Children bud to the right, grow to parent size, while parent disappears",()=>{
  assert.match(css,/@keyframes billy-mitosis-parent-cycle/);
  assert.match(css,/@keyframes billy-mitosis-child-cycle/);
  assert.match(css,/0%,13%\{opacity:1;transform:translateX\(0\) scale\(1\)\}/);
  assert.match(css,/82%,100%\{opacity:0;transform:translateX\(-60px\) scale\(0\)\}/);
  assert.match(css,/14%\{opacity:1;transform:translateX\(52px\) scale\(\.14\)\}/);
  assert.match(css,/91%,100%\{opacity:1;transform:translateX\(0\) scale\(1\)\}/);
  assert.match(css,/\.billy-mitosis\.is-complete \.billy-mitosis-parent/);
  assert.match(css,/\.billy-mitosis\.is-complete \.billy-mitosis-child/);
});
test("Infinite loop leaves the SVG playing without fading or resetting between generations",()=>{
  const h=environment();let starts=0,completed=0;
  const a=h.window.BillyMitosis.mount(h.root,{
    duration:3500,loop:true,onStart:()=>starts++,onComplete:()=>completed++
  });
  assert.equal(a.play(),true);
  assert.equal(starts,1);
  assert.equal(h.root.classList.contains("is-playing"),true);
  assert.equal(h.root.classList.contains("is-looping"),true);
  h.advance(3500);
  assert.equal(completed,1);
  assert.equal(a.isPlaying(),true);
  assert.equal(h.root.classList.contains("is-playing"),true);
  assert.equal(h.root.classList.contains("is-complete"),false);
  assert.equal(h.root.classList.contains("is-resetting"),false);
  assert.equal(h.timers.size,1);
  h.advance(3500);
  assert.equal(completed,2);
  assert.equal(starts,1,"CSS loops without restarting JS or forcing reflow");
  a.setLoop(false);
  h.advance(3500);
  assert.equal(completed,3);
  assert.equal(a.isPlaying(),false);
  assert.equal(h.root.classList.contains("is-complete"),true);
  assert.equal(h.timers.size,0);
  a.destroy();
});
test("Replay, animation speed and loop toggle work after completion",()=>{
  const h=environment();let starts=0;
  const a=h.window.BillyMitosis.mount(h.root,{duration:3500,onStart:()=>starts++});
  assert.equal(a.play(),true);
  h.advance(3500);
  assert.equal(a.isPlaying(),false);
  assert.equal(h.root.classList.contains("is-complete"),true);
  a.play();
  assert.equal(starts,2);
  a.setDuration(2000);
  assert.equal(starts,3);
  assert.equal(h.root.style.values["--billy-mitosis-duration"],"2000ms");
  a.setLoop(true);
  assert.equal(h.root.classList.contains("is-looping"),true);
  h.advance(2000);
  assert.equal(a.isPlaying(),true);
  a.destroy();
  assert.equal(h.timers.size,0);
});
test("Reduced-motion mode shows only one full-size resting circle",()=>{
  const h=environment(true);
  const a=h.window.BillyMitosis.mount(h.root,{loop:true});
  assert.equal(a.play(),false);
  assert.equal(h.root.classList.contains("is-complete"),true);
  assert.equal(h.timers.size,0);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.billy-mitosis-parent\{opacity:0!important;transform:scale\(0\)!important\}/);
  assert.match(css,/\.billy-mitosis-child\{opacity:1!important;transform:translateX\(0\) scale\(1\)!important\}/);
  h.mql.change(false);
  assert.equal(a.isPlaying(),true);
  h.mql.change(true);
  assert.equal(a.isPlaying(),false);
  assert.equal(h.timers.size,0);
  a.destroy();
  assert.equal(h.mql.handlers.size,0);
});
test("Each instance has a unique SVG filter identifier",()=>{
  const h=environment();
  const a=h.window.BillyMitosis.mount(h.root);
  const second=new h.root.constructor("div");
  const b=h.window.BillyMitosis.mount(second);
  const firstId=h.root.children[0].children[0].children[0].attributes.id;
  const secondId=second.children[0].children[0].children[0].attributes.id;
  assert.notEqual(firstId,secondId);
  assert.equal(h.root.children[0].children[1].attributes.filter,"url(#"+firstId+")");
  a.destroy();b.destroy();
});
test("Live preview is a real reusable CSS/SVG animation with no GIF or video",()=>{
  assert.match(html,/nested-mitosis\.css\?v=0\.2\.0/);
  assert.match(html,/nested-mitosis\.js\?v=0\.2\.0/);
  assert.match(html,/window\.BillyMitosis\.mount\(root/);
  assert.match(html,/id="mitosisPreview"/);
  assert.match(html,/id="replayButton"/);
  assert.match(html,/id="loopToggle" type="checkbox" checked/);
  assert.match(html,/id="speedSelect"/);
  assert.match(html,/the child grows; the parent disappears/i);
  assert.match(html,/Does not alter the live document-processing flow/);
  assert.doesNotMatch(html,/<video|<canvas|<iframe|\.gif|\.mp4|\.webm/);
  assert.doesNotMatch(js,/fetch\(|localStorage|sessionStorage|eval\(/);
  assert.doesNotMatch(js,/is-resetting|hold:|resetTimer|classList\.add\("is-resetting"\)/);
  assert.doesNotMatch(css,/\.is-resetting|animation:.*fade|opacity:0;transition/);
});