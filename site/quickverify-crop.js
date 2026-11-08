/* Billy QuickVerify: local, on-demand source crops. AI coordinates are estimates.
   The source file never leaves the browser for cropping, and is not archived here. */
(() => {
  "use strict";
  const PDFJS_URL="https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.mjs";
  const PDFJS_WORKER="https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.min.mjs";
  let pdfLibrary=null;
  function validRegion(region){
    if(!region||!Number.isInteger(region.page)||region.page<1||region.page>30||
       !Array.isArray(region.box_2d)||region.box_2d.length!==4)return false;
    const [y1,x1,y2,x2]=region.box_2d;
    return [y1,x1,y2,x2].every(n=>Number.isInteger(n)&&n>=0&&n<=1000)&&
      x2>x1&&y2>y1;
  }
  function cropBounds(region,width,height){
    if(!validRegion(region)||!(width>0&&height>0))return null;
    const [y1,x1,y2,x2]=region.box_2d;
    const centerX=((x1+x2)/2000)*width;
    const centerY=((y1+y2)/2000)*height;
    const boxWidth=(x2-x1)/1000*width;
    const boxHeight=(y2-y1)/1000*height;
    // Keep some surrounding print for context, but not the full document.
    const desiredWidth=Math.min(width,Math.max(boxWidth*1.5,width*.12));
    const desiredHeight=Math.min(height,Math.max(boxHeight*1.85,height*.075));
    const sx=Math.max(0,Math.min(width-desiredWidth,centerX-desiredWidth/2));
    const sy=Math.max(0,Math.min(height-desiredHeight,centerY-desiredHeight/2));
    return {sx,sy,sw:desiredWidth,sh:desiredHeight};
  }
  function create(file){
    let disposed=false,ticket=0,sourceUrl=null,imagePromise=null,pdfPromise=null;
    const pdfInput=!!file&&(file.type==="application/pdf"||/\.pdf$/i.test(file.name||""));
    function info(text){
      const p=document.createElement("p");
      p.className="ramp-crop-status";p.textContent=text;
      p.setAttribute("role","status");
      return p;
    }
    async function getImage(){
      if(!imagePromise){
        imagePromise=(async()=>{
          sourceUrl=URL.createObjectURL(file);
          const image=new Image();
          image.src=sourceUrl;
          await image.decode();
          if(!image.naturalWidth||!image.naturalHeight)throw Error("Image is unreadable");
          return image;
        })();
      }
      return imagePromise;
    }
    async function getPdf(){
      if(!pdfPromise){
        pdfPromise=(async()=>{
          pdfLibrary=pdfLibrary||import(PDFJS_URL).then(lib=>{
            lib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
            return lib;
          });
          const lib=await pdfLibrary;
          const bytes=new Uint8Array(await file.arrayBuffer());
          return lib.getDocument({data:bytes,isEvalSupported:false,enableScripting:false}).promise;
        })();
      }
      return pdfPromise;
    }
    async function sourceOnPage(number){
      if(!pdfInput){
        if(number!==1)throw Error("The source page cannot be localized in this image");
        const image=await getImage();
        return {drawable:image,width:image.naturalWidth,height:image.naturalHeight};
      }
      const pdf=await getPdf();
      if(number>pdf.numPages)throw Error("Page unavailable");
      const page=await pdf.getPage(number);
      const original=page.getViewport({scale:1});
      // Bound rendered PDF pixels to avoid excessive memory on mobile.
      const scale=Math.min(2.4,2000/original.width,2600/original.height);
      const viewport=page.getViewport({scale});
      const canvas=document.createElement("canvas");
      canvas.width=Math.ceil(viewport.width);
      canvas.height=Math.ceil(viewport.height);
      const ctx=canvas.getContext("2d",{alpha:false});
      if(!ctx)throw Error("Canvas unavailable");
      await page.render({canvasContext:ctx,viewport}).promise;
      return {drawable:canvas,width:canvas.width,height:canvas.height};
    }
    async function show(region,slot){
      const current=++ticket;
      slot.replaceChildren();
      if(!file||!validRegion(region)){
        slot.append(info("Source crop unavailable · inspect the original document."));
        return;
      }
      slot.append(info("Preparing source crop…"));
      try{
        const source=await sourceOnPage(region.page);
        if(disposed||current!==ticket)return;
        const bounds=cropBounds(region,source.width,source.height);
        if(!bounds)throw Error("Region unavailable");
        const canvas=document.createElement("canvas");
        // Bounded canvas display: do not create multi-megapixel crop previews.
        const scale=Math.min(2.5,960/bounds.sw,420/bounds.sh);
        canvas.width=Math.max(1,Math.round(bounds.sw*scale));
        canvas.height=Math.max(1,Math.round(bounds.sh*scale));
        const ctx=canvas.getContext("2d",{alpha:false});
        if(!ctx)throw Error("Canvas unavailable");
        ctx.drawImage(source.drawable,
          bounds.sx,bounds.sy,bounds.sw,bounds.sh,
          0,0,canvas.width,canvas.height);
        canvas.setAttribute("role","img");
        canvas.setAttribute("aria-label","Original document crop from page "+region.page+
          ". AI-estimated location; compare with the full document if unclear.");
        if(disposed||current!==ticket)return;
        slot.replaceChildren(canvas);
      }catch(_error){
        if(disposed||current!==ticket)return;
        slot.replaceChildren(info("Source crop unavailable · inspect the original document."));
      }
    }
    function dispose(){
      disposed=true;ticket++;
      if(sourceUrl)URL.revokeObjectURL(sourceUrl);
      // PDF page canvases are not cached, and source bytes are kept only in
      // this in-memory viewer until the document changes.
      if(pdfPromise)pdfPromise.then(pdf=>pdf.destroy()).catch(()=>{});
    }
    return {show,cancel:()=>{ticket++;},dispose};
  }
  window.BillyQuickVerifyCrop={create,cropBounds,validRegion};
})();
