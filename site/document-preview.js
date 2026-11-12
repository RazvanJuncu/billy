/* Billy archived-record preview. Displays saved structured data only, never pretends
   to have retained the original uploaded PDF or photograph. */
(() => {
  "use strict";
  let overlay=null,previousFocus=null;
  const node=(tag,cls,value)=>{
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(value!==undefined)n.textContent=String(value);
    return n;
  };
  const name=key=>String(key).replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
  function display(value){
    if(value===null||value===undefined||value==="")return "";
    if(typeof value==="boolean")return value?"Yes":"No";
    if(Array.isArray(value))return value.map(v=>typeof v==="object"?JSON.stringify(v):String(v)).join(", ");
    if(typeof value==="object")return JSON.stringify(value);
    return String(value);
  }
  function addField(parent,label,value){
    const rendered=display(value);
    if(!rendered)return;
    const row=node("div","billy-preview-field");
    row.append(node("dt","",label),node("dd","",rendered));
    parent.append(row);
  }
  function exportJSON(record){
    const initial=record.extracted_data||null;
    const reviewed=record.reviewed_data||null;
    const changes=initial&&reviewed?Object.keys(reviewed).filter(key=>JSON.stringify(initial[key])!==JSON.stringify(reviewed[key]))
      .map(field_path=>({field_path,original:initial[field_path]??null,reviewed:reviewed[field_path]??null})):[];
    const content=JSON.stringify({
      schema_version:"0.7",approved:record.state==="approved",document_type:record.document_type,
      document:reviewed||initial,original_extraction:initial,changes_from_original:changes,
      original_validation_warnings:record.original_validation_warnings||[],
      review_metadata:record.review_metadata||{},
      review_validation_warnings:record.validation_warnings||[],
      evidence_regions:record.regions_data||[],
      model:record.model_name||null,record_id:record.id,source_sha256:record.source_sha256||null
    },null,2);
    const url=URL.createObjectURL(new Blob([content],{type:"application/json"}));
    const a=node("a");a.href=url;a.download="billy-"+record.id+".json";
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function close(){
    if(!overlay)return;
    const closing=overlay;overlay=null;closing.remove();
    document.removeEventListener("keydown",onKey);
    document.body.classList.remove("billy-preview-open");
    previousFocus?.focus?.();previousFocus=null;
  }
  function onKey(event){
    if(event.key==="Escape"){event.preventDefault();close();}
    if(event.key==="Tab"&&overlay){
      const focusable=[...overlay.querySelectorAll("button:not([disabled])")];
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  }
  function open(record){
    if(!record||!record.id)return;
    close();
    previousFocus=document.activeElement;
    const doc=record.reviewed_data||record.extracted_data||{};
    const classification=record.review_metadata?.classification||{};
    const norm=record.review_metadata?.normalization?.approved?.values||record.review_metadata?.normalization?.extracted?.values||{};
    const title=(classification.profile||record.document_type||"Document").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
    const shade=node("div","billy-preview-overlay");
    shade.addEventListener("click",event=>{if(event.target===shade)close();});
    const panel=node("section","billy-preview-panel");
    panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");
    panel.setAttribute("aria-label","Saved document preview");
    const header=node("header","billy-preview-header");
    const heading=node("div","billy-preview-heading");
    heading.append(node("h2","",title),node("span","billy-preview-state",record.state==="approved"?"✓ Approved":"Not approved"));
    const exit=node("button","billy-preview-close","×");exit.type="button";
    exit.title="Close preview";exit.setAttribute("aria-label","Close preview");
    exit.addEventListener("click",close);header.append(heading,exit);
    const body=node("div","billy-preview-body");
    const note=node("p","billy-preview-source-note","Saved data preview. Original PDF/photo is not archived.");
    body.append(note);
    const brief=node("dl","billy-preview-primary");
    addField(brief,"Aircraft",norm.aircraft_registration||doc.aircraft_registration);
    addField(brief,"Airport",norm.airport_icao||doc.airport_icao||doc.airport);
    addField(brief,"Vendor",doc.supplier_name||doc.property_name||doc.operator_name);
    addField(brief,"Document reference",doc.invoice_number||doc.release_number);
    addField(brief,"Flight",doc.flight_number);
    addField(brief,"Date",norm.service_date||norm.issue_date||norm.delivery_date||doc.service_date||doc.issue_date||doc.delivery_date);
    addField(brief,"Amount",doc.grand_total?String(norm.grand_total??doc.grand_total)+(doc.currency?" "+(norm.currency||doc.currency):""):null);
    addField(brief,"Fuel quantity",doc.delivered_quantity||doc.fuel_quantity);
    addField(brief,"Fuel unit",doc.quantity_unit||doc.fuel_unit);
    body.append(brief);
    const details=node("section","billy-preview-details");
    details.append(node("h3","","Extracted fields"));
    const fields=node("dl","billy-preview-fields");
    for(const [key,val] of Object.entries(doc)){
      if(["regions","english_translations","entity_check_fields","lines","handwritten_entries","notes"].includes(key))continue;
      addField(fields,name(key),val);
    }
    if(fields.children.length)details.append(fields);
    if(Array.isArray(doc.lines)&&doc.lines.length){
      const h=node("h3","","Line items");details.append(h);
      for(const [index,line] of doc.lines.entries()){
        const section=node("dl","billy-preview-line");
        section.append(node("h4","",String(index+1)));
        for(const [key,val] of Object.entries(line||{}))addField(section,name(key),val);
        details.append(section);
      }
    }
    if(Array.isArray(doc.handwritten_entries)&&doc.handwritten_entries.length){
      details.append(node("h3","","Handwritten entries"));
      for(const item of doc.handwritten_entries){
        const section=node("dl","billy-preview-line");
        for(const [key,val] of Object.entries(item||{}))addField(section,name(key),val);
        details.append(section);
      }
    }
    if(Array.isArray(doc.notes)&&doc.notes.length){
      details.append(node("h3","","Notes"));
      const notes=node("ul","billy-preview-notes");
      doc.notes.filter(v=>display(v)).forEach(v=>notes.append(node("li","",v)));
      details.append(notes);
    }
    body.append(details);
    const footer=node("footer","billy-preview-footer");
    const download=node("button","billy-preview-export","↓  Export JSON");download.type="button";
    download.addEventListener("click",()=>exportJSON(record));
    footer.append(download);
    panel.append(header,body,footer);shade.append(panel);
    document.body.append(shade);
    document.body.classList.add("billy-preview-open");
    overlay=shade;document.addEventListener("keydown",onKey);exit.focus();
  }
  window.BillyDocumentPreview={open,close,exportJSON};
})();
