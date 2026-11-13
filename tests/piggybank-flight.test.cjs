const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const source=read("site/piggybank-flight.js");
const html=read("site/index.html");
const css=read("site/intelligence-assistant.css");
function harness({reduced=false,visible=true,screen="home"}={}){
  let now=0,nextId=0;
  const jobs=new Map(),observers=[];
  const timers={
    setTimeout(fn,delay){const id=++nextId;jobs.set(id,{fn,at:now+delay});return id},
    clearTimeout(id){jobs.delete(id)},
    advance(ms){
      const until=now+ms;
      while(true){
        let earliest=null;
        for(const [id,job] of jobs){
          if(job.at<=until&&(!earliest||job.at<earliest.at))
            earliest={id,...job};
        }
        if(!earliest)break;
        jobs.delete(earliest.id);now=earliest.at;earliest.fn();
      }
      now=until;
    },jobs
  };
  function node(){
    const attrs={},handlers={},set=new Set();
    return {
      hidden:true,attrs,handlers,
      dataset:{},hover:false,focusVisible:false,
      classList:{add:name=>set.add(name),remove:name=>set.delete(name),contains:name=>set.has(name)},
      addEventListener:(name,fn)=>{(handlers[name]??=[]).push(fn)},
      dispatch:(name)=>{for(const fn of handlers[name]||[])fn({type:name})},
      getAttribute:name=>attrs[name]??null,
      setAttribute:(name,v)=>{attrs[name]=v;notify()},
      matches(selector){
        return selector===":hover"?this.hover:selector===":focus-visible"?this.focusVisible:false;
      }
    };
  }
  const nodes=Object.fromEntries([
    "billyAssistantDock","piggybankFlight","billyAssistantLaunch",
    "billyAssistantPanel","piggybankHud"
  ].map(id=>[id,node()]));
  nodes.billyAssistantLaunch.attrs["aria-expanded"]="false";
  nodes.billyAssistantPanel.hidden=true;
  nodes.piggybankHud.hidden=true;
  const body=node();body.dataset.billyScreen=screen;
  const docEvents={};
  const document={
    body,visibilityState:visible?"visible":"hidden",activeElement:null,
    getElementById:id=>nodes[id]||null,
    addEventListener:(name,fn)=>{(docEvents[name]??=[]).push(fn)},
    dispatch:name=>{for(const fn of docEvents[name]||[])fn({type:name})}
  };
  const motion={matches:reduced,handlers:[],
    addEventListener(name,fn){if(name==="change")this.handlers.push(fn)},
    change(next){this.matches=next;for(const fn of this.handlers)fn()}
  };
  const win={matchMedia:()=>motion,PiggybankHUD:{active:()=>!nodes.piggybankHud.hidden}};
  function notify(){for(const fn of observers)fn()}
  const ctx={
    document,window:win,Date:class extends Date{static now(){return now}},
    Math:{random:()=>0,floor:Math.floor},
    setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout,
    MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}}
  };
  vm.runInNewContext(source,ctx,{filename:"piggybank-flight.js"});
  return {
    document,motion,nodes,body,timers,
    flying:()=>nodes.billyAssistantDock.classList.contains("is-flying"),
    notify
  };
}
test("Piggybank makes a rare 3.1s flight after home-screen inactivity and lands",()=>{
  const h=harness();
  h.timers.advance(179999);assert.equal(h.flying(),false);
  h.timers.advance(1);assert.equal(h.flying(),true);
  h.timers.advance(3099);assert.equal(h.flying(),true);
  h.timers.advance(1);assert.equal(h.flying(),false);
  h.timers.advance(180000);assert.equal(h.flying(),true);
});
test("Movement, clicking or keyboard activity cancels a flight immediately",()=>{
  for(const event of ["pointermove","pointerdown","keydown","scroll"]){
    const h=harness();h.timers.advance(180000);
    assert.equal(h.flying(),true,event);
    h.document.dispatch(event);
    assert.equal(h.flying(),false,event);
    h.timers.advance(3100);assert.equal(h.flying(),false,event);
  }
});
test("Never flies while chat/HUD is open, away from home, or login/preview overlays exist",()=>{
  const variations=[
    h=>{h.nodes.billyAssistantLaunch.attrs["aria-expanded"]="true"},
    h=>{h.nodes.billyAssistantPanel.hidden=false},
    h=>{h.nodes.piggybankHud.hidden=false},
    h=>{h.body.dataset.billyScreen="uploaded"},
    h=>{h.body.classList.add("auth-locked")},
    h=>{h.body.classList.add("billy-preview-open")},
    h=>{h.nodes.billyAssistantDock.hover=true},
    h=>{h.document.activeElement=h.nodes.billyAssistantLaunch;
      h.nodes.billyAssistantLaunch.focusVisible=true}
  ];
  for(const setup of variations){
    const h=harness();setup(h);h.timers.advance(240000);
    assert.equal(h.flying(),false,"Blocked while the product is in use");
  }
});
test("Hides and cancels when tab becomes invisible; resumes with a fresh idle interval",()=>{
  const h=harness();
  h.timers.advance(180000);assert.equal(h.flying(),true);
  h.document.visibilityState="hidden";h.document.dispatch("visibilitychange");
  assert.equal(h.flying(),false);
  assert.equal(h.timers.jobs.size,0);
  h.timers.advance(400000);assert.equal(h.flying(),false);
  h.document.visibilityState="visible";h.document.dispatch("visibilitychange");
  h.timers.advance(180000);assert.equal(h.flying(),true);
});
test("Reduced motion disables flights entirely, including changing the setting mid-flight",()=>{
  const never=harness({reduced:true});
  never.timers.advance(900000);
  assert.equal(never.flying(),false);
  const h=harness();h.timers.advance(180000);
  assert.equal(h.flying(),true);
  h.motion.change(true);
  assert.equal(h.flying(),false);
  assert.equal(h.timers.jobs.size,0);
  h.motion.change(false);
  h.timers.advance(180000);
  assert.equal(h.flying(),true);
});
test("The sprite is decorative and leaves the launcher clickable",()=>{
  assert.match(html,/id="piggybankFlight" class="piggybank-flight" aria-hidden="true"/);
  assert.match(html,/class="piggybank-flight-wings"/);
  assert.match(html,/class="piggybank-flight-mark" src="\.\/piggybank-mark\.svg"/);
  assert.match(html,/piggybank-flight\.js\?v=1\.0\.0/);
  assert.match(html,/intelligence-assistant\.css\?v=0\.3\.1/);
  assert.match(css,/\.piggybank-flight\{/);
  assert.match(css,/pointer-events:none/);
  assert.match(css,/@keyframes piggybank-short-flight/);
  assert.match(css,/@keyframes piggybank-left-flap/);
  assert.match(css,/@keyframes piggybank-right-flap/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.billy-ai-dock\.is-flying \.billy-ai-orbit img\{opacity:0\}/);
  assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|innerHTML/);
});
