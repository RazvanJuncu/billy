/* On-device handwriting OCR worker: no training, analytics or document uploads.
 * Only model weights are downloaded from public model/CDN hosts.
 * TrOCR is line OCR; crop location is supplied by Gemini and not guaranteed.
 */
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const MODEL = "Xenova/trocr-small-handwritten";
let readerPromise=null;
function reader(){
  if(!readerPromise){
    readerPromise=pipeline("image-to-text",MODEL,{
      device:"wasm",dtype:"q8",
      progress_callback: event => {
        if(event?.status==="progress") self.postMessage({kind:"progress"});
      }
    }).catch(error=>{readerPromise=null;throw error;});
  }
  return readerPromise;
}
self.onmessage=async ({data})=>{
  if(data?.kind!=="read"||!Number.isInteger(data.id)||
    typeof data.image!=="string"||!data.image.startsWith("data:image/png;base64,")||
    data.image.length>5_000_000)return;
  try{
    const pipe=await reader();
    const prediction=await pipe(data.image,{max_new_tokens:64});
    const first=Array.isArray(prediction)?prediction[0]:prediction;
    self.postMessage({kind:"result",id:data.id,
      text:typeof first?.generated_text==="string"?first.generated_text:""});
  }catch(error){
    self.postMessage({kind:"error",id:data.id,
      message:String(error?.message||"Model could not run").slice(0,170)});
  }
};
