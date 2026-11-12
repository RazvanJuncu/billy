/* Smart Organization 1.0.
   An attention inbox for APPROVED root records missing archive associations.
   Does not touch extracted values, charge totals, approval or child attachments. */
(() => {
  "use strict";
  const fleet=["YR-WNT","YR-DSR","YR-WHO","YR-DDN","YR-WSF","YR-NKA","YR-BIG"];
  const services=[
    ["fuel","Fuel"],["handling","Handling"],["taxi","Taxi"],["city_tax","City Tax"],
    ["catering","Catering"],["hotel","Hotel"],["pax_gifts","Pax Gifts"],
    ["parking","Parking"],["crew_expenses","Crew Expenses"],
    ["aircraft_supplies","Aircraft Supplies"],["other","Other"]
  ];
  const titles={aircraft:"Aircraft",airport:"Airport",service:"Service",vendor:"Provider"};
  const create=(tag,cls,text)=>{
    const n=document.createElement(tag);if(cls)n.className=cls;
    if(text!==undefined)n.textContent=String(text);
    return n;
  };
  let entries=[],vendors=[],selectedId=null,previewUrl=null,version=0,loading=false,error="";
  const count=()=>entries.length;
  const selected=()=>entries.find(row=>row.id===selectedId)||entries[0]||null;
  const stopPreview=()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}};
  function clear(){
    version++;entries=[];vendors=[];selectedId=null;error="";stopPreview();
    window.BillyDocumentsIndex?.refresh?.();
  }
  async function load(){
    const token=++version;
    const api=window.BILLY_AUTH_CONFIG?.apiUrl;
    if(!api||!window.BillyAccounts?.active?.()){clear();return;}
    loading=true;
    try{
      const headers=await window.BillyAccounts.sessionHeaders();
      const response=await fetch(api+"/api/vision/organization",{headers,cache:"no-store"});
      if(!response.ok)throw Error("Could not load organization inbox.");
      const result=await response.json();
      if(token!==version)return;
      vendors=Array.isArray(result.vendors)?result.vendors.filter(v=>v&&v.id&&v.name):[];
      entries=Array.isArray(result.records)?result.records.filter(row=>
        row&&row.state==="approved"&&!row.parent_document_id&&Array.isArray(row.missing_fields)&&row.missing_fields.length):[];
      if(!entries.some(row=>row.id===selectedId))selectedId=entries[0]?.id||null;
      error="";
    }catch(e){
      if(token!==version)return;
      // Don't claim the inbox is empty when the service is unavailable.
      error=e.message||"Organization inbox unavailable.";
      entries=[];selectedId=null;
    }finally{
      if(token===version){loading=false;window.BillyDocumentsIndex?.refresh?.();}
    }
  }
  function bestField(record,field){
    const data=record.reviewed_data||record.extracted_data||{};
    const meta=record.review_metadata||{};
    const norm=meta.normalization?.approved?.values||meta.normalization?.extracted?.values||{};
    const over=meta.organization_overrides||{};
    switch(field){
      case "aircraft":return over.aircraft||norm.aircraft_registration||data.aircraft_registration||"";
      case "airport":return over.airport||norm.airport_icao||data.airport_icao||data.airport||"";
      case "vendor":return over.vendor||data.supplier_name||data.property_name||data.operator_name||"";
      case "service":return over.service||meta.classification?.expense_category||"";
      default:return "";
    }
  }
  function label(record){
    const profile=record.review_metadata?.classification?.profile||record.document_type||"Document";
    const known={handling_invoice:"Handling Invoice",fuel_release:"Fuel Release",
      fuel_invoice:"Fuel Invoice",payment_slip:"Payment Slip",taxi_receipt:"Taxi Receipt"};
    return known[profile]||String(profile).replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase());
  }
  async function loadPreview(record,holder){
    stopPreview();
    if(!record.has_original){
      holder.append(create("p","billy-org-no-preview","Original image is not archived. The extracted data remains available."));
      return;
    }
    const message=create("p","billy-org-preview-loading","Loading original...");
    holder.append(message);
    const id=record.id,token=version;
    try{
      const {blob,mime}=await window.BillyOriginals.retrieve(id);
      if(token!==version||selected()?.id!==id||!holder.isConnected)return;
      stopPreview();previewUrl=URL.createObjectURL(blob);
      const media=create(mime==="application/pdf"?"iframe":"img",
        mime==="application/pdf"?"billy-org-pdf":"billy-org-image");
      if(mime==="application/pdf")media.title="Document original";
      else media.alt="Original document";
      media.src=previewUrl;
      holder.replaceChildren(media);
    }catch{
      if(holder.isConnected&&selected()?.id===id)
        message.textContent="Original unavailable. Approved fields are still saved.";
    }
  }
  function control(record,key){
    const wrap=create("div","billy-org-field");
    const labelEl=create("label","",titles[key]);wrap.append(labelEl);
    const current=String(bestField(record,key)).trim();
    if(!record.missing_fields.includes(key)){
      const known=create("div","billy-org-known",current||"Not applicable");
      wrap.append(known);return wrap;
    }
    let input;
    if(key==="aircraft"||key==="service"){
      input=create("select","billy-org-input");
      input.append(create("option","","Select "+titles[key].toLowerCase()));
      const options=key==="aircraft"?fleet.map(v=>[v,v]):services;
      for(const [v,name] of options){
        const option=create("option","",name);option.value=v;input.append(option);
      }
    }else if(key==="vendor"){
      const source=record.reviewed_data||record.extracted_data||{};
      const read=source.supplier_name||source.property_name||source.operator_name||"";
      if(read)wrap.append(create("small","billy-org-read","Read from document: "+read));
      input=create("select","billy-org-input");
      input.append(create("option","","Select a vendor"));
      for(const vendor of vendors){
        const option=create("option","",vendor.name);option.value=vendor.id;input.append(option);
      }
      const createNew=create("option","","+ Create new vendor");
      createNew.value="__new__";input.append(createNew);
      const name=create("input","billy-org-input billy-org-new-vendor");
      name.type="text";name.autocomplete="organization";name.maxLength=120;
      name.placeholder="Canonical vendor name";name.hidden=true;
      name.dataset.vendorNew="true";
      input.addEventListener("change",()=>{
        name.hidden=input.value!=="__new__";
        if(!name.hidden)name.focus();
      });
      if(!vendors.length){input.value="__new__";name.hidden=false;}
      wrap.append(input,name);
    }else{
      input=create("input","billy-org-input");
      input.type="text";input.autocomplete="off";
      input.placeholder="ICAO (e.g. LRBS)";
      input.maxLength=4;input.style.textTransform="uppercase";
    }
    input.dataset.organizationField=key;
    input.id="billy-org-"+key;
    labelEl.setAttribute("for",input.id);
    wrap.append(input);
    return wrap;
  }
  async function save(record,form,button,status){
    if(!window.BillyAccounts?.active?.())return;
    const values={};let vendorChoice=null;
    for(const key of record.missing_fields){
      const input=form.querySelector('[data-organization-field="'+key+'"]');
      const value=String(input?.value||"").trim();
      if(!value){status.textContent="Complete "+titles[key].toLowerCase()+".";input?.focus();return;}
      if(key==="vendor"){
        if(value==="__new__"){
          const name=form.querySelector("[data-vendor-new]");
          const canonical=String(name?.value||"").trim();
          if(canonical.length<2){
            status.textContent="Enter the new vendor name.";name?.focus();return;
          }
          vendorChoice={new_name:canonical};
        }else vendorChoice={vendor_id:value};
      }else values[key]=key==="airport"?value.toUpperCase():value;
    }
    const api=window.BILLY_AUTH_CONFIG?.apiUrl;
    button.disabled=true;status.textContent="Saving organization...";
    try{
      const headers=await window.BillyAccounts.sessionHeaders();
      const response=await fetch(api+"/api/vision/organization",{
        method:"POST",headers:{"Content-Type":"application/json",...headers},
        body:JSON.stringify({record_id:record.id,fields:values,
          ...(vendorChoice?{vendor_choice:vendorChoice}:{})})
      });
      const result=await response.json();
      if(!response.ok||result.saved!==true)
        throw Error(result.detail||"Could not save organizational metadata.");
      record.review_metadata={...(record.review_metadata||{}),
        organization_overrides:result.organization_overrides||values};
      window.BillyDocumentsIndex?.refreshOrganization?.(record.id,record.review_metadata.organization_overrides);
      if(vendorChoice){
        const src=record.reviewed_data||record.extracted_data||{};
        const raw=src.supplier_name||src.property_name||src.operator_name||"";
        window.BillyDocumentsIndex?.rememberVendorAlias?.(
          raw,result.organization_overrides?.vendor,result.organization_overrides?.vendor_id);
      }
      if(!result.missing_fields?.length){
        entries=entries.filter(row=>row.id!==record.id);
        selectedId=entries[0]?.id||null;
      }else record.missing_fields=result.missing_fields;
      // Recheck the authoritative count after any successful update.
      await load();
      if(!entries.length){
        window.BillyDocumentsIndex?.navigate?.("Home");
      }else window.BillyDocumentsIndex?.refresh?.();
    }catch(e){
      status.textContent=e.message||"Saving failed.";
      button.disabled=false;
    }
  }
  function render(root){
    stopPreview();
    if(error){
      const retry=create("button","billy-org-retry","Could not load the inbox. Retry");
      retry.type="button";retry.addEventListener("click",()=>void load());
      root.append(retry);return;
    }
    if(loading&&!entries.length){
      root.append(create("p","billy-org-loading","Checking document organization..."));
      return;
    }
    if(!entries.length){
      root.append(create("p","billy-org-loading","No documents need organizing."));
      return;
    }
    const row=create("div","billy-org-layout");
    const left=create("div","billy-org-left");
    const stack=create("div","billy-org-queue");
    for(const entry of entries){
      const select=create("button","billy-org-queue-row",label(entry));
      select.type="button";
      select.setAttribute("aria-pressed",String(selected()?.id===entry.id));
      select.append(create("span","billy-org-queue-sub",entry.missing_fields.map(key=>titles[key]).join(", ")));
      select.addEventListener("click",()=>{
        selectedId=entry.id;window.BillyDocumentsIndex?.refresh?.();
      });
      stack.append(select);
    }
    left.append(stack);
    const record=selected();
    if(!record){root.append(row);return;}
    const preview=create("div","billy-org-original");
    left.append(preview);
    const right=create("div","billy-org-right");
    const heading=create("div","billy-org-details-head");
    heading.append(create("strong","",label(record)),
      create("span","",record.missing_fields.length+" missing field"+(record.missing_fields.length===1?"":"s")));
    right.append(heading);
    const form=create("form","billy-org-form");
    // Missing associations always come first; detected fields are only context.
    for(const key of record.missing_fields)form.append(control(record,key));
    const known=["aircraft","airport","service","vendor"].filter(key=>!record.missing_fields.includes(key));
    if(known.length){
      form.append(create("p","billy-org-known-title","Already identified"));
      for(const key of known)form.append(control(record,key));
    }
    const status=create("p","billy-org-status","");
    const button=create("button","billy-org-save","Save & organize");
    button.type="submit";
    const owns=record.created_by===window.BillyAccounts?.userId?.();
    if(!owns){
      button.disabled=true;
      status.textContent="Only the uploading operator can change these associations.";
    }
    form.addEventListener("submit",event=>{
      event.preventDefault();if(!owns)return;
      void save(record,form,button,status);
    });
    form.append(button,status);right.append(form);
    row.append(left,right);root.append(row);
    void loadPreview(record,preview);
  }
  window.BillyOrganizer={count,load,clear,render,missing:record=>record?.missing_fields||[]};
})();
