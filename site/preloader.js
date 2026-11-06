/* BillyDPI preloader. No remote dependencies or backend secrets.
   Site intro finishes at a cycle boundary, so the logo is static when the
   wordmark appears. Work progress only shows the mark. */
(() => {
  "use strict";
  const splash = document.getElementById("billySplash");
  const work = document.getElementById("billyWorkLoader");
  if (!splash || !work) return;

  const cycleMs = 2350;
  const startedAt = performance.now();
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const activeWork = new Set();
  let pageLoaded = document.readyState === "complete";
  let authReady = document.documentElement.dataset.billyAuthReady === "1";
  let exitScheduled = false;

  function reveal() {
    if (splash.hidden) return;
    splash.classList.add("is-revealing");
    window.setTimeout(() => {
      splash.classList.add("is-leaving");
      splash.setAttribute("aria-hidden","true");
      window.setTimeout(() => { splash.hidden = true; }, reducedMotion ? 130 : 370);
    }, reducedMotion ? 150 : 900);
  }
  function maybeFinish() {
    if (!pageLoaded || !authReady || exitScheduled) return;
    exitScheduled = true;
    if (reducedMotion) { reveal(); return; }
    const elapsed = performance.now() - startedAt;
    const restAt = Math.max(1,Math.ceil((elapsed + 35) / cycleMs)) * cycleMs;
    window.setTimeout(reveal, Math.max(0,restAt - elapsed));
  }

  if (!pageLoaded) window.addEventListener("load",() => { pageLoaded=true;maybeFinish(); },{once:true});
  window.addEventListener("billy:auth-resolved",() => {authReady=true;maybeFinish();});
  // Identity provider may be offline. Let Billy show its own error instead
  // of making the splash block the page indefinitely.
  window.setTimeout(() => {authReady=true;maybeFinish();},8000);
  maybeFinish();

  function startWork(key,label) {
    activeWork.add(key);
    work.setAttribute("aria-label",label || "Processing document");
    work.hidden = false;
    document.body.setAttribute("aria-busy","true");
  }
  function endWork(key) {
    activeWork.delete(key);
    if (!activeWork.size) {
      work.hidden = true;
      document.body.removeAttribute("aria-busy");
    }
  }
  window.BillyLoader = {startWork,endWork,isBusy:()=>activeWork.size>0};
})();
