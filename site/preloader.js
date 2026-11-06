/* BillyDPI 1.2. Orbit while busy, finish at the top of the next revolution,
   morph into the original logo, then reveal the brand name on site load.
   Processing loaders omit the name. */
(() => {
  "use strict";
  const splash=document.getElementById("billySplash");
  const work=document.getElementById("billyWorkLoader");
  if(!splash || !work)return;
  const reducedMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches??false;
  const activeWork=new Set();
  let pageLoaded=document.readyState==="complete";
  let authReady=document.documentElement.dataset.billyAuthReady==="1";
  let splashFinishing=false;
  let cancelWorkFinish=()=>{};

  // The animationiteration event is fired at exactly 360 degrees.
  // Do not stop it between frames and let the small circle jump.
  function settleAtTop(container,afterSettle) {
    const orbit=container.querySelector(".billy-orbit");
    if(!orbit) {afterSettle();return ()=>{};}
    let done=false;
    let settleTimer=0,watchdog=0;
    function stopOrbit() {
      if(done)return;
      done=true;
      orbit.removeEventListener("animationiteration",stopOrbit);
      window.clearTimeout(watchdog);
      container.classList.add("is-settling");
      settleTimer=window.setTimeout(afterSettle,reducedMotion?0:390);
    }
    if(reducedMotion)stopOrbit();
    else{
      orbit.addEventListener("animationiteration",stopOrbit);
      // Guard against browsers that suppress animation events in background tabs.
      watchdog=window.setTimeout(stopOrbit,3300);
    }
    return ()=>{
      orbit.removeEventListener("animationiteration",stopOrbit);
      window.clearTimeout(watchdog);
      window.clearTimeout(settleTimer);
      done=true;
    };
  }
  function reveal() {
    if(splash.hidden)return;
    splash.classList.add("is-revealing");
    window.setTimeout(()=>{
      splash.classList.add("is-leaving");
      splash.setAttribute("aria-hidden","true");
      window.setTimeout(()=>{splash.hidden=true},reducedMotion?120:330);
    },reducedMotion?160:590);
  }
  function maybeFinishSplash(){
    if(!pageLoaded||!authReady||splashFinishing)return;
    splashFinishing=true;
    settleAtTop(splash,reveal);
  }
  if(!pageLoaded)window.addEventListener("load",()=>{
    pageLoaded=true;maybeFinishSplash();
  },{once:true});
  window.addEventListener("billy:auth-resolved",()=>{
    authReady=true;maybeFinishSplash();
  });
  // If Supabase never responds, expose its error instead of covering the page.
  window.setTimeout(()=>{authReady=true;maybeFinishSplash()},8000);
  maybeFinishSplash();

  function startWork(key,label){
    if(!activeWork.size){
      cancelWorkFinish();
      work.classList.remove("is-settling");
      work.hidden=false;
    }
    activeWork.add(key);
    work.setAttribute("aria-label",label||"Processing document");
    document.body.setAttribute("aria-busy","true");
  }
  function endWork(key){
    activeWork.delete(key);
    if(activeWork.size||work.hidden)return;
    cancelWorkFinish=settleAtTop(work,()=>{
      if(activeWork.size)return;
      work.hidden=true;
      document.body.removeAttribute("aria-busy");
    });
  }
  window.BillyLoader={startWork,endWork,isBusy:()=>activeWork.size>0};
})();
