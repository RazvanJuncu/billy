/* Billy Vision review: editable invoice with explicit approval. */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const fieldKeys = [["supplier_name","Supplier"],["supplier_tax_id","Supplier tax ID"],["customer_name","Customer"],["invoice_number","Invoice #"],["issue_date","Issue date"],["due_date","Due date"],["currency","Currency"],["subtotal","Subtotal"],["vat_total","VAT total"],["grand_total","Grand total"]];
const lineKeys = [["description","Description"],["quantity","Quantity"],["unit_price","Unit price"],["net_amount","Net"],["vat_rate","VAT %"],["vat_amount","VAT"]];
let original=null,draft=null,sha="",api="",approved=false,checkbox=null,approveButton=null,notice=null;
const node=(tag,cls="",content)=>{const e=document.createElement(tag);e.className=cls;if(content!==undefined)e.textContent=content;return e;};
const textbox=(value,onUpdate,cls="review-input")=>{const e=node("input",cls);e.type="text";e.value=value??"";e.autocomplete="off";e.addEventListener("input",()=>{onUpdate(e.value||null);dirty();});return e;};
function dirty(){approved=false;if(checkbox)checkbox.checked=false;if(approveButton){approveButton.disabled=true;approveButton.textContent="Approve reviewed invoice";}if(notice)notice.textContent="Changes not approved. Verify the values against the original.";}
function download(text,name,mime){const u=URL.createObjectURL(new Blob([text],{type:mime}));const a=node("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function escapeCell(value){const s=String(value??"");const safe=/^\s*[=+\-@\t\r]/.test(s)?"'"+s:s;return '"'+safe.replaceAll('"','""')+'"';}
function exportCSV(){if(!approved)return;const columns=[...fieldKeys.map(k=>k[0]),...lineKeys.map(k=>k[0])];const rows=draft.lines.length?draft.lines:[{}];const table=[columns,...rows.map(line=>[...fieldKeys.map(k=>draft[k[0]]),...lineKeys.map(k=>line[k[0]])])];download("\ufeff"+table.map(row=>row.map(escapeCell).join(",")).join("\r\n")+"\r\n","billy-approved.csv","text/csv;charset=utf-8");}
function exportJSON(){if(approved)download(JSON.stringify({schema_version:"0.5",approved:true,invoice:draft,source_sha256:sha},null,2),"billy-approved.json","application/json");}
function render(result,endpoint){
 if(!result||!result.invoice||!result.source_sha256)throw Error("Incomplete extraction.");
 original=structuredClone(result.invoice);draft=structuredClone(result.invoice);sha=result.source_sha256;api=endpoint;approved=false;
 const root=$("formattedOutput");root.replaceChildren();root.hidden=false;root.classList.add("vision-review");
 const title=node("div","review-intro");
 title.append(node("span","review-eyebrow","BILLY / VERIFIED DOCUMENT WORKFLOW"),node("h3","review-title","Review extracted invoice"),node("p","review-note","Edit any field. The model's confidence is not calibrated; verify against the original."));
 const metadata=node("div","review-metadata");metadata.append(node("span","",result.model||"Vision AI"),node("span","","No automatic Excel writes"));title.appendChild(metadata);root.appendChild(title);
 const warnings=result.validation_warnings||[];
 const warn=node("div","review-warnings");
 warn.append(node("strong","",warnings.length?warnings.length+" validation checks require review":"No arithmetic discrepancy detected"),node("p","",warnings.join(" · ")||"This does not prove that extraction is correct. Check each field."));root.appendChild(warn);
 const grid=node("div","review-grid");
 fieldKeys.forEach(pair=>{const label=node("label","review-field");label.append(node("span","review-field-name",pair[1]),textbox(draft[pair[0]],v=>{draft[pair[0]]=v;}));grid.appendChild(label);});root.appendChild(grid);
 const heading=node("div","review-list-header");heading.appendChild(node("strong","","Invoice line items"));const add=node("button","review-add-line","+ Add line");add.type="button";heading.appendChild(add);root.appendChild(heading);
 const scroll=node("div","review-table-scroll");const table=node("table","review-items");const head=node("thead");const hrow=node("tr");lineKeys.forEach(x=>hrow.appendChild(node("th","",x[1])));hrow.appendChild(node("th","",""));head.appendChild(hrow);table.appendChild(head);
 const body=node("tbody");table.appendChild(body);scroll.appendChild(table);root.appendChild(scroll);
 function paint(){
   body.replaceChildren();
   draft.lines.forEach((line,index)=>{
     const tr=node("tr");
     lineKeys.forEach(pair=>{const td=node("td");td.appendChild(textbox(line[pair[0]],v=>{line[pair[0]]=v;},pair[0]==="description"?"review-input review-description":"review-input review-numeric"));tr.appendChild(td);});
     const td=node("td");const remove=node("button","line-remove","×");remove.type="button";remove.setAttribute("aria-label","Remove line "+(index+1));remove.addEventListener("click",()=>{draft.lines.splice(index,1);dirty();paint();});td.appendChild(remove);tr.appendChild(td);body.appendChild(tr);
   });
   if(!draft.lines.length){const tr=node("tr");const td=node("td","empty-items","No items found — add lines if needed.");td.colSpan=7;tr.appendChild(td);body.appendChild(tr);}
 }
 add.addEventListener("click",()=>{if(draft.lines.length>=200)return;const blank={};lineKeys.forEach(k=>blank[k[0]]=null);draft.lines.push(blank);dirty();paint();});paint();
 const footer=node("section","review-approval");const label=node("label","review-confirm-label");checkbox=document.createElement("input");checkbox.type="checkbox";label.append(checkbox,node("span","","I verified the invoice values and approve the corrections."));footer.appendChild(label);
 approveButton=node("button","review-approve","Approve reviewed invoice");approveButton.type="button";approveButton.disabled=true;checkbox.addEventListener("change",()=>{approveButton.disabled=!checkbox.checked||approved;});
 approveButton.addEventListener("click",async()=>{
  if(!checkbox.checked||approved)return;approveButton.disabled=true;approveButton.textContent="Saving approval…";
  try{
   const response=await fetch(api+"/api/vision/approve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source_sha256:sha,original,invoice:draft,confirmed:true})});
   const resultBody=await response.json();
   if(!response.ok)throw Error(resultBody.detail||"Approval was not saved");
   approved=true;approveButton.textContent="Approved · record "+resultBody.approval_id;
   notice.textContent="Saved to local pilot log. "+resultBody.correction_count+" field groups corrected. Excel not modified.";
   exports.hidden=false;
  }catch(err){approveButton.textContent="Approve reviewed invoice";approveButton.disabled=!checkbox.checked;notice.textContent="Approval failed: "+(err.message||"Unknown error");}
 });
 footer.appendChild(approveButton);notice=node("p","review-approval-note","Approval saves the corrected invoice to the local pilot log, not Excel.");footer.appendChild(notice);
 const exports=node("div","review-export");exports.hidden=true;
 const csv=node("button","review-export-button","↓ Excel-compatible CSV");csv.type="button";csv.addEventListener("click",exportCSV);
 const json=node("button","review-export-button secondary","↓ Approved JSON");json.type="button";json.addEventListener("click",exportJSON);
 exports.append(csv,json);footer.appendChild(exports);root.appendChild(footer);
}
window.BillyReview={render,exportCSV,exportJSON};
})();
