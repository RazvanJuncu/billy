/* Stage 3A PDF preflight: pages are not necessarily separate physical documents.
   Confirm the choice on device; no page content is uploaded for this check. */
(() => {
  "use strict";
  let pending=null,overlay=null,current=null,loader=null,renderer=null,automatic=null;
  const allowed=new WeakSet();
  const $=id=>document.getElementById(id);
  const mk=(tag,cls,value)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=value;
    return el;
  };
  async function pdfLib(){
    if(window.PDFLib?.PDFDocument)return window.PDFLib.PDFDocument;
    if(!loader)loader=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
      script.onload=()=>window.PDFLib?.PDFDocument?resolve(window.PDFLib.PDFDocument):reject(Error("PDF tools unavailable."));
      script.onerror=()=>reject(Error("Could not load PDF tools."));
      document.head.append(script);
    }).catch(e=>{loader=null;throw e;});
    return loader;
  }
  async function pdfRenderer(){
    if(window.pdfjsLib)return window.pdfjsLib;
    if(!renderer)renderer=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
      script.onload=()=>{
        if(!window.pdfjsLib)return reject(Error("PDF renderer unavailable."));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      script.onerror=()=>reject(Error("PDF renderer could not be loaded."));
      document.head.append(script);
    }).catch(e=>{renderer=null;throw e;});
    return renderer;
  }
  async function renderPage(file){
    const lib=await pdfRenderer();
    const input=new Uint8Array(await file.arrayBuffer());
    const loading=lib.getDocument({data:input});
    const pdf=await loading.promise;
    try{
      if(pdf.numPages!==1)throw Error("Select a single PDF page before separating its contents.");
      const page=await pdf.getPage(1);
      const original=page.getViewport({scale:1});
      const scale=Math.min(3,2800/Math.max(original.width,original.height));
      const viewport=page.getViewport({scale});
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.floor(viewport.width));
      canvas.height=Math.max(1,Math.floor(viewport.height));
      await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.91));
      if(!blob||blob.size>10*1024*1024)throw Error("Could not render PDF page within 10 MiB.");
      return new File([blob],file.name.replace(/\.pdf$/i,"")+"-page.jpg",{type:"image/jpeg"});
    }finally{await pdf.destroy();}
  }
  function indicesHint(task,overlays){
    return Array.isArray(overlays)&&overlays.some(page=>
      page>=task.first_page&&page<=task.last_page);
  }
  function prepare(form,file){
    if(automatic&&automatic.current===file&&automatic.overlayHint)
      form.set("layout_overlay_hint","true");
  }
  async function groupedFile(task){
    const result=await automatic.API.create();
    const indices=Array.from({length:task.last_page-task.first_page+1},(_,j)=>task.first_page+j-1);
    const pages=await result.copyPages(automatic.pdf,indices);
    for(const page of pages)result.addPage(page);
    const bytes=await result.save({useObjectStreams:false});
    if(bytes.byteLength>10*1024*1024)throw Error("A grouped PDF exceeds the upload size limit.");
    const label=automatic.file.name.replace(/\.pdf$/i,"");
    const output=new File([bytes],label+"-document-"+(automatic.index+1)+".pdf",{type:"application/pdf"});
    // A correctly grouped multi-page document can be classified as one file.
    // One-page groups are rasterized to allow precise image-level child detection.
    if(indices.length!==1){
      allowed.add(output);
      return output;
    }
    return await renderPage(output);
  }
  async function advanceAutomatic(){
    if(!automatic||automatic.pending)return;
    if(automatic.index>=automatic.groups.length){
      automatic=null;return;
    }
    const active=automatic;
    active.pending=true;
    try{
      const task=active.groups[active.index];
      const file=await groupedFile(task);
      if(automatic!==active)return;
      active.current=file;
      active.overlayHint=indicesHint(active.groups[active.index],active.overlayPages);
      active.pending=false;
      active.waiting=true;
      window.BillyApp.openFile(file);
    }catch(error){
      if(automatic===active){active.pending=false;active.waiting=false;}
      const target=$("simpleUploadNote");
      if(target)target.textContent="Could not prepare PDF document: "+(error.message||"Unknown error");
    }
  }
  function advanceAfterArchive(event){
    if(!automatic||!automatic.waiting)return;
    // The Parent+Child sequence must finish before the next independent PDF page.
    if(window.BillyNested?.active?.())return;
    automatic.waiting=false;
    automatic.index++;
    void advanceAutomatic();
  }
  window.addEventListener("billy:original-archived",advanceAfterArchive);
  window.addEventListener("billy:nested-complete",()=>{
    if(!automatic||!automatic.waiting)return;
    automatic.waiting=false;automatic.index++;void advanceAutomatic();
  });
  function close(){
    overlay?.remove();overlay=null;
  }
  function updateResume(){
    let button=$("billyPdfResume");
    if(!button){
      const target=$("simpleUploadNote");
      if(!target)return;
      button=mk("button","billy-multi-resume");
      button.id="billyPdfResume";button.type="button";
      button.addEventListener("click",showPages);
      target.after(button);
    }
    button.hidden=!current||current.done.size===current.count;
    if(current)button.textContent="PDF pages · "+(current.count-current.done.size)+" remaining";
  }
  async function choosePage(index,button){
    if(!current)return;
    button.disabled=true;
    try{
      const output=await current.API.create();
      const [page]=await output.copyPages(current.pdf,[index]);
      output.addPage(page);
      const bytes=await output.save({useObjectStreams:false});
      if(bytes.byteLength>10*1024*1024)throw Error("This PDF page exceeds the 10 MiB limit.");
      current.selected=index;
      close();
      const name=current.file.name.replace(/\.pdf$/i,"");
      window.BillyApp.openFile(new File([bytes],name+"-page-"+(index+1)+".pdf",{type:"application/pdf"}));
      updateResume();
    }catch(e){button.disabled=false;const note=$("billyPdfError");if(note)note.textContent=e.message||"Could not separate page.";}
  }
  function showPages(){
    if(!current)return;
    close();
    const shade=mk("div","billy-multi-overlay");
    const panel=mk("section","billy-multi-panel");
    panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");
    panel.setAttribute("aria-label","PDF pages");
    const header=mk("div","billy-multi-header");
    const heading=mk("div","");
    heading.append(mk("h2","","PDF pages"),mk("p","","Choose pages that are separate documents. A multi-page invoice can stay together."));
    const dismiss=mk("button","billy-multi-exit","×");
    dismiss.type="button";dismiss.setAttribute("aria-label","Close");dismiss.addEventListener("click",close);
    header.append(heading,dismiss);
    const content=mk("div","billy-multi-content");
    const list=mk("div","billy-multi-list");
    for(let i=0;i<current.count;i++){
      const row=mk("div","billy-multi-row");
      const detail=mk("div","billy-multi-row-copy");
      detail.append(mk("strong","","Page "+(i+1)),
        mk("span","",current.done.has(i)?"Approved":"Extract this page independently"));
      const use=mk("button","billy-multi-use",current.done.has(i)?"Review again":"Process page");
      use.type="button";use.addEventListener("click",()=>void choosePage(i,use));
      row.append(detail,use);list.append(row);
    }
    const error=mk("p","billy-multi-hint","");error.id="billyPdfError";
    const all=mk("button","billy-multi-done","Process full PDF as one document");
    all.type="button";all.addEventListener("click",()=>{
      allowed.add(current.file);
      const original=current.file;close();
      window.BillyApp.openFile(original);
    });
    const actions=mk("div","billy-multi-actions");actions.append(all);
    content.append(list,error,actions);panel.append(header,content);shade.append(panel);
    document.body.append(shade);overlay=shade;dismiss.focus();
  }
  async function preflight(file){
    if(!file||file.type!=="application/pdf"||allowed.has(file))return false;
    const API=await pdfLib();
    const pdf=await API.load(await file.arrayBuffer(),{ignoreEncryption:false});
    const count=pdf.getPageCount();
    if(count<=1)return false;
    if(count>30)throw Error("PDF contains more than 30 pages. Split it into smaller batches.");
    // One AI document map per uploaded PDF: identify independently meaningful
    // documents AND inspect each page for smaller physically attached receipts.
    try{
      if(!window.BillyAccounts?.active?.())throw Error("Cloud account unavailable.");
      const api=window.BILLY_AUTH_CONFIG?.apiUrl;
      if(!api)throw Error("Billy AI endpoint unavailable.");
      const headers=await window.BillyAccounts.sessionHeaders();
      const form=new FormData();form.append("file",file,file.name);form.append("page_count",String(count));
      const response=await fetch(api+"/api/vision/document-map",{method:"POST",body:form,headers});
      if(!response.ok)throw Error("PDF structure analysis failed.");
      const result=await response.json();
      if(result.automatic===true&&Array.isArray(result.groups)&&result.groups.length){
        automatic={file,pdf,API,count,groups:result.groups,index:0,
          overlayPages:result.overlay_pages||[],current:null,pending:false,waiting:false};
        void advanceAutomatic();
        return true;
      }
    }catch(error){
      console.warn("Billy PDF layout auto-detect unavailable",String(error.message).slice(0,90));
    }
    // Only when the model cannot verify structure, retain the existing manual
    // page picker. Never silently guess independent documents from page count.
    current={file,pdf,API,count,selected:null,done:new Set()};
    showPages();updateResume();
    return true;
  }
  window.addEventListener("billy:document-approved",()=>{
    if(!current||current.selected===null)return;
    current.done.add(current.selected);
    current.selected=null;
    updateResume();
  });
  window.BillyPdfSeparator={preflight,toImage:renderPage,showPages,prepare};
})();