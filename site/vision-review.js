/* Billy Vision review: editable invoice with explicit approval. */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const invoiceFieldKeys = [["supplier_name","Supplier"],["supplier_tax_id","Supplier tax ID"],["customer_name","Customer"],["invoice_number","Invoice #"],["issue_date","Issue date"],["due_date","Due date"],["currency","Currency"],["subtotal","Subtotal"],["vat_total","VAT total"],["grand_total","Grand total"]];
const invoiceLineKeys = [["description","Description"],["quantity","Quantity"],["unit_price","Unit price"],["net_amount","Net"],["vat_rate","VAT %"],["vat_amount","VAT"]];
const fuelFieldKeys = [["release_number","Release #"],["supplier_name","Fuel supplier"],["operator_name","Operator"],["airport","Airport"],["aircraft_registration","Registration"],["flight_number","Flight"],["delivery_date","Delivery date"],["fuel_type","Fuel type"],["requested_quantity","Requested fuel"],["delivered_quantity","Delivered fuel"],["quantity_unit","Unit"],["truck_identifier","Truck"],["fueler_name","Fueler"],["receiver_name","Receiver"]];
const handwritingKeys = [["label","Field"],["transcription","Handwriting"],["legibility","Legibility"]];
let fieldKeys=invoiceFieldKeys,lineKeys=invoiceLineKeys,documentType="invoice",extractId="",getHeaders=null;

let original=null,draft=null,sha="",api="",approved=false,approveButton=null,notice=null,exportPanel=null;
const node=(tag,cls="",content)=>{const e=document.createElement(tag);e.className=cls;if(content!==undefined)e.textContent=content;return e;};
const textbox=(value,onUpdate,cls="review-input",path=null)=>{const e=node("input",cls);e.type="text";e.value=value??"";e.autocomplete="off";if(path)e.dataset.evidencePath=path;e.addEventListener("input",()=>{onUpdate(e.value||null);dirty();});return e;};
function dirty(){approved=false;if(approveButton){approveButton.disabled=false;approveButton.textContent="Submit corrections";}if(notice)notice.textContent="Changes not submitted. Verify the values against the original.";if(exportPanel)exportPanel.hidden=true;}
function download(text,name,mime){const u=URL.createObjectURL(new Blob([text],{type:mime}));const a=node("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function escapeCell(value){const s=String(value??"");const dangerous=/^\s*[=+@]/.test(s) || (/^\s*-/.test(s) && !/^\s*-\d+(?:[.,]\d+)?\s*$/.test(s));const safe=dangerous?"'"+s:s;return '"'+safe.replaceAll('"','""')+'"';}
function exportCSV(){if(!approved)return;const columns=[...fieldKeys.map(k=>k[0]),...lineKeys.map(k=>k[0])];const items=documentType==="fuel_release"?draft.handwritten_entries:draft.lines;const rows=items.length?items:[{}];const table=[columns,...rows.map(line=>[...fieldKeys.map(k=>draft[k[0]]),...lineKeys.map(k=>line[k[0]])])];download("\ufeff"+table.map(row=>row.map(escapeCell).join(",")).join("\r\n")+"\r\n","billy-approved.csv","text/csv;charset=utf-8");}
function exportJSON(){if(approved)download(JSON.stringify({schema_version:"0.6",approved:true,document_type:documentType,document:draft,source_sha256:sha},null,2),"billy-approved.json","application/json");}
function render(result,endpoint,authHeaders,sourceFile=null){
 documentType=result?.document_type||"invoice";
 const source=documentType==="fuel_release"?result?.fuel_release:result?.invoice;
 if(!source||!result.extraction_id||!result.source_sha256)throw Error("Incomplete extraction.");
 fieldKeys=documentType==="fuel_release"?fuelFieldKeys:invoiceFieldKeys;
 lineKeys=documentType==="fuel_release"?handwritingKeys:invoiceLineKeys;
 original=structuredClone(source);draft=structuredClone(source);sha=result.source_sha256;
 extractId=result.extraction_id;api=endpoint;getHeaders=authHeaders;approved=false;
 const root=$("formattedOutput");root.replaceChildren();root.hidden=false;root.classList.add("vision-review");
 const title=node("div","review-intro");
 title.append(node("span","review-eyebrow","BILLYDPI / VERIFIED DOCUMENT WORKFLOW"),node("h3","review-title",documentType==="fuel_release"?"Review Fuel Release":"Review extracted invoice"),node("p","review-note","Verify and correct the extracted fields."));
 root.appendChild(title);
 const warnings=result.validation_warnings||[];
 const warn=node("div","review-warnings");
 warn.append(node("strong","",warnings.length?warnings.length+" validation checks require review":"No validation warnings detected"),node("p","",warnings.join(" · ")||"This does not prove that extraction is correct. Check each field."));root.appendChild(warn);
 const grid=node("div","review-grid");
 fieldKeys.forEach(pair=>{const label=node("label","review-field");label.append(node("span","review-field-name",pair[1]),textbox(draft[pair[0]],v=>{draft[pair[0]]=v;},"review-input",pair[0]));grid.appendChild(label);});root.appendChild(grid);
 const heading=node("div","review-list-header");heading.appendChild(node("strong","",documentType==="fuel_release"?"Handwritten fields":"Invoice line items"));const add=node("button","review-add-line",documentType==="fuel_release"?"+ Add handwritten field":"+ Add line");add.type="button";heading.appendChild(add);root.appendChild(heading);
 const scroll=node("div","review-table-scroll");const table=node("table","review-items");const head=node("thead");const hrow=node("tr");lineKeys.forEach(x=>hrow.appendChild(node("th","",x[1])));hrow.appendChild(node("th","",""));head.appendChild(hrow);table.appendChild(head);
 const body=node("tbody");table.appendChild(body);scroll.appendChild(table);root.appendChild(scroll);
 function paint(){
   body.replaceChildren();
   (documentType==="fuel_release"?draft.handwritten_entries:draft.lines).forEach((line,index)=>{
     const tr=node("tr");
     lineKeys.forEach(pair=>{
       const td=node("td");
       if(pair[0]==="legibility"){
         const select=node("select","review-input review-numeric");
         for(const value of ["clear","uncertain","illegible"]){
           const opt=node("option","",value);opt.value=value;select.appendChild(opt);
         }
         select.value=line.legibility||"uncertain";
         select.dataset.evidencePath=(documentType==="fuel_release"?"handwritten_entries":"lines")+"["+index+"]."+pair[0];
         select.addEventListener("change",()=>{line.legibility=select.value;dirty();});
         td.appendChild(select);
       }else td.appendChild(textbox(line[pair[0]],v=>{line[pair[0]]=v;},pair[0]==="description"||pair[0]==="transcription"?"review-input review-description":"review-input review-numeric",(documentType==="fuel_release"?"handwritten_entries":"lines")+"["+index+"]."+pair[0]));
       tr.appendChild(td);
     });
     const td=node("td");const remove=node("button","line-remove","×");remove.type="button";remove.setAttribute("aria-label","Remove line "+(index+1));remove.addEventListener("click",()=>{(documentType==="fuel_release"?draft.handwritten_entries:draft.lines).splice(index,1);dirty();paint();});td.appendChild(remove);tr.appendChild(td);body.appendChild(tr);
   });
   if(!(documentType==="fuel_release"?draft.handwritten_entries:draft.lines).length){const tr=node("tr");const td=node("td","empty-items","No fields found. Add them manually if needed.");td.colSpan=lineKeys.length+1;tr.appendChild(td);body.appendChild(tr);}
 }
 add.addEventListener("click",()=>{const items=documentType==="fuel_release"?draft.handwritten_entries:draft.lines;if(items.length>=100)return;const blank={};lineKeys.forEach(k=>blank[k[0]]=null);if(documentType==="fuel_release"){blank.label="Additional field";blank.legibility="uncertain";}items.push(blank);dirty();paint();});paint();
 const footer=node("section","review-approval");
 const cloudReview = api.includes("/functions/v1/billy-vision");
 footer.appendChild(node("p","review-confirm-label","By clicking Submit corrections, I confirm I checked every value and unclear handwritten entry against the original document. " +
   (cloudReview ? "Approved values are stored in your team's private Billy cloud records." : "Corrections are saved to this team's local pilot feedback memory.")));
 const trainingEligible = !cloudReview && result.handwriting_training_capture_enabled === true && !!sourceFile;
 const trainingNotice = trainingEligible
  ? "Submit & Learn securely sends only corrected, localized text crops to your team's local handwriting training queue. No model is retrained instantly. Choose Submit only to skip training."
  : "Submit corrections saves your review. Handwriting training is off until the team explicitly enables it.";
 const footerNote = node("p","review-training-consent",trainingNotice);
 footer.appendChild(footerNote);
 approveButton=node("button","review-approve",trainingEligible?"Submit & Learn":"Submit corrections");
 approveButton.type="button";approveButton.disabled=false;
 async function submitReview(allowTraining){
   if(approved)return;
   approveButton.disabled=true;
   if(skipTraining)skipTraining.disabled=true;
   approveButton.textContent="Saving corrections…";
   try{
     const response=await fetch(api+"/api/vision/approve",{
       method:"POST",
       headers:{"Content-Type":"application/json",...await getHeaders()},
       body:JSON.stringify({extraction_id:extractId,document_type:documentType,document:draft,confirmed:true})
     });
     const resultBody=await response.json();
     if(!response.ok)throw Error(resultBody.detail||"Approval was not saved");
     approved=true;
     let trainingMessage="Handwriting fine-tuning was not requested.";
     if(allowTraining && trainingEligible){
       approveButton.textContent="Queueing handwriting examples…";
       const form=new FormData();
       form.append("file",sourceFile,sourceFile.name||"document");
       form.append("extraction_id",extractId);
       form.append("training_consent","true");
       try{
         // User must deliberately choose Submit & Learn; no hidden data collection.
         const reply=await fetch(api+"/api/handwriting/examples",{
           method:"POST",headers:{...await getHeaders()},body:form
         });
         const feedback=await reply.json();
         if(!reply.ok)throw Error(feedback.detail||"The training queue rejected this sample.");
         trainingMessage=feedback.examples_added
           ? feedback.examples_added+" verified crop(s) queued for team-specific TrOCR fine-tuning; model weights are unchanged until validated training runs."
           : "Review saved, but no corrected field had a usable matching image region. No training crop was stored.";
       }catch(error){
         trainingMessage="Review saved, but handwriting sample collection failed: "+(error.message||"Unknown error")+
           ". No fine-tuning is implied.";
       }
     }
     approveButton.textContent="Submitted · record "+resultBody.approval_id;
     notice.textContent=cloudReview ? "Approved values saved to your team cloud records. Original file is not archived; company Excel is not updated." : trainingMessage+" Company Excel is not connected.";
     exports.hidden=false;
     root.querySelectorAll(".review-grid input, .review-items input, .review-items select, .review-add-line, .line-remove").forEach(el=>{el.disabled=true;});
     if(skipTraining)skipTraining.disabled=true;
     window.dispatchEvent(new CustomEvent("billy:document-approved",{
       detail:{approvalId:resultBody.approval_id,documentType}
     }));
   }catch(error){
     approveButton.textContent=trainingEligible?"Submit & Learn":"Submit corrections";
     approveButton.disabled=false;
     if(skipTraining)skipTraining.disabled=false;
     notice.textContent="Submission failed: "+(error.message||"Unknown error");
   }
 }
 approveButton.addEventListener("click",()=>submitReview(trainingEligible));
 footer.appendChild(approveButton);
 const skipTraining = trainingEligible ? node("button","review-submit-without-training","Submit only · don't train") : null;
 if(skipTraining){
   skipTraining.type="button";
   skipTraining.addEventListener("click",()=>submitReview(false));
   footer.appendChild(skipTraining);
 }
 notice=node("p","review-approval-note","Review the highlighted regions and fields before submitting.");
 footer.appendChild(notice);
 const exports=node("div","review-export");exports.hidden=true;exportPanel=exports;
 const csv=node("button","review-export-button","↓ Excel-compatible CSV");csv.type="button";csv.addEventListener("click",exportCSV);
 const json=node("button","review-export-button secondary","↓ Approved JSON");json.type="button";json.addEventListener("click",exportJSON);
 exports.append(csv,json);footer.appendChild(exports);root.appendChild(footer);
 if(window.BillyRegions?.mount){
   window.BillyRegions.mount({
     root, file:sourceFile, regions:result.regions||[],
     agreement:result.historical_field_agreement||{},
     secondOpinion:result.handwriting_second_opinion||null
   });
 }
}
window.BillyReview={render,exportCSV,exportJSON};
})();
