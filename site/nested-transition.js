/* Billy nested transition: visual continuity from approved parent to attached child. */
(() => {
  "use strict";
  let layer=null,titleNode=null,detailNode=null;
  function glyph(kind){
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 24 24");
    svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");
    svg.setAttribute("stroke-width","1.7");svg.setAttribute("stroke-linecap","round");
    svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");
    const paths=kind==="receipt"?
      ["M5 3h14v18l-3-2-4 2-4-2-3 2z","M8 8h8","M8 12h6","M8 16h4"]:
      ["M6 3h9l4 4v14H6z","M15 3v5h4","M9 12h7","M9 16h7"];
    for(const d of paths){
      const path=document.createElementNS("http://www.w3.org/2000/svg","path");
      path.setAttribute("d",d);svg.append(path);
    }
    return svg;
  }
  function stop(){
    layer?.remove();layer=null;titleNode=null;detailNode=null;
    document.body?.classList.remove("billy-nested-transition-open");
  }
  // After the one-time handoff animation finishes, keep a stable progress
  // surface until the child has actually reached review or an error state.
  // Never imply that processing finished just because the animation ended.
  function reading(){
    if(!layer)return false;
    layer.classList.add("is-reading");
    if(titleNode)titleNode.textContent="Reading nested document";
    return true;
  }
  function play(label="Attached document"){
    stop();
    if(!document.body)return false;
    layer=document.createElement("div");layer.className="billy-nested-transition";
    layer.setAttribute("role","status");layer.setAttribute("aria-live","polite");
    const card=document.createElement("div");card.className="billy-nested-transition-card";
    const visual=document.createElement("div");visual.className="billy-nested-transition-visual";
    const parent=document.createElement("div");parent.className="billy-nested-transition-parent";
    parent.append(glyph("document"));
    const branch=document.createElement("div");branch.className="billy-nested-transition-path";
    const child=document.createElement("div");child.className="billy-nested-transition-child";
    child.append(glyph("receipt"));
    visual.append(parent,branch,child);
    const title=document.createElement("strong");title.textContent="Preparing nested document";
    const detail=document.createElement("p");detail.textContent=String(label||"Attached document").slice(0,65);
    titleNode=title;detailNode=detail;
    card.append(visual,title,detail);layer.append(card);
    document.body.append(layer);document.body.classList.add("billy-nested-transition-open");
    return true;
  }
  window.BillyNestedTransition={play,reading,stop,isActive:()=>Boolean(layer)};
})();