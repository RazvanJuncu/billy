/* Automatic nested documents: one whole-photo upload, sequential operator reviews.
   Only the approved, server-linked child records are treated as nested. */
(() => {
  "use strict";
  let session=null,job=0;
  const valid=b=>b&&["x1","x2","y1","y2"].every(k=>Number.isInteger(b[k])&&b[k]>=0&&b[k]<=1000)&&b.x2-b.x1>=80&&b.y2-b.y1>=80;
  function active(){return Boolean(session);}
  function reset(){job++;session=null;}
  function label(){
    if(!session)return "";
    return "Document "+(session.index+1)+" of "+(1+session.children.length);
  }
  function decorateTitle(screen,element){
    if(!session||!element||!["review","process"].includes(screen))return;
    element.textContent=(screen==="review"?"Review ":"Processing ")+label().toLowerCase();
  }
  async function crop(file,box,index){
    if(!valid(box))throw Error("Nested document boundaries are invalid.");
    const url=URL.createObjectURL(file);
    let image;
    try{
      image=new Image();image.src=url;await image.decode();
      const x=Math.round(box.x1*image.naturalWidth/1000);
      const y=Math.round(box.y1*image.naturalHeight/1000);
      const width=Math.min(image.naturalWidth-x,Math.round((box.x2-box.x1)*image.naturalWidth/1000));
      const height=Math.min(image.naturalHeight-y,Math.round((box.y2-box.y1)*image.naturalHeight/1000));
      if(width<100||height<100)throw Error("Nested document crop too small.");
      const scale=Math.min(1,2400/Math.max(width,height));
      const canvas=document.createElement("canvas");
      canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
      canvas.getContext("2d").drawImage(image,x,y,width,height,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.94));
      if(!blob||!blob.size||blob.size>10*1024*1024)throw Error("Could not produce a valid nested document.");
      return new File([blob],file.name.replace(/\.[^.]+$/,"")+"-nested-"+(index+1)+".jpg",{type:"image/jpeg"});
    }finally{URL.revokeObjectURL(url);}
  }
  async function start(file,classification){
    if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type)||!classification)return false;
    // A primary profile is mandatory; never coerce an unknown or ambiguous
    // classification to a known expense automatically.
    if(classification.status!=="confident"||classification.profile==="unknown")return false;
    const boxes=(Array.isArray(classification.nested_documents)?classification.nested_documents:[])
      .filter(valid).slice(0,3);
    if(!classification.multiple_documents_visible||!boxes.length)return false;
    const token=++job;
    const children=[];
    try{
      for(const [i,box] of boxes.entries())children.push(await crop(file,box,i));
    }catch{return false;}
    if(token!==job)return false;
    session={source:file,primaryProfile:classification.profile,
      primaryCategory:classification.expense_category||"unknown",
      boxes,children,index:0,parentId:null,current:file,stage:"primary"};
    // No manual boxes or extra scan. Same file triggers existing extraction,
    // this time with the model-selected primary profile.
    window.BillyApp.openFile(file);
    return true;
  }
  function fileLoaded(file){
    if(session&&file!==session.current)reset();
  }
  function prepare(form,file){
    if(!session||file!==session.current)return;
    if(session.stage==="primary"){
      form.set("profile_override",session.primaryProfile);
      form.set("category_override",session.primaryCategory);
      form.set("nested_primary","true");
      form.set("nested_exclude",JSON.stringify(session.boxes));
    }else if(session.stage==="child"&&session.parentId){
      form.set("parent_document_id",session.parentId);
    }
  }
  function advance(event){
    if(!session||!event.detail?.approvalId||session.currentApprovedId)return;
    if(session.stage==="primary")session.parentId=event.detail.approvalId;
    else if(session.stage!=="child")return;
    session.currentApprovedId=event.detail.approvalId;
  }
  function archived(event){
    if(!session||!session.currentApprovedId||
       event.detail?.recordId!==session.currentApprovedId)return;
    const snapshot=session,token=job;
    snapshot.currentApprovedId=null;
    if(snapshot.index>=snapshot.children.length){
      reset();
      window.dispatchEvent(new CustomEvent("billy:nested-complete"));
      return;
    }
    const next=snapshot.children[snapshot.index++];
    snapshot.stage="child";
    snapshot.current=next;
    // The next extraction starts only after storage has confirmed this source.
    setTimeout(()=>{
      if(job!==token||session!==snapshot)return;
      window.BillyApp.openFile(next);
    },150);
  }
  window.addEventListener("billy:document-approved",advance);
  window.addEventListener("billy:original-archived",archived);
  window.BillyNested={start,prepare,fileLoaded,active,reset,decorateTitle};
})();