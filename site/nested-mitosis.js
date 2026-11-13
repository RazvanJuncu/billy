/* BillyDPI nested mitosis v0.3 — compact, smooth, seamless.
   Geometry is advanced on the browser's animation frame clock, rather than
   multiple independently eased CSS keyframes. Flat white circles only. */
(() => {
  "use strict";
  const NS="http://www.w3.org/2000/svg";
  const CENTER_X=255,CENTER_Y=112,RADIUS=46;
  let sequence=0;

  const clamp01=value=>Math.max(0,Math.min(1,value));
  const smooth=(start,end,t)=>{
    const u=clamp01((t-start)/(end-start));
    return u*u*(3-2*u);  // continuous velocity at every phase boundary
  };
  function geometryAt(value){
    const p=clamp01(value);
    const fade=smooth(.28,.82,p);
    const grow=smooth(.035,.87,p);
    const travel=smooth(.04,.94,p);
    const offset=44*(1-travel)+25*Math.sin(Math.PI*travel);
    return {
      parent:{x:CENTER_X-37*fade,r:RADIUS*(1-fade)},
      child:{x:CENTER_X+offset,r:RADIUS*grow}
    };
  }
  const create=(tag,attributes={})=>{
    const element=document.createElementNS(NS,tag);
    for(const [key,value] of Object.entries(attributes))
      element.setAttribute(key,String(value));
    return element;
  };

  function mount(container,options={}){
    if(!container||typeof container.replaceChildren!=="function")
      throw new TypeError("Mitosis requires a mount element");

    const config={
      duration:Math.max(1600,Math.min(9000,Number(options.duration)||3500)),
      loop:Boolean(options.loop)
    };
    const motion=window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const filterId="billy-mitosis-merge-"+(++sequence);
    const svg=create("svg",{
      viewBox:"0 0 510 224",class:"billy-mitosis-svg",
      "aria-hidden":"true",focusable:"false"
    });
    const defs=create("defs");
    const filter=create("filter",{
      id:filterId,x:"160",y:"48",width:"205",height:"128",
      filterUnits:"userSpaceOnUse",
      "color-interpolation-filters":"sRGB"
    });
    // Smaller filter area and less blur avoid expensive full-SVG repainting.
    // Alpha threshold restores a hard white silhouette, with a soft mitosis neck.
    filter.append(
      create("feGaussianBlur",{in:"SourceGraphic",stdDeviation:"2.7",result:"soft"}),
      create("feColorMatrix",{
        in:"soft",type:"matrix",
        values:"1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -12",
        result:"solid"
      })
    );
    defs.append(filter);
    const cells=create("g",{class:"billy-mitosis-cells",filter:"url(#"+filterId+")"});
    const parent=create("circle",{class:"billy-mitosis-parent",cx:CENTER_X,cy:CENTER_Y,r:RADIUS});
    const child=create("circle",{class:"billy-mitosis-child",cx:CENTER_X+44,cy:CENTER_Y,r:0});
    cells.append(parent,child);
    svg.append(defs,cells);

    container.classList.add("billy-mitosis");
    container.setAttribute("role","img");
    container.setAttribute("aria-label",
      "A small white bubble emerges from a larger one, grows as the old bubble disappears, and replaces it in a continuous loop");
    container.replaceChildren(svg);

    let request=null,startStamp=null,pausedAt=null,lastStamp=null,lastCycle=0;
    let playing=false,destroyed=false,stopAfterCycle=1;
    let onStart=typeof options.onStart==="function"?options.onStart:null;
    let onComplete=typeof options.onComplete==="function"?options.onComplete:null;

    function paint(progress){
      const data=geometryAt(progress);
      parent.setAttribute("cx",data.parent.x.toFixed(3));
      parent.setAttribute("r",data.parent.r.toFixed(3));
      child.setAttribute("cx",data.child.x.toFixed(3));
      child.setAttribute("r",data.child.r.toFixed(3));
    }
    function cancel(){
      if(request!==null){
        window.cancelAnimationFrame(request);
        request=null;
      }
    }
    function settle(){
      cancel();playing=false;
      container.classList.remove("is-playing","is-looping");
      container.classList.add("is-complete");
      paint(1);
    }
    function frame(stamp){
      request=null;
      if(destroyed||!playing)return;
      if(startStamp===null)startStamp=stamp;
      lastStamp=stamp;
      const elapsed=Math.max(0,stamp-startStamp);
      const cycles=Math.floor(elapsed/config.duration);
      if(cycles>lastCycle){
        const completed=cycles-lastCycle;
        lastCycle=cycles;
        // Avoid callbacks for thousands of cycles after an inactive background tab.
        for(let i=0;i<Math.min(completed,2);i++)onComplete?.();
      }
      if(!config.loop&&cycles>=stopAfterCycle){
        settle();
        return;
      }
      paint((elapsed%config.duration)/config.duration);
      request=window.requestAnimationFrame(frame);
    }
    function play(){
      if(destroyed)return false;
      cancel();
      container.classList.remove("is-playing","is-looping","is-complete");
      if(motion?.matches){
        settle();
        onComplete?.();
        return false;
      }
      startStamp=null;lastStamp=null;pausedAt=null;lastCycle=0;stopAfterCycle=1;
      paint(0);
      playing=true;
      container.classList.add("is-playing");
      if(config.loop)container.classList.add("is-looping");
      onStart?.();
      request=window.requestAnimationFrame(frame);
      return true;
    }
    function setLoop(value){
      config.loop=Boolean(value);
      if(destroyed||motion?.matches)return;
      if(config.loop){
        if(!playing){play();return;}
        container.classList.add("is-looping");
      }else{
        container.classList.remove("is-looping");
        stopAfterCycle=Math.floor(
          Math.max(0,(lastStamp??startStamp??0)-(startStamp??lastStamp??0))
          /config.duration
        )+1;
      }
    }
    function setDuration(value){
      const duration=Number(value);
      if(!Number.isFinite(duration))return;
      config.duration=Math.max(1600,Math.min(9000,duration));
      play();
    }
    function onMotionChange(){
      if(destroyed)return;
      if(motion?.matches){
        settle();
        onComplete?.();
      }else play();
    }
    function onVisibilityChange(){
      if(!playing||destroyed)return;
      if(document.visibilityState==="hidden"){
        pausedAt=window.performance.now();
        cancel();
      }else if(pausedAt!==null){
        if(startStamp!==null)startStamp+=window.performance.now()-pausedAt;
        pausedAt=null;
        request=window.requestAnimationFrame(frame);
      }
    }
    motion?.addEventListener?.("change",onMotionChange);
    document.addEventListener?.("visibilitychange",onVisibilityChange);
    paint(motion?.matches?1:0);

    return {
      play,setLoop,setDuration,isPlaying:()=>playing,
      destroy(){
        if(destroyed)return;
        destroyed=true;cancel();
        motion?.removeEventListener?.("change",onMotionChange);
        document.removeEventListener?.("visibilitychange",onVisibilityChange);
        container.classList.remove("billy-mitosis","is-playing","is-looping","is-complete");
        container.replaceChildren();
        onStart=null;onComplete=null;
      }
    };
  }
  window.BillyMitosis={mount,geometryAt};
})();