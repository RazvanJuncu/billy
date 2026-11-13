/* Piggybank's rare idle easter egg; no AI calls, persistence or UI obstruction. */
(() => {
  "use strict";
  const dock=document.getElementById("billyAssistantDock");
  const sprite=document.getElementById("piggybankFlight");
  const launch=document.getElementById("billyAssistantLaunch");
  const panel=document.getElementById("billyAssistantPanel");
  if(!dock||!sprite||!launch||!panel)return;

  const motion=window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const FLIGHT_MS=3100;
  const IDLE_MS=45000;
  const RETRY_MS=60000;
  const MIN_GAP_MS=3*60*1000;
  const MAX_GAP_MS=6*60*1000;
  let nextTimer=null,landingTimer=null,flying=false,lastActivity=Date.now();

  const randomGap=()=>MIN_GAP_MS+Math.floor(Math.random()*(MAX_GAP_MS-MIN_GAP_MS));
  function clearTimers(){
    if(nextTimer!==null){clearTimeout(nextTimer);nextTimer=null;}
    if(landingTimer!==null){clearTimeout(landingTimer);landingTimer=null;}
  }
  function land(){
    if(landingTimer!==null){clearTimeout(landingTimer);landingTimer=null;}
    if(!flying)return;
    flying=false;
    dock.classList.remove("is-flying");
  }
  function canFly(){
    return !motion?.matches &&
      document.visibilityState==="visible" &&
      document.body.dataset.billyScreen==="home" &&
      !document.body.classList.contains("auth-locked") &&
      !document.body.classList.contains("billy-preview-open") &&
      panel.hidden &&
      launch.getAttribute("aria-expanded")!=="true" &&
      !window.PiggybankHUD?.active?.() &&
      !dock.matches(":hover") &&
      !(document.activeElement===launch && launch.matches(":focus-visible")) &&
      Date.now()-lastActivity>=IDLE_MS;
  }
  function schedule(delay=randomGap()){
    if(nextTimer!==null)clearTimeout(nextTimer);
    nextTimer=setTimeout(attempt,delay);
  }
  function attempt(){
    nextTimer=null;
    if(!canFly()){schedule(RETRY_MS);return;}
    flying=true;
    dock.classList.add("is-flying");
    landingTimer=setTimeout(()=>{
      land();
      schedule();
    },FLIGHT_MS);
  }
  function onActivity(){
    lastActivity=Date.now();
    if(flying){
      land();
      schedule();
    }
  }
  function onStateChange(){
    if(!canFly()&&flying)land();
    // Going to another screen, opening chat/HUD, hiding the tab or switching
    // the accessibility preference should not leave a ghost pig in the air.
    if(document.visibilityState!=="visible"||motion?.matches){
      clearTimers();
      return;
    }
    if(nextTimer===null&&!flying)schedule();
  }
  // A passing pointer does not restart the long timer; the 45-second idle gate
  // is enough. Any user interaction cancels a flight immediately.
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
  if(document.visibilityState==="visible"&&!motion?.matches)schedule();
})();