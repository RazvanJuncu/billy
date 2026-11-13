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
    // The installed PWA may briefly use an older simple.css from its offline
    // cache. Constrain the *production* loader at its source, not only in a
    // stylesheet: without these bounds the SVG can expand to viewport width.
    layer.style.cssText="position:fixed;inset:0;z-index:1450;display:flex;"+
      "align-items:center;justify-content:center;box-sizing:border-box;"+
      "width:100%;height:100%;padding:24px;background:#050607;color:#f2f2f2;";
    layer.setAttribute("role","status");
    layer.setAttribute("aria-label","Preparing nested document");
    layer.setAttribute("aria-live","polite");

    const stage=document.createElement("div");
    stage.className="billy-nested-transition-stage";
    stage.style.cssText="display:flex;flex-direction:column;align-items:center;"+
      "justify-content:center;gap:16px;width:100%;max-width:460px;"+
      "box-sizing:border-box;text-align:center;flex:0 1 auto;";
    const title=document.createElement("strong");
    title.textContent="Preparing nested document";
    title.style.cssText="display:block;margin:0;max-width:100%;"+
      "color:#f3f3f3;font-size:clamp(20px,3.2vw,27px);font-weight:650;"+
      "line-height:1.3;letter-spacing:-.035em;text-align:center;";
    const visual=document.createElement("div");
    visual.className="billy-nested-transition-visual";
    // ~72px diameter on desktop (400 * 92/510), not viewport-sized.
    visual.style.cssText="display:block;width:400px;max-width:100%;"+
      "height:auto;flex:0 0 auto;box-sizing:border-box;";
    stage.append(title,visual);
    layer.append(stage);
    try{
      motion=window.BillyMitosis.mount(visual,{loop:true,duration:2800});
      // Defensive width limits also cover an outdated SVG stylesheet.
      const svg=visual.querySelector?.("svg");
      if(svg)svg.style.cssText="display:block;width:100%;max-width:100%;"+
        "height:auto;aspect-ratio:510 / 224;";
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