/* Billy nested transition: the approved mitosis animation runs throughout
   child extraction and is dismissed only when review/error is ready. */
(() => {
  "use strict";
  let layer=null,motion=null;
  function stop(){
    // Cancel requestAnimationFrame and visibility listeners before removing DOM.
    motion?.destroy?.();
    motion=null;
    layer?.remove();
    layer=null;
    document.body?.classList.remove("billy-nested-transition-open");
  }
  function reading(){
    if(!layer)return false;
    // The exact text never changes. The approved mitosis loops while the
    // nested child is actually being extracted.
    layer.classList.add("is-reading");
    return true;
  }
  function play(label="Attached document"){
    stop();
    if(!document.body||!window.BillyMitosis?.mount)return false;
    layer=document.createElement("div");
    layer.className="billy-nested-transition";
    layer.setAttribute("role","status");
    layer.setAttribute("aria-label","Preparing nested document");
    layer.setAttribute("aria-live","polite");

    const stage=document.createElement("div");
    stage.className="billy-nested-transition-stage";
    const title=document.createElement("strong");
    title.textContent="Preparing nested document";
    const visual=document.createElement("div");
    visual.className="billy-nested-transition-visual";
    stage.append(title,visual);
    layer.append(stage);
    try{
      motion=window.BillyMitosis.mount(visual,{loop:true,duration:2800});
      document.body.append(layer);
      document.body.classList.add("billy-nested-transition-open");
      motion.play();
      return true;
    }catch{
      stop();
      return false;
    }
  }
  window.BillyNestedTransition={play,reading,stop,isActive:()=>Boolean(layer)};
})();