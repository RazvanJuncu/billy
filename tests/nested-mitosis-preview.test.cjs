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
  const frames=new Map();let id=0,now=0;
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
    setAttribute(key,value){this.attributes[key]=String(value)}
    append(...nodes){this.children.push(...nodes)}
    replaceChildren(...nodes){this.children=nodes}
  }
  const mql={
    matches:prefersReducedMotion,handlers:new Set(),
    addEventListener:(event,fn)=>{if(event==="change")mql.handlers.add(fn)},
    removeEventListener:(event,fn)=>{if(event==="change")mql.handlers.delete(fn)},
    change(value){this.matches=value;for(const fn of this.handlers)fn()}
  };
  const docListeners=new Map();
  const document={
    visibilityState:"visible",
    createElementNS:(_,tag)=>new Element(tag),
    addEventListener:(type,fn)=>{const handlers=docListeners.get(type)||[];handlers.push(fn);docListeners.set(type,handlers)},
    removeEventListener:(type,fn)=>{docListeners.set(type,(docListeners.get(type)||[]).filter(f=>f!==fn))},
    dispatch:(type)=>{for(const fn of docListeners.get(type)||[])fn()}
  };
  const window={
    matchMedia:()=>mql,
    performance:{now:()=>now},
    requestAnimationFrame:fn=>{const key=++id;frames.set(key,{fn,at:now+16});return key},
    cancelAnimationFrame:key=>{frames.delete(key)}
  };
  const ctx={document,window,Number,Boolean,Object,TypeError,Math};
  vm.runInNewContext(js,ctx,{filename:"nested-mitosis.js"});
  function advance(ms){
    const end=now+ms;
    while(true){
      let next=null;
      for(const [key,task] of frames){
        if(task.at<=end&&(!next||task.at<next.at))next={...task,key};
      }
      if(!next)break;
      frames.delete(next.key);now=next.at;next.fn(now);
    }
    now=end;
  }
  return {
    window,document,root:new Element("div"),mql,frames,advance,
    now:()=>now,
    create:tag=>new Element(tag)
  };
}
function geometry(h,phase){return h.window.BillyMitosis.geometryAt(phase)}
function radius(element){return Number(element.attributes.r)}
function center(element){return Number(element.attributes.cx)}

test("Two smaller, flat circles use a tightly scoped organic SVG filter",()=>{
  const h=environment(),animation=h.window.BillyMitosis.mount(h.root);
  assert.equal(h.root.children.length,1);
  const svg=h.root.children[0];
  assert.equal(svg.tag,"svg");
  assert.equal(svg.attributes.viewBox,"0 0 510 224");
  assert.deepEqual(svg.children.map(x=>x.tag),["defs","g"]);
  const circles=svg.children[1].children;
  assert.deepEqual(circles.map(x=>x.tag),["circle","circle"]);
  assert.equal(radius(circles[0]),46,"Parent radius reduced from 56 to 46");
  assert.equal(radius(circles[1]),0,"Child initially invisible by size");
  assert.equal(center(circles[0]),255);
  assert.equal(h.root.attributes.role,"img");
  const filter=svg.children[0].children[0];
  assert.equal(filter.tag,"filter");
  assert.equal(filter.attributes.width,"205");
  assert.equal(filter.attributes.height,"128");
  assert.deepEqual(filter.children.map(x=>x.tag),["feGaussianBlur","feColorMatrix"]);
  assert.equal(filter.children[0].attributes.stdDeviation,"2.7");
  assert.match(css,/\.billy-mitosis-cells,/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|box-shadow/);
  animation.destroy();
});

test("Continuous smooth geometry: smaller child buds to right as parent shrinks",()=>{
  const h=environment();
  const start=geometry(h,0),middle=geometry(h,.55),end=geometry(h,1);
  assert.equal(start.parent.r,46);
  assert.equal(start.parent.x,255);
  assert.equal(start.child.r,0);
  assert.ok(geometry(h,.24).child.r>0);
  assert.ok(geometry(h,.24).child.x>255);
  assert.ok(middle.parent.r<46&&middle.parent.r>0);
  assert.ok(middle.child.r>0&&middle.child.r<46);
  assert.ok(middle.child.x>255);
  assert.equal(end.parent.r,0);
  assert.equal(end.child.r,46);
  assert.equal(end.child.x,start.parent.x,
    "The visible full-size child takes exactly the parent's original center");
  // A single analytic smoothstep is used for both circles, not independently
  // eased CSS stages. At native-frame-sized steps no property can jerk.
  const keys=["x","r"];
  let last=geometry(h,0);
  for(let i=1;i<=360;i++){
    const current=geometry(h,i/360);
    for(const role of ["parent","child"])
      for(const key of keys)
        assert.ok(Math.abs(current[role][key]-last[role][key])<1.4,
          "Abrupt geometry change near phase "+i/360+" for "+role+"."+key);
    last=current;
  }
  assert.doesNotMatch(css,/@keyframes|animation-iteration-count|cubic-bezier/);
  assert.match(js,/window\.requestAnimationFrame\(frame\)/);
});

test("Loop stays active and one frame clock drives both circles without any blank reset",()=>{
  const h=environment();
  let starts=0,complete=0;
  const animation=h.window.BillyMitosis.mount(h.root,{
    duration:3500,loop:true,onStart:()=>starts++,onComplete:()=>complete++
  });
  assert.equal(animation.play(),true);
  assert.equal(starts,1);
  assert.equal(h.root.classList.contains("is-looping"),true);
  h.advance(3600);
  assert.equal(complete,1);
  assert.equal(animation.isPlaying(),true);
  assert.equal(h.root.classList.contains("is-complete"),false);
  assert.equal(h.frames.size,1);
  h.advance(3600);
  assert.equal(complete,2);
  assert.equal(starts,1,"Loop does not restart DOM or CSS");
  const svg=h.root.children[0],parent=svg.children[1].children[0],child=svg.children[1].children[1];
  assert.ok(radius(parent)>=0&&radius(parent)<=46);
  assert.ok(radius(child)>=0&&radius(child)<=46);
  animation.setLoop(false);
  h.advance(3600);
  assert.equal(animation.isPlaying(),false);
  assert.equal(h.root.classList.contains("is-complete"),true);
  assert.equal(radius(parent),0);
  assert.equal(radius(child),46);
  assert.equal(center(child),255);
  assert.equal(h.frames.size,0);
  animation.destroy();
});

test("Replay, duration and Loop are real browser controls",()=>{
  const h=environment();let started=0,complete=0;
  const animation=h.window.BillyMitosis.mount(h.root,{
    duration:3500,onStart:()=>started++,onComplete:()=>complete++
  });
  animation.play();h.advance(3600);
  assert.equal(animation.isPlaying(),false);
  assert.equal(complete,1);
  animation.play();
  assert.equal(started,2);
  animation.setDuration(2000);
  assert.equal(started,3);
  assert.equal(animation.isPlaying(),true);
  animation.setLoop(true);
  assert.equal(h.root.classList.contains("is-looping"),true);
  h.advance(2200);
  assert.equal(animation.isPlaying(),true);
  animation.destroy();
  assert.equal(h.frames.size,0);
});

test("Hidden browser tab pauses rather than jumping forward on return",()=>{
  const h=environment();
  const animation=h.window.BillyMitosis.mount(h.root,{loop:true});
  animation.play();
  h.advance(1120);
  const circles=h.root.children[0].children[1].children;
  const before=radius(circles[1]);
  h.document.visibilityState="hidden";h.document.dispatch("visibilitychange");
  assert.equal(h.frames.size,0);
  h.advance(10000);
  assert.equal(radius(circles[1]),before);
  h.document.visibilityState="visible";h.document.dispatch("visibilitychange");
  h.advance(16);
  assert.ok(Math.abs(radius(circles[1])-before)<1,
    "Resume should continue where the bubble was, not jump across 10s");
  animation.destroy();
  assert.equal(h.frames.size,0);
});

test("Reduced-motion option shows a single resting white circle",()=>{
  const h=environment(true);
  const animation=h.window.BillyMitosis.mount(h.root,{loop:true});
  assert.equal(animation.play(),false);
  assert.equal(h.root.classList.contains("is-complete"),true);
  assert.equal(h.frames.size,0);
  const circles=h.root.children[0].children[1].children;
  assert.equal(radius(circles[0]),0);
  assert.equal(radius(circles[1]),46);
  h.mql.change(false);
  assert.equal(animation.isPlaying(),true);
  h.mql.change(true);
  assert.equal(animation.isPlaying(),false);
  assert.equal(h.frames.size,0);
  animation.destroy();
  assert.equal(h.mql.handlers.size,0);
});

test("Separate instances have unique filter IDs",()=>{
  const h=environment();
  const a=h.window.BillyMitosis.mount(h.root);
  const other=h.create("div");
  const b=h.window.BillyMitosis.mount(other);
  const first=h.root.children[0].children[0].children[0].attributes.id;
  const second=other.children[0].children[0].children[0].attributes.id;
  assert.notEqual(first,second);
  assert.equal(h.root.children[0].children[1].attributes.filter,"url(#"+first+")");
  a.destroy();b.destroy();
});

test("Preview loads v0.3 native animation and reduced-size stage, not video",()=>{
  assert.match(html,/nested-mitosis\.css\?v=0\.3\.0/);
  assert.match(html,/nested-mitosis\.js\?v=0\.3\.0/);
  assert.match(html,/width:min\(540px,100%\)/);
  assert.match(html,/window\.BillyMitosis\.mount\(root/);
  assert.match(html,/id="replayButton"/);
  assert.match(html,/id="loopToggle" type="checkbox" checked/);
  assert.match(html,/id="speedSelect"/);
  assert.match(html,/Does not alter the live document-processing flow/);
  assert.doesNotMatch(html,/<video|<canvas|<iframe|\.gif|\.mp4|\.webm/);
  assert.doesNotMatch(js,/fetch\(|localStorage|sessionStorage|eval\(/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});