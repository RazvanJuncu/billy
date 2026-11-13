/* BillyDPI nested document mitosis — flat white circles, browser-native SVG/CSS.
   Reusable on the production transition; preview page imports this same module.
   No video, canvas, images, network calls, AI or persistent state. */
(() => {
  "use strict";
  const NS="http://www.w3.org/2000/svg";
  const create=(tag,attributes={})=>{
    const node=document.createElementNS(NS,tag);
    for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
    return node;
  };
  function mount(container,options={}){
    if(!container||typeof container.replaceChildren!=="function")
      throw new TypeError("Mitosis requires a mount element");
    const config={
      duration:Math.max(1600,Math.min(9000,Number(options.duration)||3500)),
      hold:Math.max(400,Math.min(6000,Number(options.hold)||1400)),
      loop:Boolean(options.loop)
    };
    const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const svg=create("svg",{
      viewBox:"0 0 510 224",
      class:"billy-mitosis-svg",
      "aria-hidden":"true",
      focusable:"false"
    });
    const parent=create("circle",{class:"billy-mitosis-parent",cx:150,cy:112,r:55});
    const one=create("g",{class:"billy-mitosis-first"});
    one.append(create("circle",{cx:150,cy:112,r:33}));
    const two=create("g",{class:"billy-mitosis-second"});
    two.append(create("circle",{cx:150,cy:112,r:18}));
    svg.append(parent,one,two);
    container.classList.add("billy-mitosis");
    container.setAttribute("role","img");
    container.setAttribute("aria-label",
      "A large white circle releases a smaller circle, which releases an even smaller one");
    container.replaceChildren(svg);
    let timer=null,resetTimer=null,playing=false,destroyed=false;
    let onComplete=typeof options.onComplete==="function"?options.onComplete:null;
    let onStart=typeof options.onStart==="function"?options.onStart:null;
    const clear=()=>{
      if(timer!==null){clearTimeout(timer);timer=null;}
      if(resetTimer!==null){clearTimeout(resetTimer);resetTimer=null;}
    };
    function finish(){
      timer=null;
      if(destroyed)return;
      container.classList.add("is-complete");
      playing=false;
      onComplete?.();
      if(config.loop&&!reduced?.matches){
        resetTimer=setTimeout(()=>{
          resetTimer=null;
          if(destroyed)return;
          container.classList.add("is-resetting");
          resetTimer=setTimeout(()=>{
            resetTimer=null;
            if(!destroyed)play();
          },240);
        },config.hold);
      }
    }
    function play(){
      if(destroyed)return false;
      clear();
      container.style.setProperty("--billy-mitosis-duration",config.duration+"ms");
      container.classList.remove("is-playing","is-complete","is-resetting");
      if(reduced?.matches){
        container.classList.add("is-complete");
        playing=false;
        onComplete?.();
        return false;
      }
      // Reflow is deliberate: a replay must restart the exact CSS animation.
      void container.offsetWidth;
      container.classList.add("is-playing");
      playing=true;
      onStart?.();
      timer=setTimeout(finish,config.duration+40);
      return true;
    }
    function setLoop(value){
      config.loop=Boolean(value);
      if(!config.loop&&resetTimer!==null){
        clearTimeout(resetTimer);resetTimer=null;
        container.classList.remove("is-resetting");
      }
      if(config.loop&&!playing&&container.classList.contains("is-complete")&&!reduced?.matches){
        resetTimer=setTimeout(play,config.hold);
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
      if(reduced?.matches){
        clear();playing=false;
        container.classList.remove("is-playing","is-resetting");
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
        container.classList.remove("billy-mitosis","is-playing","is-complete","is-resetting");
        container.replaceChildren();
        onComplete=null;onStart=null;
      }
    };
  }
  window.BillyMitosis={mount};
})();