/* Billy Stage 3A: local multi-document separation; no server-side source copies.
   AI boxes are only proposals. Every crop must be reviewed before use. */
(() => {
  "use strict";
  const NS="http://www.w3.org/2000/svg";
  const make=(tag,cls,text)=>{
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text!==undefined)n.textContent=text;
    return n;
  };
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const validBox=b=>b&&["x1","y1","x2","y2"].every(k=>Number.isFinite(b[k])&&b[k]>=0&&b[k]<=1000)&&b.x2-b.x1>=80&&b.y2-b.y1>=80;
  const normalize=regions=>{
    const result=[];
    for(const item of (Array.isArray(regions)?regions:[]).slice(0,4)){
      const rect={label:String(item?.label||"Document").slice(0,50)};
      for(const k of ["x1","y1","x2","y2"])rect[k]=Math.round(Number(item?.[k]));
      if(!validBox(rect))continue;
      result.push(rect);
    }
    return result;
  };
  let session=null,overlay=null,previousFocus=null,drag=null,generation=0,objectUrl=null;
  const filename=(original,index)=>original.replace(/\.[^.]+$/,"").replace(/[^a-z0-9_-]/gi,"-").slice(0,35)+"-part-"+(index+1)+".jpg";
  function clearObjectUrl(){
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
  }
  function close(){
    if(!overlay)return;
    overlay.remove();overlay=null;drag=null;
    document.body.classList.remove("billy-multi-open");
    document.removeEventListener("keydown",onKey);
    previousFocus?.focus?.();previousFocus=null;
  }
  function onKey(e){
    if(e.key==="Escape"){e.preventDefault();close();return;}
    if(e.key!=="Tab"||!overlay)return;
    const items=[...overlay.querySelectorAll('button:not([disabled])')];
    if(!items.length)return;
    if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items[items.length-1].focus();}
    else if(!e.shiftKey&&document.activeElement===items[items.length-1]){e.preventDefault();items[0].focus();}
  }
  function updateLauncher(){
    let launch=document.getElementById("billyMultiResume");
    if(!launch){
      const target=document.getElementById("simpleUploadNote");
      if(!target)return;
      launch=make("button","billy-multi-resume");
      launch.id="billyMultiResume";launch.type="button";
      launch.addEventListener("click",()=>void reopen());
      target.after(launch);
    }
    if(!session){launch.hidden=true;return;}
    const remaining=session.boxes.filter((_,i)=>!session.completed.has(i)).length;
    launch.hidden=remaining===0&&session.boxes.length>0;
    launch.textContent=remaining===1?"Next separated document":"Separated documents · "+remaining+" remaining";
  }
  function cancelSession(){
    session=null;generation++;close();clearObjectUrl();updateLauncher();
  }
  async function loadImage(file){
    const url=URL.createObjectURL(file);
    try{
      const image=new Image();
      image.src=url;
      await image.decode();
      if(!image.naturalWidth||!image.naturalHeight)throw Error("Image is empty.");
      return image;
    }finally{URL.revokeObjectURL(url);}
  }
  function position(rect){
    return {left:rect.x1/10+"%",top:rect.y1/10+"%",
      width:(rect.x2-rect.x1)/10+"%",height:(rect.y2-rect.y1)/10+"%"};
  }
  function beginDrag(event,index,corner,viewport){
    if(event.button!==undefined&&event.button!==0)return;
    event.preventDefault();event.stopPropagation();
    const b=session.boxes[index];
    drag={index,corner,startX:event.clientX,startY:event.clientY,
      rect:{...b},width:viewport.clientWidth,height:viewport.clientHeight};
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function moveDrag(event,viewport){
    if(!drag||!session)return;
    const dx=(event.clientX-drag.startX)/Math.max(1,drag.width)*1000;
    const dy=(event.clientY-drag.startY)/Math.max(1,drag.height)*1000;
    const b=drag.rect,newBox={...b};
    if(drag.corner==="move"){
      const shiftX=clamp(dx,-b.x1,1000-b.x2),shiftY=clamp(dy,-b.y1,1000-b.y2);
      newBox.x1=Math.round(b.x1+shiftX);newBox.x2=Math.round(b.x2+shiftX);
      newBox.y1=Math.round(b.y1+shiftY);newBox.y2=Math.round(b.y2+shiftY);
    }else{
      if(drag.corner.includes("w"))newBox.x1=Math.round(clamp(b.x1+dx,0,b.x2-80));
      if(drag.corner.includes("e"))newBox.x2=Math.round(clamp(b.x2+dx,b.x1+80,1000));
      if(drag.corner.includes("n"))newBox.y1=Math.round(clamp(b.y1+dy,0,b.y2-80));
      if(drag.corner.includes("s"))newBox.y2=Math.round(clamp(b.y2+dy,b.y1+80,1000));
    }
    session.boxes[drag.index]=newBox;
    const element=viewport.querySelector('[data-region="'+drag.index+'"]');
    if(element)Object.assign(element.style,position(newBox));
  }
  function stopDrag(){drag=null;}
  function addRegion(){
    if(!session||session.boxes.length>=4)return;
    const n=session.boxes.length;
    session.boxes.push({label:"Document "+(n+1),x1:180,y1:160,x2:820,y2:840});
    paint();
  }
  function deleteRegion(index){
    if(!session)return;
    session.boxes.splice(index,1);
    // Editing changes the region indices; reset completed state to prevent
    // silently treating a different crop as already approved.
    session.completed.clear();session.selected=null;
    paint();
  }
  async function crop(index){
    const active=session;
    if(!active)throw Error("No separation session.");
    const b=active.boxes[index];
    if(!validBox(b))throw Error("Adjust the selected box to cover one complete document.");
    const img=active.image;
    const x=Math.round(b.x1/1000*img.naturalWidth);
    const y=Math.round(b.y1/1000*img.naturalHeight);
    const width=Math.min(img.naturalWidth-x,Math.round((b.x2-b.x1)/1000*img.naturalWidth));
    const height=Math.min(img.naturalHeight-y,Math.round((b.y2-b.y1)/1000*img.naturalHeight));
    if(width<100||height<100)throw Error("Document crop too small.");
    const ratio=Math.min(1,2400/Math.max(width,height));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(width*ratio));
    canvas.height=Math.max(1,Math.round(height*ratio));
    canvas.getContext("2d").drawImage(img,x,y,width,height,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));
    if(!blob||blob.size>10*1024*1024)throw Error("Could not generate a document under 10 MiB.");
    return new File([blob],filename(active.file.name,index),{type:"image/jpeg"});
  }
  async function choose(index,button,status){
    if(!session||!validBox(session.boxes[index]))return;
    button.disabled=true;status.textContent="Preparing document…";
    try{
      const file=await crop(index);
      if(!session)return;
      session.selected=index;
      close();
      // Billy's normal file-loaded handler already starts auto-processing.
      // Do not change screens here: that would interrupt its process stage.
      window.BillyApp.openFile(file);
      updateLauncher();
    }catch(error){status.textContent=error.message||"Could not crop document.";}
    finally{button.disabled=false;}
  }
  function paint(){
    if(!session||!overlay)return;
    const scene=overlay.querySelector(".billy-multi-scene");
    const list=overlay.querySelector(".billy-multi-list");
    if(!scene||!list)return;
    [...scene.querySelectorAll(".billy-multi-rect")].forEach(n=>n.remove());
    list.replaceChildren();
    session.boxes.forEach((box,index)=>{
      const rect=make("div","billy-multi-rect");
      rect.dataset.region=String(index);Object.assign(rect.style,position(box));
      const label=make("span","billy-multi-rect-label",String(index+1));
      rect.append(label);
      rect.addEventListener("pointerdown",event=>beginDrag(event,index,"move",scene));
      for(const corner of ["nw","ne","sw","se"]){
        const handle=make("span","billy-multi-handle corner-"+corner);
        handle.setAttribute("aria-hidden","true");
        handle.addEventListener("pointerdown",event=>beginDrag(event,index,corner,scene));
        rect.append(handle);
      }
      scene.append(rect);
      const row=make("div","billy-multi-row");
      const details=make("div","billy-multi-row-copy");
      details.append(make("strong","",box.label||"Document "+(index+1)),
        make("span","",session.completed.has(index)?"Approved":"Adjust corners if needed"));
      const action=make("button","billy-multi-use","Use");
      action.type="button";
      const status=make("span","billy-multi-row-status","");
      action.addEventListener("click",()=>void choose(index,action,status));
      const remove=make("button","billy-multi-remove","×");remove.type="button";
      remove.title="Remove region";remove.setAttribute("aria-label","Remove region "+(index+1));
      remove.addEventListener("click",()=>deleteRegion(index));
      row.append(details,action,remove,status);list.append(row);
    });
    const add=overlay.querySelector(".billy-multi-add");
    if(add)add.disabled=session.boxes.length>=4;
    const hint=overlay.querySelector(".billy-multi-hint");
    if(hint)hint.textContent=session.boxes.length
      ? "Drag a box to move it; drag its corners to resize. Confirm each document individually."
      : "No reliable boundaries. Add a region and draw it around one document.";
  }
  function openOverlay(){
    if(!session)return;
    close();
    previousFocus=document.activeElement;
    const shade=make("div","billy-multi-overlay");
    const panel=make("section","billy-multi-panel");
    panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");
    panel.setAttribute("aria-label","Separate documents");
    const header=make("div","billy-multi-header");
    const heading=make("div","");
    heading.append(make("h2","","Separate documents"),make("p","","One photo, multiple physical documents"));
    const exit=make("button","billy-multi-exit","×");
    exit.type="button";exit.title="Close";exit.setAttribute("aria-label","Close separation");
    exit.addEventListener("click",close);
    header.append(heading,exit);
    const content=make("div","billy-multi-content");
    const scene=make("div","billy-multi-scene");
    const preview=make("img","billy-multi-image");
    preview.alt="Original photo with proposed document boundaries";
    clearObjectUrl();objectUrl=URL.createObjectURL(session.file);
    preview.src=objectUrl;preview.draggable=false;
    scene.append(preview);
    scene.addEventListener("pointermove",event=>moveDrag(event,scene));
    scene.addEventListener("pointerup",stopDrag);
    scene.addEventListener("pointercancel",stopDrag);
    const hint=make("p","billy-multi-hint");
    const list=make("div","billy-multi-list");
    const actions=make("div","billy-multi-actions");
    const add=make("button","billy-multi-add","+ Add document");
    add.type="button";add.addEventListener("click",addRegion);
    const dismiss=make("button","billy-multi-done","Done");
    dismiss.type="button";dismiss.addEventListener("click",close);
    actions.append(add,dismiss);
    content.append(scene,hint,list,actions);
    panel.append(header,content);shade.append(panel);
    document.body.append(shade);overlay=shade;
    document.body.classList.add("billy-multi-open");
    document.addEventListener("keydown",onKey);
    paint();exit.focus();
  }
  async function open(file,regions){
    if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type))return false;
    const version=++generation;
    cancelSession();
    const image=await loadImage(file);
    if(version+1!==generation)return false;
    session={file,image,boxes:normalize(regions),selected:null,completed:new Set()};
    openOverlay();updateLauncher();return true;
  }
  async function reopen(){
    if(!session)return;
    openOverlay();updateLauncher();
  }
  window.addEventListener("billy:document-approved",()=>{
    if(!session||session.selected===null)return;
    session.completed.add(session.selected);
    session.selected=null;
    updateLauncher();
  });
  window.BillyMultiDocs={open,reopen,cancelSession,validBox,normalize};
})();