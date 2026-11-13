const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const source=read("site/piggybank-stroll.js");
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
    "billyAssistantDock","piggybankStroll","billyAssistantLaunch",
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
  vm.runInNewContext(source,ctx,{filename:"piggybank-stroll.js"});
  return {
    document,motion,nodes,body,timers,
    strolling:()=>nodes.billyAssistantDock.classList.contains("is-strolling"),
    notify
  };
}
test("Piggybank flies after 45–60s idle, lands in 3.1s, and can repeat",()=>{
  const h=harness();
  h.timers.advance(44999);assert.equal(h.strolling(),false);
  h.timers.advance(1);assert.equal(h.strolling(),true);
  h.timers.advance(4299);assert.equal(h.strolling(),true);
  h.timers.advance(1);assert.equal(h.strolling(),false);
  h.timers.advance(45000);assert.equal(h.strolling(),true);
});
test("Movement, clicking or keyboard activity cancels a stroll immediately",()=>{
  for(const event of ["pointermove","pointerdown","keydown","scroll"]){
    const h=harness();h.timers.advance(45000);
    assert.equal(h.strolling(),true,event);
    h.document.dispatch(event);
    assert.equal(h.strolling(),false,event);
    h.timers.advance(4300);assert.equal(h.strolling(),false,event);
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
    assert.equal(h.strolling(),false,"Blocked while the product is in use");
  }
});
test("Hides and cancels when tab becomes invisible; resumes with a fresh idle interval",()=>{
  const h=harness();
  h.timers.advance(45000);assert.equal(h.strolling(),true);
  h.document.visibilityState="hidden";h.document.dispatch("visibilitychange");
  assert.equal(h.strolling(),false);
  assert.equal(h.timers.jobs.size,0);
  h.timers.advance(400000);assert.equal(h.strolling(),false);
  h.document.visibilityState="visible";h.document.dispatch("visibilitychange");
  h.timers.advance(45000);assert.equal(h.strolling(),true);
});
test("Reduced motion disables strolls entirely, including changing the setting mid-stroll",()=>{
  const never=harness({reduced:true});
  never.timers.advance(900000);
  assert.equal(never.strolling(),false);
  const h=harness();h.timers.advance(45000);
  assert.equal(h.strolling(),true);
  h.motion.change(true);
  assert.equal(h.strolling(),false);
  assert.equal(h.timers.jobs.size,0);
  h.motion.change(false);
  h.timers.advance(45000);
  assert.equal(h.strolling(),true);
});
test("Idle window resets after real user activity rather than starting on page load",()=>{
  const h=harness();
  h.timers.advance(30000);
  h.document.dispatch("pointermove");
  h.timers.advance(44999);
  assert.equal(h.strolling(),false,"45 seconds of idle must elapse after last activity");
  h.timers.advance(1);
  assert.equal(h.strolling(),true);
});
test("Opening chat triggers one 820 ms backflip without delaying the chat",()=>{
  const h=harness();
  h.nodes.billyAssistantPanel.hidden=false;
  h.nodes.billyAssistantLaunch.setAttribute("aria-expanded","true");
  const flipping=()=>h.nodes.billyAssistantDock.classList.contains("is-backflipping");
  assert.equal(flipping(),true);
  assert.equal(h.nodes.billyAssistantPanel.hidden,false);
  h.notify();
  h.timers.advance(819);
  assert.equal(flipping(),true,"Extra mutations must not restart animation");
  h.timers.advance(1);
  assert.equal(flipping(),false);
  h.nodes.billyAssistantPanel.hidden=true;
  h.nodes.billyAssistantLaunch.setAttribute("aria-expanded","false");
  h.nodes.billyAssistantPanel.hidden=false;
  h.nodes.billyAssistantLaunch.setAttribute("aria-expanded","true");
  assert.equal(flipping(),true,"A new open triggers a fresh backflip");
});
test("Opening chat mid-stroll cancels wings then backflips; reduced motion skips both",()=>{
  const h=harness();h.timers.advance(45000);
  assert.equal(h.strolling(),true);
  h.nodes.billyAssistantPanel.hidden=false;
  h.nodes.billyAssistantLaunch.setAttribute("aria-expanded","true");
  assert.equal(h.strolling(),false);
  assert.equal(h.nodes.billyAssistantDock.classList.contains("is-backflipping"),true);
  h.timers.advance(820);
  assert.equal(h.nodes.billyAssistantDock.classList.contains("is-backflipping"),false);
  const never=harness({reduced:true});
  never.nodes.billyAssistantPanel.hidden=false;
  never.nodes.billyAssistantLaunch.setAttribute("aria-expanded","true");
  assert.equal(never.nodes.billyAssistantDock.classList.contains("is-backflipping"),false);
});
test("Backflip is cancelled when leaving Home or hiding the browser tab",()=>{
  const h=harness();
  h.nodes.billyAssistantPanel.hidden=false;
  h.nodes.billyAssistantLaunch.setAttribute("aria-expanded","true");
  assert.equal(h.nodes.billyAssistantDock.classList.contains("is-backflipping"),true);
  h.body.dataset.billyScreen="uploaded";h.notify();
  assert.equal(h.nodes.billyAssistantDock.classList.contains("is-backflipping"),false);
  assert.equal(h.timers.jobs.size,0);
});
test("The sprite is decorative and leaves the launcher clickable",()=>{
  assert.match(html,/id="piggybankStroll" class="piggybank-stroll" aria-hidden="true"/);
  assert.match(html,/class="piggybank-stroll-mark" src="\.\/piggybank-mark\.svg"/);
  assert.match(html,/piggybank-stroll\.js\?v=1\.0\.0/);
  assert.match(html,/intelligence-assistant\.css\?v=0\.3\.3/);
  assert.match(css,/\.piggybank-stroll\{/);
  assert.match(css,/pointer-events:none/);
  assert.match(css,/@keyframes piggybank-bottom-stroll/);
  assert.match(css,/@keyframes piggybank-tiny-steps/);
  assert.match(css,/@keyframes piggybank-chat-backflip/);
  assert.match(css,/\.billy-ai-dock\.is-backflipping \.billy-ai-orbit img/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.billy-ai-dock\.is-strolling \.billy-ai-orbit img\{opacity:0\}/);
  assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|innerHTML/);
  assert.doesNotMatch(html,/piggybank-wing|piggybank-flight/);
  assert.doesNotMatch(css,/piggybank-wing|piggybank-flight|piggybank-left-flap/);
});
