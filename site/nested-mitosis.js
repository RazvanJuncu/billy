/* BillyDPI nested mitosis — one bubble replaces another, seamlessly looped.
   Real browser-native SVG + CSS: flat white shapes, no frames/videos/API calls.
   Shared by the standalone preview and a future production transition. */
(() => {
  "use strict";
  const NS="http://www.w3.org/2000/svg";
  let sequence=0;
  const create=(tag,attributes={})=>{
    const node=document.createElementNS(NS,tag);
    for(const [key,value] of Object.entries(attributes))
      node.setAttribute(key,String(value));
    return node;
  };

  function mount(container,options={}){
    if(!container||typeof container.replaceChildren!=="function")
      throw new TypeError("Mitosis requires a mount element");

    const config={
      duration:Math.max(1600,Math.min(9000,Number(options.duration)||3500)),
      loop:Boolean(options.loop)
    };
    const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const filterId="billy-mitosis-merge-"+(++sequence);
    const svg=create("svg",{
      viewBox:"0 0 510 224",
      class:"billy-mitosis-svg",
      "aria-hidden":"true",
      focusable:"false"
    });

    // Alpha-only threshold creates a flat, solid organic neck while the two
    // circles overlap. No glass, glow, gradients or visible Gaussian blur.
    const defs=create("defs");
    const filter=create("filter",{
      id:filterId,
      x:"0",y:"0",width:"510",height:"224",
      filterUnits:"userSpaceOnUse",
      "color-interpolation-filters":"sRGB"
    });
    filter.append(
      create("feGaussianBlur",{in:"SourceGraphic",stdDeviation:"5",result:"soft"}),
      create("feColorMatrix",{
        in:"soft",type:"matrix",
        values:"1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -12",
        result:"solid"
      })
    );
    defs.append(filter);

    const cells=create("g",{
      class:"billy-mitosis-cells",
      filter:"url(#"+filterId+")"
    });
    const parent=create("g",{class:"billy-mitosis-parent"});
    parent.append(create("circle",{cx:255,cy:112,r:56}));
    const child=create("g",{class:"billy-mitosis-child"});
    child.append(create("circle",{cx:255,cy:112,r:56}));
    cells.append(parent,child);
    svg.append(defs,cells);

    container.classList.add("billy-mitosis");
    container.setAttribute("role","img");
    container.setAttribute("aria-label",
      "A small white circle buds from the right of a large circle, grows as the parent shrinks, and replaces it in a seamless loop");
    container.replaceChildren(svg);

    let timer=null,playing=false,destroyed=false;
    let onComplete=typeof options.onComplete==="function"?options.onComplete:null;
    let onStart=typeof options.onStart==="function"?options.onStart:null;
    function clear(){
      if(timer!==null){clearTimeout(timer);timer=null;}
    }
    function completeCycle(){
      timer=null;
      if(destroyed||!playing)return;
      onComplete?.();
      if(config.loop&&!reduced?.matches){
        // CSS runs infinitely without removing the animation or fading/resetting
        // the SVG. At 100%, the child is exactly the initial parent's shape
        // and position, so a new generation starts at the same pixels.
        timer=setTimeout(completeCycle,config.duration);
      }else{
        playing=false;
        container.classList.remove("is-playing","is-looping");
        container.classList.add("is-complete");
      }
    }
    function play(){
      if(destroyed)return false;
      clear();
      container.style.setProperty("--billy-mitosis-duration",config.duration+"ms");
      container.classList.remove("is-playing","is-looping","is-complete");
      if(reduced?.matches){
        container.classList.add("is-complete");
        playing=false;
        onComplete?.();
        return false;
      }
      // Force a fresh CSS timeline for an explicit replay or speed change.
      void container.offsetWidth;
      container.classList.add("is-playing");
      if(config.loop)container.classList.add("is-looping");
      playing=true;
      onStart?.();
      timer=setTimeout(completeCycle,config.duration);
      return true;
    }
    function setLoop(value){
      config.loop=Boolean(value);
      if(destroyed||reduced?.matches)return;
      if(config.loop){
        if(!playing){play();return;}
        container.classList.add("is-looping");
      }
      // Turning loop off takes effect *at the next completed generation*.
      // No mid-cycle snap; CSS keeps animating until completeCycle().
    }
    function setDuration(value){
      const duration=Number(value);
      if(!Number.isFinite(duration))return;
      config.duration=Math.max(1600,Math.min(9000,duration));
      play();
    }
    function onMotionChange(){
      if(destroyed)return;
      if(reduced?.matches){
        clear();playing=false;
        container.classList.remove("is-playing","is-looping");
        container.classList.add("is-complete");
        onComplete?.();
      }else play();
    }
    reduced?.addEventListener?.("change",onMotionChange);
    return {
      play,setLoop,setDuration,
      isPlaying:()=>playing,
      destroy(){
        if(destroyed)return;
        destroyed=true;clear();
        reduced?.removeEventListener?.("change",onMotionChange);
        container.classList.remove("billy-mitosis","is-playing","is-looping","is-complete");
        container.replaceChildren();
        onComplete=null;onStart=null;
      }
    };
  }
  window.BillyMitosis={mount};
})();