/* Billy Vision review: editable invoice with explicit approval. */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const invoiceFieldKeys = [["supplier_name","Supplier"],["supplier_tax_id","Supplier tax ID"],["customer_name","Customer"],["invoice_number","Invoice #"],["issue_date","Issue date"],["due_date","Due date"],["currency","Currency"],["subtotal","Subtotal"],["vat_total","VAT total"],["grand_total","Grand total"]];
const invoiceLineKeys = [["description","Description"],["quantity","Quantity"],["unit_price","Unit price"],["net_amount","Net"],["vat_rate","VAT %"],["vat_amount","VAT"]];
const fuelFieldKeys = [["release_number","Release #"],["supplier_name","Fuel supplier"],["operator_name","Operator"],["airport","Airport"],["aircraft_registration","Registration"],["flight_number","Flight"],["delivery_date","Delivery date"],["fuel_type","Fuel type"],["requested_quantity","Requested fuel"],["delivered_quantity","Delivered fuel"],["quantity_unit","Unit"],["truck_identifier","Truck"],["fueler_name","Fueler"],["receiver_name","Receiver"],["meter_start","Meter start"],["meter_finish","Meter finish"]];
const handwritingKeys = [["label","Original field label"],["transcription","Raw handwriting"],["legibility","Legibility"],["interpreted_as","Interpreted as"]];
const translatedHandwritingKeys = [
  ["label","Original field label"],["english_label","Label (English)"],
  ["transcription","Raw handwriting"],["english_translation","English meaning"],
  ["legibility","Legibility"],["interpreted_as","Interpreted as"]
];
let fieldKeys=invoiceFieldKeys,lineKeys=invoiceLineKeys,documentType="invoice",extractId="",getHeaders=null;

let original=null,draft=null,sha="",api="",approved=false,approveButton=null,notice=null,exportPanel=null,auditMeta=null,approvalResult=null;
const node=(tag,cls="",content)=>{const e=document.createElement(tag);e.className=cls;if(content!==undefined)e.textContent=content;return e;};
const textbox=(value,onUpdate,cls="review-input",path=null)=>{const e=node("input",cls);e.type="text";e.value=value??"";e.autocomplete="off";if(path)e.dataset.evidencePath=path;e.addEventListener("input",()=>{onUpdate(e.value||null);dirty();});return e;};
function dirty(){approved=false;if(approveButton){approveButton.disabled=false;approveButton.textContent="Submit corrections";}if(notice)notice.textContent="Changes not submitted. Verify the values against the original.";if(exportPanel)exportPanel.hidden=true;const meter=document.querySelector(".review-meter-check");if(meter&&documentType==="fuel_release")meter.textContent=localMeterCheck(draft);}
function download(text,name,mime){const u=URL.createObjectURL(new Blob([text],{type:mime}));const a=node("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function escapeCell(value){const s=String(value??"");const dangerous=/^\s*[=+@]/.test(s) || (/^\s*-/.test(s) && !/^\s*-\d+(?:[.,]\d+)?\s*$/.test(s));const safe=dangerous?"'"+s:s;return '"'+safe.replaceAll('"','""')+'"';}
function getApprovedSpreadsheetData(){
  if(!approved||!draft)return null;
  // Document-level metadata describes ONE document. Never repeat it once for
  // every handwritten field / invoice line: the preview is a report, not a JOIN.
  const details=fieldKeys
    .filter(([key])=>draft[key]!==null&&draft[key]!==undefined&&String(draft[key]).trim()!=="")
    .map(([key,label])=>({key,label,value:draft[key]}));
  // Free-text notes are part of the approved extraction, not disposable extras.
  if(Array.isArray(draft.notes))draft.notes.forEach((value,index)=>{
    if(value!==null&&value!==undefined&&String(value).trim()!=="")
      details.push({key:"notes["+index+"]",label:"Note "+(index+1),value});
  });
  const sourceRows=documentType==="fuel_release"?draft.handwritten_entries:draft.lines;
  const columns=lineKeys.map(([key,label])=>({key,label}));
  const rows=(Array.isArray(sourceRows)?sourceRows:[]).map(item=>
    columns.map(column=>item?.[column.key]??""));
  const entries={
    title:documentType==="fuel_release"?"Handwritten entries":"Invoice line items",
    columns,rows
  };
  return {documentType,details,entries};
}
function exportCSV(){
  const sheet=getApprovedSpreadsheetData();
  if(!sheet)return;
  // A single CSV has one worksheet: separate the document summary and its
  // individual entries with explicit headings. No repeated document metadata.
  const table=[
    ["Document details"],["Field","Value"],
    ...sheet.details.map(field=>[field.label,field.value]),
    [],
    [sheet.entries.title],
    sheet.entries.columns.map(column=>column.label),
    ...sheet.entries.rows
  ];
  download("\ufeff"+table.map(row=>row.map(escapeCell).join(",")).join("\r\n")+"\r\n",
    "billy-approved.csv","text/csv;charset=utf-8");
}
function auditChanges(){
  return Object.keys(draft||{}).filter(key=>JSON.stringify(original?.[key])!==JSON.stringify(draft[key]))
    .map(field_path=>({field_path,original:original?.[field_path]??null,reviewed:draft[field_path]??null}));
}
function exportRawJSON(){
  if(!original)return;
  download(JSON.stringify({
    schema_version:"0.7",approved:false,review_status:"unverified_gemini_output",
    document_type:documentType,source_sha256:sha,extraction_id:extractId,
    model:auditMeta?.model||null,document:original,
    original_validation_warnings:auditMeta?.warnings||[],
    translation:auditMeta?.translation||null,
    evidence_regions:auditMeta?.regions||[]
  },null,2),"billy-original-ai-unverified.json","application/json");
}
function exportJSON(){
  if(!approved)return;
  download(JSON.stringify({
    schema_version:"0.7",approved:true,document_type:documentType,
    document:draft,original_extraction:original,
    changes_from_original:auditChanges(),
    original_validation_warnings:auditMeta?.warnings||[],
    review_validation_warnings:approvalResult?.validation_warnings||[],
    translation:auditMeta?.translation||null,
    evidence_regions:auditMeta?.regions||[],
    ramp_review:window.BillyReview?.rampAudit?.()||null,
    
    model:auditMeta?.model||null,approval_id:approvalResult?.approval_id||null,
    source_sha256:sha
  },null,2),"billy-approved.json","application/json");
}
function localMeterCheck(doc){
  const parseMeter=value=>{
    const raw=String(value??"").trim();
    if(!/^\d+$/.test(raw)&&!/^\d{1,3}(?:[ ,.]\d{3})+$/.test(raw))return null;
    const number=Number(raw.replace(/[ , .]/g,""));
    return Number.isSafeInteger(number)&&number>=0?number:null;
  };
  const start=parseMeter(doc?.meter_start),finish=parseMeter(doc?.meter_finish);
  if(!doc?.meter_start&&!doc?.meter_finish)return "No meter readings supplied. Verify the source manually if it contains meter values.";
  if(start===null||finish===null)return "Meter readings incomplete or not numeric. Verify the source manually.";
  if(finish<start)return "Meter finish is less than start. Check rollover or transcription.";
  const difference=finish-start;
  const raw=String(doc.delivered_quantity??"").trim();
  const quantity=/^\d{1,3}(?:,\d{3})+$/.test(raw)?Number(raw.replace(/,/g,"")):Number(raw.replace(/\s*(?:GAL|GALLONS|LITRES|LITERS|LTR|L)$/i,"").trim().replace(",","."));
  if(!Number.isFinite(quantity)||!raw)return "Meter difference: "+difference+". Delivered quantity missing or unreadable.";
  return Math.abs(difference-quantity)<=0.01
    ? "Meter check: "+difference+" matches delivered quantity. Verify original digits visually; arithmetic is not OCR proof."
    : "METER MISMATCH: "+difference+" calculated from readings vs "+doc.delivered_quantity+" delivered. Needs verification.";
}
function render(result,endpoint,authHeaders,sourceFile=null){
 documentType=result?.document_type||"invoice";
 const source=documentType==="fuel_release"?result?.fuel_release:result?.invoice;
 if(!source||!result.extraction_id||!result.source_sha256)throw Error("Incomplete extraction.");
 fieldKeys=documentType==="fuel_release"?fuelFieldKeys:invoiceFieldKeys;
 lineKeys=documentType==="fuel_release"?
   (source.handwritten_entries||[]).some(row=>row.english_label||row.english_translation)?
     translatedHandwritingKeys:handwritingKeys
   :invoiceLineKeys;
 original=structuredClone(source);draft=structuredClone(source);sha=result.source_sha256;
 extractId=result.extraction_id;api=endpoint;getHeaders=authHeaders;approved=false;approvalResult=null;
 auditMeta={model:result.model||null,warnings:structuredClone(result.validation_warnings||[]),regions:structuredClone(result.regions||[]),translation:structuredClone(result.translation||null)};
 const root=$("formattedOutput");root.replaceChildren();root.hidden=false;root.classList.add("vision-review");
 const title=node("div","review-intro");
 title.append(node("span","review-eyebrow","BILLYDPI / VERIFIED DOCUMENT WORKFLOW"),node("h3","review-title",documentType==="fuel_release"?"Review Fuel Release":"Review extracted invoice"),node("p","review-note","Verify and correct the extracted fields."));
 root.appendChild(title);
 if(auditMeta?.translation?.status==="translated"){
   const lang=String(auditMeta.translation.source_language||"unknown").toUpperCase();
   root.appendChild(node("p","review-translation-note",
     "Descriptions translated from "+lang+" to English. Original text retained for verification."));
 }
 const rawButton=node("button","review-export-button secondary review-raw-export","Download original AI engine JSON (unverified)");
 rawButton.type="button";rawButton.addEventListener("click",exportRawJSON);
 root.appendChild(rawButton);
 const flaggedPaths=new Set((result.regions||[]).filter(region=>region?.visual_clarity!=="clear").map(region=>region.field_path));
 const warnings=result.validation_warnings||[];
 const warn=node("div","review-warnings");
 warn.append(node("strong","",warnings.length?warnings.length+" initial AI warnings require review":"No initial validation warnings detected"),node("p","",warnings.join(" · ")||"This does not prove that extraction is correct. Check each field."));root.appendChild(warn);
 const grid=node("div","review-grid");
 fieldKeys.forEach(pair=>{
   const label=node("label","review-field");
   label.append(node("span","review-field-name",pair[1]),textbox(draft[pair[0]],v=>{draft[pair[0]]=v;},"review-input",pair[0]));
   if(flaggedPaths.has(pair[0])||documentType==="fuel_release"&&["meter_start","meter_finish","delivered_quantity"].includes(pair[0]))
     label.appendChild(node("span","review-field-alert","Needs verification against the original"));
   grid.appendChild(label);
 });root.appendChild(grid);
 const meterNote=node("p","review-meter-check","");
 if(documentType==="fuel_release"){meterNote.textContent=localMeterCheck(draft);root.appendChild(meterNote);}

 const heading=node("div","review-list-header");heading.appendChild(node("strong","",documentType==="fuel_release"?"Handwritten fields":"Invoice line items"));const add=node("button","review-add-line",documentType==="fuel_release"?"+ Add handwritten field":"+ Add line");add.type="button";heading.appendChild(add);root.appendChild(heading);
 const scroll=node("div","review-table-scroll");const table=node("table","review-items");const head=node("thead");const hrow=node("tr");lineKeys.forEach(x=>hrow.appendChild(node("th","",x[1])));hrow.appendChild(node("th","",""));head.appendChild(hrow);table.appendChild(head);
 const body=node("tbody");table.appendChild(body);scroll.appendChild(table);root.appendChild(scroll);
 function paint(){
   body.replaceChildren();
   (documentType==="fuel_release"?draft.handwritten_entries:draft.lines).forEach((line,index)=>{
     const tr=node("tr");
     lineKeys.forEach(pair=>{
       const td=node("td");
       if(pair[0]==="interpreted_as"){
         const select=node("select","review-input review-numeric");
         const none=node("option","","No interpretation");none.value="";select.appendChild(none);
         for(const [key,name] of fuelFieldKeys){
           const opt=node("option","",name);opt.value=key;select.appendChild(opt);
         }
         select.value=line.interpreted_as||"";
         select.addEventListener("change",()=>{line.interpreted_as=select.value||null;dirty();});
         td.appendChild(select);
       }else if(pair[0]==="legibility"){
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
 // Operator approval stores the document's reviewed values, not training crops.
 approveButton=node("button","review-approve","Submit corrections");
 approveButton.type="button";approveButton.disabled=false;
 async function submitReview(){
   if(approved)return;
   // Ramp verification flow is a mandatory gate when active.
   if(typeof window.BillyReview?.canApprove==="function"&&!window.BillyReview.canApprove())return;
   approveButton.disabled=true;
   approveButton.textContent="Saving corrections…";
   try{
     const response=await fetch(api+"/api/vision/approve",{
       method:"POST",
       headers:{"Content-Type":"application/json",...await getHeaders()},
       body:JSON.stringify({
         extraction_id:extractId,document_type:documentType,document:draft,confirmed:true,
         not_on_document:window.BillyReview?.rampAudit?.()?.not_on_document||[],
         manual_confirmations:window.BillyReview?.rampAudit?.()?.manual_confirmations||[]
       })
     });
     const resultBody=await response.json();
     if(!response.ok)throw Error(resultBody.detail||"Approval was not saved");
     approved=true;approvalResult=resultBody;
     approveButton.textContent="Submitted · record "+resultBody.approval_id;
     notice.textContent="Approved values saved. Original file is not archived; company Excel is not updated. No training samples are created.";
     exports.hidden=false;
     root.querySelectorAll(".review-grid input, .review-items input, .review-items select, .review-add-line, .line-remove").forEach(el=>{el.disabled=true;});
     window.dispatchEvent(new CustomEvent("billy:document-approved",{
       detail:{approvalId:resultBody.approval_id,documentType}
     }));
   }catch(error){
     approveButton.textContent="Submit corrections";
     approveButton.disabled=false;
     notice.textContent="Submission failed: "+(error.message||"Unknown error");
     window.dispatchEvent(new CustomEvent("billy:approval-failed",{
       detail:{message:"Submission failed: "+(error.message||"Unknown error")}
     }));
   }
 }
 approveButton.addEventListener("click",submitReview);
 footer.appendChild(approveButton);
 notice=node("p","review-approval-note","Review the highlighted regions and fields before submitting.");
 footer.appendChild(notice);
 const exports=node("div","review-export");exports.hidden=true;exportPanel=exports;
 const csv=node("button","review-export-button","↓ Excel-compatible CSV");csv.type="button";csv.addEventListener("click",exportCSV);
 const json=node("button","review-export-button secondary","↓ Approved JSON");json.type="button";json.addEventListener("click",exportJSON);
 exports.append(csv,json);footer.appendChild(exports);root.appendChild(footer);
 if(window.BillyRegions?.mount){
   window.BillyRegions.mount({
     root, file:sourceFile, regions:result.regions||[],
     agreement:result.historical_field_agreement||{}
   });
 }
}
window.BillyReview={render,exportCSV,exportJSON,exportRawJSON,
  getApprovedSpreadsheetData};
})();
