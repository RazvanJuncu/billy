/* Billy desktop handwriting second opinion.
 * TrOCR runs on the user's device. No source crops are uploaded or stored.
 * It is INFERENCE, not training, and never changes approved/extracted values.
 */
(() => {
  "use strict";
  const WORKER_URL = "./desktop-trocr-worker.js?v=1";
  const MAX_REGIONS = 8;
  let worker = null, sequence = 0, activeRun = null;
  const pending = new Map();
  const desktop = () => {
    const ua = navigator.userAgent || "";
    const mobile = /iphone|ipad|ipod|android|huawei|honor|harmonyos|emui/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return !mobile && typeof Worker !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: fine) and (min-width: 900px)").matches;
  };
  function resetWorker() {
    if(worker) worker.terminate();
    worker = null;
    for(const {reject} of pending.values()) reject(new Error("TrOCR worker stopped"));
    pending.clear();
  }
  function ensureWorker() {
    if (worker) return worker;
    const next = new Worker(WORKER_URL, {type:"module"});
    next.onmessage = ({data}) => {
      if(data?.kind === "progress") {
        activeRun?.onStatus?.("Loading local handwriting model…");
        return;
      }
      const task=pending.get(data?.id);
      if(!task) return;
      pending.delete(data.id);
      if(data.kind==="error") task.reject(new Error(String(data.message||"Local OCR failed").slice(0,180)));
      else if(data.kind==="result") task.resolve(String(data.text||"").trim().slice(0,180));
    };
    next.onerror=() => {
      resetWorker();
      activeRun?.onStatus?.("Local handwriting model unavailable. The AI engine review still works.");
    };
    worker=next;
    return worker;
  }
  function read(image) {
    return new Promise((resolve,reject)=>{
      const id=++sequence;
      pending.set(id,{resolve,reject});
      ensureWorker().postMessage({kind:"read",id,image});
    });
  }
  const eligible = regions => (Array.isArray(regions)?regions:[]).filter(region =>
    window.BillyQuickVerifyCrop?.validRegion(region) &&
    ["handwritten","mixed"].includes(region.script_type) &&
    typeof region.field_path === "string" && region.field_path.length <= 90
  ).slice(0,MAX_REGIONS);
  function inspect({file,regions,onStatus,onReading}) {
    if(!desktop()||!file) return {enabled:false,cancel(){},done:Promise.resolve({status:"skipped"})};
    const candidates=eligible(regions);
    if(!candidates.length)return {enabled:false,cancel(){},done:Promise.resolve({status:"skipped"})};
    if(activeRun)activeRun.cancel();
    let cancelled=false;
    const run={cancel(){cancelled=true;},onStatus};
    activeRun=run;
    const crop=window.BillyQuickVerifyCrop?.create(file);
    onStatus?.("Checking handwriting locally (0/"+candidates.length+")…");
    const task=(async()=>{
      let completed=0,reads=0,status="completed";
      try{
        for(const region of candidates){
          if(cancelled)break;
          // Converts only the localized region to a data URL for the LOCAL worker.
          // This is never sent to any endpoint.
          const picture=await crop.dataUrl(region);
          if(cancelled)break;
          const text=await read(picture);
          if(cancelled)break;
          completed++;
          if(text){
            reads++;
            onReading?.({field_path:region.field_path,page:region.page,text});
          }
          onStatus?.("Checking handwriting locally ("+completed+"/"+candidates.length+")…");
        }
        if(!cancelled)onStatus?.(reads
          ?"Local TrOCR checked "+reads+" handwriting region(s). Differences need review."
          :"Local TrOCR returned no usable text. Review the AI engine results.");
      }catch(error){
        status="unavailable";
        if(!cancelled)onStatus?.("Local TrOCR unavailable: "+String(error?.message||"error").slice(0,100)+". The AI engine remains available.");
      }finally{
        crop?.dispose?.();
        if(activeRun===run)activeRun=null;
      }
      return {status:cancelled?"cancelled":status,reads,completed};
    })();
    // No indefinitely spinning loader if a model/CDN or local inference stalls.
    // A late model response cannot alter visible review fields after cancellation.
    let watchdog=null;
    const timeout=new Promise(resolve=>{
      watchdog=setTimeout(()=>{
        cancelled=true;
        resetWorker();
        onStatus?.("Local TrOCR could not finish. Review the AI engine results.");
        resolve({status:"unavailable",reads:0,completed:0});
      },180000);
    });
    const done=Promise.race([task,timeout]).finally(()=>clearTimeout(watchdog));
    return {enabled:true,cancel:run.cancel,done};
  }
  window.BillyDesktopTrOCR={desktop,eligible,inspect};
})();
