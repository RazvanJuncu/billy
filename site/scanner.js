/* Billy Mobile Scanner  -  camera, crop handles and perspective correction.
   All image processing stays on this device until the user explicitly requests OCR. */
(function (root) {
  "use strict";

  const P = root.BillyPerspective;
  const $ = id => document.getElementById(id);
  let onUse = () => {};
  let stream = null;
  let originalFile = null;
  let imageCanvas = null;
  let corners = P.defaultCorners();
  let dragIndex = -1;
  let detected = false;
  let lastFocused = null;
  let scanMode = "editor";
  let editorBusy = false;
  let captureFromCamera = false;

  function announce(text, error=false) {
    $("scanMessage").textContent = text;
    $("scanMessage").classList.toggle("scan-error", error);
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    $("scanVideo").srcObject = null;
  }

  function showOverlay() {
    lastFocused = document.activeElement;
    $("scannerOverlay").hidden = false;
    document.body.classList.add("scanner-open");
    $("scannerClose").focus();
  }

  function hideOverlay() {
    stopCamera();
    $("scannerOverlay").hidden = true;
    document.body.classList.remove("scanner-open");
    imageCanvas = null;
    originalFile = null;
    $("scanMessage").textContent = "";
    if (lastFocused && lastFocused.isConnected) lastFocused.focus();
  }

  function showMode(mode) {
    scanMode = mode;
    root.dispatchEvent(new CustomEvent("billy:scanner-stage", {detail: {stage: mode === "editor" ? 1 : 0}}));
    $("scanLive").hidden = mode !== "camera";
    $("scanEditor").hidden = mode !== "editor";
    $("scannerHeading").textContent = mode === "camera" ? "Capture document" : "Adjust the document";
    if (mode === "editor") root.requestAnimationFrame(drawEditor);
  }

  async function startCamera() {
    showOverlay();
    showMode("camera");
    announce("Point your camera at a document and capture it.");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      announce("Live camera is unavailable here. Use the phone's native camera button.", true);
      return;
    }
    stopCamera();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: {ideal: 1920}, height: {ideal: 1080} }
      });
      if ($("scannerOverlay").hidden || scanMode !== "camera") { stopCamera(); return; }
      $("scanVideo").srcObject = stream;
      await $("scanVideo").play();
      announce("Fit the entire page in the frame, avoiding glare and shadows.");
    } catch (err) {
      stopCamera();
      announce("Camera access was unavailable (" + (err.name || "unknown error") + "). Use the native camera option.", true);
    }
  }

  function sizeToFit(width, height, maxDimension) {
    const f = Math.min(1, maxDimension / Math.max(width, height));
    return [Math.max(1, Math.round(width*f)), Math.max(1, Math.round(height*f))];
  }

  function createScaledCanvas(image, width, height, maxDimension = 2600) {
    const [w,h] = sizeToFit(width,height,maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = w;canvas.height = h;
    const ctx = canvas.getContext("2d",{willReadFrequently:true});
    ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);
    ctx.drawImage(image,0,0,w,h);
    return canvas;
  }

  async function fileToCanvas(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("Image is empty.");
      return createScaledCanvas(image,image.naturalWidth,image.naturalHeight);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function guessCorners() {
    if(!imageCanvas) return;
    const small = createScaledCanvas(imageCanvas,imageCanvas.width,imageCanvas.height,320);
    const ctx=small.getContext("2d",{willReadFrequently:true});
    const data=ctx.getImageData(0,0,small.width,small.height);
    const result=P.detectDocumentCorners(data);
    corners=result.corners;
    detected=result.detected;
    announce(detected
      ? "Document edges estimated. Drag any white corner to refine the crop."
      : "Document edges were not found reliably. Drag all four white corners to match the page.");
    root.requestAnimationFrame(drawEditor);
  }

  async function editFile(file, fromCamera=false) {
    if (!file) return;
    showOverlay();
    showMode("editor");
    stopCamera();
    captureFromCamera=fromCamera;
    $("scanRetake").hidden = !fromCamera;
    originalFile=file;
    announce("Loading image…");
    root.BillyLoader?.startWork("image","Preparing photo");
    try {
      imageCanvas=await fileToCanvas(file);
      if ($("scannerOverlay").hidden) return;
      guessCorners();
    } catch(error) {
      announce("Could not open this image. For iPhone HEIC photos, try exporting as JPEG. " + error.message, true);
    } finally {
      root.BillyLoader?.endWork("image");
    }
  }

  function canvasMetrics() {
    const source=imageCanvas;
    const availableW=Math.max(120,Math.min($("scanCanvasWrap").clientWidth-12,960));
    const availableH=Math.max(140,Math.min(root.innerHeight*.62,660));
    const scale=Math.min(availableW/source.width,availableH/source.height);
    return {w:Math.max(1,Math.round(source.width*scale)),h:Math.max(1,Math.round(source.height*scale))};
  }

  function drawEditor() {
    if (!imageCanvas || $("scannerOverlay").hidden || scanMode!=="editor") return;
    const view=$("scanCanvas");
    const {w,h}=canvasMetrics();
    const dpr=Math.min(2,root.devicePixelRatio||1);
    view.style.width=w+"px";view.style.height=h+"px";
    view.width=Math.round(w*dpr);view.height=Math.round(h*dpr);
    const ctx=view.getContext("2d");
    ctx.scale(dpr,dpr);
    ctx.clearRect(0,0,w,h);
    ctx.drawImage(imageCanvas,0,0,w,h);
    ctx.save();
    ctx.beginPath();
    corners.forEach((p,i)=>i===0?ctx.moveTo(p.x*w,p.y*h):ctx.lineTo(p.x*w,p.y*h));
    ctx.closePath();
    ctx.fillStyle="rgba(255,255,255,.07)";
    ctx.fill();
    ctx.shadowColor="#000";ctx.shadowBlur=4;ctx.strokeStyle="#f5f5f5";ctx.lineWidth=2.5;ctx.stroke();
    ctx.fillStyle="#fff";ctx.strokeStyle="#171717";ctx.lineWidth=3;
    for (let i=0;i<4;i++) {
      ctx.beginPath();ctx.arc(corners[i].x*w,corners[i].y*h,9,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    ctx.restore();
  }

  function pointerLocation(event) {
    const bounds=$("scanCanvas").getBoundingClientRect();
    return {x:(event.clientX-bounds.left)/bounds.width,y:(event.clientY-bounds.top)/bounds.height,
      w:bounds.width,h:bounds.height};
  }

  function onPointerDown(event) {
    if (!imageCanvas) return;
    const p=pointerLocation(event);
    let closest=-1,min=Infinity;
    for(let i=0;i<4;i++) {
      const dist=Math.hypot((corners[i].x-p.x)*p.w,(corners[i].y-p.y)*p.h);
      if(dist<min){closest=i;min=dist;}
    }
    // Wide touch target, so fingers can move corners precisely on a phone.
    if(min>48) return;
    dragIndex=closest;
    $("scanCanvas").setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if(dragIndex<0) return;
    const p=pointerLocation(event);
    const proposed=corners.map(v=>({...v}));
    proposed[dragIndex]={x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y))};
    if(P.validCorners(proposed)) corners=proposed;
    drawEditor();
    event.preventDefault();
  }

  function onPointerUp(event) {
    dragIndex=-1;
    if($("scanCanvas").hasPointerCapture?.(event.pointerId)) $("scanCanvas").releasePointerCapture(event.pointerId);
  }

  async function captureFrame() {
    const video=$("scanVideo");
    if(!video.videoWidth||!video.videoHeight) {
      announce("Camera frame not ready. You can use the native camera option.",true);return;
    }
    const canvas=createScaledCanvas(video,video.videoWidth,video.videoHeight,2600);
    const blob=await canvasToBlob(canvas,"image/jpeg",.95);
    stopCamera();
    await editFile(new File([blob],"camera-capture.jpg",{type:"image/jpeg"}),true);
  }

  function canvasToBlob(canvas,type="image/jpeg",quality=.94) {
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Could not encode scan.")),type,quality));
  }

  function correctedCanvas() {
    const ctx=imageCanvas.getContext("2d",{willReadFrequently:true});
    const image=ctx.getImageData(0,0,imageCanvas.width,imageCanvas.height);
    const corrected=P.warpImageData(image,corners,2200);
    const out=document.createElement("canvas");
    out.width=corrected.width;out.height=corrected.height;
    const outputContext=out.getContext("2d");
    const outputImage=outputContext.createImageData(out.width,out.height);
    outputImage.data.set(corrected.data);
    outputContext.putImageData(outputImage,0,0);
    return out;
  }

  async function correctedFile() {
    if (!imageCanvas) return null;
    if(!P.validCorners(corners)) throw new Error("The corners overlap. Adjust all four handles.");
    const canvas=correctedCanvas();
    const blob=await canvasToBlob(canvas);
    const stem=(originalFile?.name||"document").replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,60)||"document";
    return new File([blob],stem+"-billy-scan.jpg",{type:"image/jpeg",lastModified:Date.now()});
  }

  async function executeBusy(task) {
    if(editorBusy) return;
    editorBusy=true;
    $("scanApply").disabled=true;
    $("scanSave").disabled=true;
    try {
      announce("Straightening the document…");
      await new Promise(resolve=>root.requestAnimationFrame(resolve));
      await task();
    }catch(e){
      announce(e.message||"Could not process the image.",true);
    }finally{
      editorBusy=false;
      $("scanApply").disabled=false;
      $("scanSave").disabled=false;
    }
  }

  async function applyScan() {
    if(editorBusy) return;
    root.BillyLoader?.startWork("crop","Straightening photo");
    try {
      await executeBusy(async()=>{
        const file=await correctedFile();
        if(!file) return;
        hideOverlay();
        onUse(file);
      });
    } finally {
      root.BillyLoader?.endWork("crop");
    }
  }

  async function saveScan() {
    await executeBusy(async()=>{
      const file=await correctedFile();
      if(!file) return;
      if(navigator.canShare?.({files:[file]})&&navigator.share) {
        try {
          await navigator.share({files:[file],title:"Billy scanned document"});
          announce("Scan shared through your device.");
          return;
        }catch(e){if(e.name==="AbortError"){announce("Share canceled.");return;}}
      }
      const url=URL.createObjectURL(file);
      const anchor=document.createElement("a");
      anchor.href=url;anchor.download=file.name;document.body.appendChild(anchor);
      anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
      announce("Scan saved. On iPhone, check Files → Downloads if it did not appear in Photos.");
    });
  }

  function rotateImage() {
    if(!imageCanvas) return;
    const original=imageCanvas;
    const rotated=document.createElement("canvas");
    rotated.width=original.height;rotated.height=original.width;
    const ctx=rotated.getContext("2d",{willReadFrequently:true});
    ctx.translate(rotated.width,0);
    ctx.rotate(Math.PI/2);
    ctx.drawImage(original,0,0);
    imageCanvas=rotated;
    guessCorners();
  }

  async function useOriginal() {
    if(!originalFile || !imageCanvas) return;
    const file=originalFile;
    const isHeic=/\.(heic|heif)$/i.test(file.name);
    if(!isHeic) {
      hideOverlay();
      onUse(file);
      return;
    }
    await executeBusy(async()=>{
      const blob=await canvasToBlob(imageCanvas);
      const converted=new File([blob],"billy-original.jpg",{type:"image/jpeg"});
      hideOverlay();
      onUse(converted);
    });
  }

  function init(options) {
    onUse=options?.onUse||onUse;
    $("scanOpenCamera").addEventListener("click",startCamera);
    $("scanImportPhoto").addEventListener("click",()=> $("nativeGallery").click());
    $("fixPerspective").addEventListener("click",()=> {
      const source=options?.getSource?.();
      if(source) editFile(source);
    });
    $("nativeGallery").addEventListener("change",(event)=>{
      const file=event.target.files?.[0];
      event.target.value="";
      if(file) editFile(file);
    });
    $("nativeCapture").addEventListener("change",(event)=>{
      const file=event.target.files?.[0];
      event.target.value="";
      if(file) editFile(file,true);
    });
    $("scannerNativeCapture").addEventListener("click",()=> $("nativeCapture").click());
    $("scanCapture").addEventListener("click",captureFrame);
    $("scanRetake").addEventListener("click",startCamera);
    $("scannerClose").addEventListener("click",hideOverlay);
    $("scanAuto").addEventListener("click",guessCorners);
    $("scanReset").addEventListener("click",()=>{corners=P.defaultCorners();detected=false;announce("Drag the white handles to the document's four corners.");drawEditor();});
    $("scanRotate").addEventListener("click",rotateImage);
    $("scanApply").addEventListener("click",applyScan);
    $("scanSave").addEventListener("click",saveScan);
    $("scanUseOriginal").addEventListener("click",useOriginal);
    $("scanCanvas").addEventListener("pointerdown",onPointerDown);
    $("scanCanvas").addEventListener("pointermove",onPointerMove);
    $("scanCanvas").addEventListener("pointerup",onPointerUp);
    $("scanCanvas").addEventListener("pointercancel",onPointerUp);
    root.addEventListener("resize",()=>{if(scanMode==="editor")drawEditor();});
    document.addEventListener("visibilitychange",()=>{if(document.hidden)stopCamera();});
    document.addEventListener("keydown",event=>{
      if(event.key==="Escape"&&!$("scannerOverlay").hidden)hideOverlay();
    });
  }

  root.BillyScanner={init,editFile,startCamera,stopCamera};
})(window);
