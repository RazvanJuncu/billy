/* Piggybank's idle flight + chat-opening backflip.
   Decorative only: no AI calls, persistence, blocking input or UI controls. */
(() => {
  "use strict";
  const dock=document.getElementById("billyAssistantDock");
  const sprite=document.getElementById("piggybankFlight");
  const launch=document.getElementById("billyAssistantLaunch");
  const panel=document.getElementById("billyAssistantPanel");
  if(!dock||!sprite||!launch||!panel)return;

  const motion=window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const FLIGHT_MS=3100;
  const BACKFLIP_MS=820;
  const IDLE_MS=45000;
  const MIN_GAP_MS=45000;
  const MAX_GAP_MS=60000;
  const RETRY_MS=8000;
  let nextTimer=null,landingTimer=null,flipTimer=null;
  let flying=false,lastActivity=Date.now(),lastScheduledAt=0;
  let wasExpanded=launch.getAttribute("aria-expanded")==="true";

  const randomGap=()=>MIN_GAP_MS+
    Math.floor(Math.random()*(MAX_GAP_MS-MIN_GAP_MS));

  function clearFlightTimer(){
    if(nextTimer!==null){clearTimeout(nextTimer);nextTimer=null;}
  }
  function land(){
    if(landingTimer!==null){clearTimeout(landingTimer);landingTimer=null;}
    if(!flying)return;
    flying=false;
    dock.classList.remove("is-flying");
  }
  function stopBackflip(){
    if(flipTimer!==null){clearTimeout(flipTimer);flipTimer=null;}
    dock.classList.remove("is-backflipping");
  }
  function homeIsAvailable(){
    return !motion?.matches &&
      document.visibilityState==="visible" &&
      document.body.dataset.billyScreen==="home" &&
      !document.body.classList.contains("auth-locked") &&
      !document.body.classList.contains("billy-preview-open");
  }
  function readyForIdle(){
    return homeIsAvailable() && panel.hidden &&
      launch.getAttribute("aria-expanded")!=="true" &&
      !window.PiggybankHUD?.active?.();
  }
  function canFly(){
    return readyForIdle() &&
      !dock.classList.contains("is-backflipping") &&
      !dock.matches(":hover") &&
      !(document.activeElement===launch&&launch.matches(":focus-visible")) &&
      Date.now()-lastActivity>=IDLE_MS;
  }
  function schedule(delay=randomGap()){
    clearFlightTimer();
    if(!readyForIdle()||flying)return;
    lastScheduledAt=Date.now();
    nextTimer=setTimeout(attempt,delay);
  }
  function attempt(){
    nextTimer=null;
    if(!readyForIdle())return;
    const idleFor=Date.now()-lastActivity;
    if(idleFor<IDLE_MS){
      schedule(IDLE_MS-idleFor+1000);
      return;
    }
    if(!canFly()){
      schedule(RETRY_MS);
      return;
    }
    flying=true;
    dock.classList.add("is-flying");
    landingTimer=setTimeout(()=>{
      land();
      schedule();
    },FLIGHT_MS);
  }
  function backflipOnOpen(){
    if(!homeIsAvailable())return;
    // In particular, stop a flight before showing the opening backflip.
    land();
    stopBackflip();
    dock.classList.add("is-backflipping");
    flipTimer=setTimeout(stopBackflip,BACKFLIP_MS);
  }
  function onActivity(){
    const now=Date.now();
    lastActivity=now;
    if(flying){
      land();
      schedule();
      return;
    }
    // Pointermove may fire at 60+ Hz. Don't restart a long timer every frame.
    if(now-lastScheduledAt>=1000&&readyForIdle())schedule();
  }
  function onStateChange(){
    const expanded=launch.getAttribute("aria-expanded")==="true";
    if(expanded&&!wasExpanded)backflipOnOpen();
    wasExpanded=expanded;

    const available=readyForIdle();
    if(!available){
      land();
      clearFlightTimer();
    }else if(nextTimer===null&&!flying){
      lastActivity=Date.now();
      schedule();
    }

    // Do not leave an animation frozen in the air if the user leaves Home.
    if(!homeIsAvailable())stopBackflip();
  }

  document.addEventListener("pointermove",onActivity,{passive:true});
  document.addEventListener("pointerdown",onActivity,{capture:true,passive:true});
  document.addEventListener("keydown",onActivity,{capture:true});
  document.addEventListener("scroll",onActivity,{capture:true,passive:true});
  document.addEventListener("visibilitychange",onStateChange);
  motion?.addEventListener?.("change",onStateChange);

  const observer=new MutationObserver(onStateChange);
  observer.observe(document.body,{
    attributes:true,attributeFilter:["data-billy-screen","class"]
  });
  observer.observe(panel,{attributes:true,attributeFilter:["hidden"]});
  observer.observe(launch,{attributes:true,attributeFilter:["aria-expanded"]});
  const hud=document.getElementById("piggybankHud");
  if(hud)observer.observe(hud,{attributes:true,attributeFilter:["hidden"]});
  if(readyForIdle())schedule();
})();