/* Billy private original archive: one verified source file per approved record.
   Files never enter localStorage or an unauthenticated/public storage URL. */
(() => {
  "use strict";
  let pending=null,savedId=null;
  const TYPES={"pdf":"application/pdf","jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","webp":"image/webp"};
  function api(){
    const url=window.BILLY_AUTH_CONFIG?.apiUrl;
    if(!url||!window.BillyAccounts?.active?.())throw Error("Billy cloud is not connected.");
    return url;
  }
  function status(message,canRetry=false){
    const target=document.getElementById("simpleArchiveStatus");
    if(!target)return;
    target.hidden=!message;
    const text=target.querySelector(".billy-archive-message");
    if(text)text.textContent=message||"";
    const button=target.querySelector(".billy-archive-retry");
    if(button)button.hidden=!canRetry;
  }
  function ensureStatus(){
    if(document.getElementById("simpleArchiveStatus"))return;
    const note=document.getElementById("simpleUploadNote");
    if(!note)return;
    const wrapper=document.createElement("div");wrapper.id="simpleArchiveStatus";
    wrapper.className="billy-archive-status";wrapper.hidden=true;
    const label=document.createElement("span");label.className="billy-archive-message";
    const retry=document.createElement("button");retry.type="button";
    retry.className="billy-archive-retry";retry.textContent="Retry";
    retry.addEventListener("click",()=>{if(pending)void save(pending.id,pending.file);});
    wrapper.append(label,retry);note.after(wrapper);
  }
  function fileMime(file){
    const ext=(file.name||"").split(".").pop().toLowerCase();
    return TYPES[ext]||null;
  }
  function reset(){
    pending=null;savedId=null;ensureStatus();status("",false);
  }
  async function save(id,file){
    ensureStatus();
    if(!id||!file||!file.size){status("Original unavailable. Archive not created.",false);return false;}
    const mime=fileMime(file);
    if(!mime||file.size>10*1024*1024){status("Original type or size not supported.",false);return false;}
    if(id===savedId){status("✓ Original archived",false);return true;}
    pending={id,file};status("Saving original…",false);
    try{
      const url=api()+"/api/vision/original?record_id="+encodeURIComponent(id);
      const headers=await window.BillyAccounts.sessionHeaders();
      const response=await fetch(url,{method:"POST",headers:{...headers,"Content-Type":mime},body:file,cache:"no-store"});
      const result=await response.json();
      if(!response.ok||result.stored!==true)throw Error(result.detail||"Archive unavailable.");
      if(pending?.id===id&&pending?.file===file){savedId=id;pending=null;status("✓ Original archived",false);}
      return true;
    }catch(e){
      if(pending?.id===id&&pending?.file===file)status("Original not saved. "+String(e.message||"Retry archive."),true);
      return false;
    }
  }
  async function retrieve(id){
    const url=api()+"/api/vision/original?record_id="+encodeURIComponent(id);
    const headers=await window.BillyAccounts.sessionHeaders();
    const response=await fetch(url,{headers,cache:"no-store"});
    if(!response.ok)throw Error("Could not load original.");
    const mime=(response.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase();
    if(!Object.values(TYPES).includes(mime))throw Error("Unexpected archived media type.");
    return {blob:await response.blob(),mime};
  }
  ensureStatus();
  window.BillyOriginals={save,retrieve,reset};
})();
