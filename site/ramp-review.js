/* Billy ramp review: compact, exception-first verification.
   Green means no outstanding review task, NOT a calibrated OCR confidence.
   Original image and full editable review remain available on demand. */
(() => {
  "use strict";
  const originalRender=window.BillyReview?.render;
  if(typeof originalRender!=="function")return;
  const $=id=>document.getElementById(id);
  let disposeActiveCrop=null;
  const create=(tag,cls="",value)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=value;
    return el;
  };
  const invoiceFields={
    supplier_name:"Supplier",supplier_tax_id:"Supplier tax ID",
    customer_name:"Customer",invoice_number:"Invoice number",
    issue_date:"Issue date",due_date:"Due date",currency:"Currency",
    subtotal:"Subtotal",vat_total:"Tax",grand_total:"Grand total"
  };
  const fuelFields={
    release_number:"Release number",supplier_name:"Supplier",
    operator_name:"Operator",airport:"Airport",aircraft_registration:"Registration",
    flight_number:"Flight",delivery_date:"Date",fuel_type:"Fuel type",
    requested_quantity:"Requested quantity",delivered_quantity:"Delivered quantity",
    quantity_unit:"Unit",truck_identifier:"Truck",fueler_name:"Fueler",
    receiver_name:"Receiver",meter_start:"Meter start",meter_finish:"Meter finish"
  };
  const required={
    invoice:["invoice_number","supplier_name","grand_total"],
    fuel_release:["aircraft_registration","delivered_quantity","quantity_unit","delivery_date"]
  };
  const highRisk=new Set(["grand_total","invoice_number","delivered_quantity","meter_start","meter_finish","aircraft_registration"]);
  const severity={green:0,yellow:1,red:2};
  const labelFor=(path,type,doc)=>{
    if(path.includes("[")){
      const match=path.match(/^(lines|handwritten_entries)\[(\d+)\]\.(\w+)$/);
      if(match){
        const name=match[1]==="lines"?"Line":"Handwriting";
        const row=doc[match[1]]?.[Number(match[2])];
        return name+" "+(Number(match[2])+1)+" · "+
          (match[3]==="transcription"?(row?.label||"Transcription"):match[3].replaceAll("_"," "));
      }
    }
    return (type==="invoice"?invoiceFields:fuelFields)[path]||path.replaceAll("_"," ");
  };
  const valueAt=(doc,path)=>{
    const match=path.match(/^(lines|handwritten_entries)\[(\d+)\]\.(\w+)$/);
    return match?doc[match[1]]?.[Number(match[2])]?.[match[3]]:doc[path];
  };
  const setAt=(doc,path,value)=>{
    const match=path.match(/^(lines|handwritten_entries)\[(\d+)\]\.(\w+)$/);
    if(match)doc[match[1]][Number(match[2])][match[3]]=value;
    else doc[path]=value;
  };
  const substantive=value=>value!==null&&value!==undefined&&String(value).trim()!=="";
  const fieldsFor=(doc,type)=>{
    const items=[];
    const labels=type==="invoice"?invoiceFields:fuelFields;
    for(const key of Object.keys(labels)){
      if(substantive(doc[key])||required[type].includes(key))items.push(key);
    }
    const array=type==="invoice"?"lines":"handwritten_entries";
    const keys=type==="invoice"?["description","quantity","unit_price","net_amount","vat_rate","vat_amount"]:["transcription"];
    (doc[array]||[]).forEach((row,i)=>{
      for(const key of keys)if(substantive(row[key]))
        items.push(array+"["+i+"]."+key);
    });
    return items;
  };
  function classification(path,doc,type,regions,warnings) {
    const value=valueAt(doc,path);
    if(!substantive(value))return {
      level:highRisk.has(path)?"red":"yellow",
      reason:"No value extracted. Verify the source, or choose Not on document if this field is absent."
    };
    let level="green",reason="No issue flagged by the first AI pass. Still review before final approval.";
    const matches=regions.filter(region=>region.field_path===path);
    if(matches.length){
      for(const region of matches){
        const q=region.visual_clarity;
        const risk=q==="unreadable"||q==="ambiguous"?"red":
          q==="slight_uncertainty"||q==="unassessed"||!q?"yellow":"green";
        if(severity[risk]>severity[level]){
          level=risk;reason=region.visual_reason||"Source text needs verification.";
        }
        // A model proposing materially different readings is expressing uncertainty,
        // even when it calls its primary choice "clear". Do not silently mark green.
        const normalized=v=>String(v??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
        const chosen=normalized(value);
        const alternate=(region.alternate_readings||[]).find(a=>{
          const other=normalized(a);
          if(!other||other===chosen)return false;
          // A single optional prefix (e.g. "M 04569" vs "04569") isn't
          // necessarily an alternate reading of the handwritten digits.
          if(chosen.endsWith(other)&&chosen.length-other.length<=1)return false;
          if(other.endsWith(chosen)&&other.length-chosen.length<=1)return false;
          return true;
        });
        if(alternate&&severity.yellow>severity[level]){
          level="yellow";
          reason="AI also considered '"+String(alternate).slice(0,90)+"'. Verify the original writing.";
        }
      }
    }else if(highRisk.has(path)){
      level="yellow";reason="No localized visual evidence is available. Verify this value.";
    }
    for(const warning of warnings) {
      const line=String(warning);
      const related=line.includes(path)||line.toLowerCase().includes(path.replaceAll("_"," "))||
        // Meter-specific warnings affect readings and delivered quantity. Missing
        // unit warnings must NOT incorrectly turn three unrelated fields red.
        (["meter_start","meter_finish","delivered_quantity"].includes(path)&&
          /^(?:Meter mismatch|Meter finish is less than start|Meter arithmetic matches|Only one meter reading)/i.test(line))||
        (path==="quantity_unit"&&/Fuel quantity unit missing or unreadable/i.test(line))||
        (path==="grand_total"&&/total not found/i.test(line));
      if(!related)continue;
      const risk=/mismatch|invalid|missing|unreadable/i.test(line)?"red":"yellow";
      if(severity[risk]>=severity[level]){
        level=risk;reason=line;
      }
    }
    return {level,reason};
  }
  function mount(result,endpoint,getHeaders,sourceFile){
    const root=$("formattedOutput");
    const type=result.document_type;
    const source=type==="fuel_release"?result.fuel_release:result.invoice;
    if(!source||!sourceFile||!endpoint.includes("/functions/v1/billy-vision"))return;
    const doc=structuredClone(source);
    const regions=Array.isArray(result.regions)?result.regions:[];
    const warnings=Array.isArray(result.validation_warnings)?result.validation_warnings:[];
    const paths=fieldsFor(doc,type);
    const translation=result.translation||null;
    const englishPairs=Array.isArray(translation?.translations)?translation.translations:[];
    const translatedPaths=new Map(englishPairs.map(pair=>[pair.field_path,pair]));
    const state=new Map(paths.map(path=>{
      const entry=classification(path,doc,type,regions,warnings);
      if(translatedPaths.has(path)&&entry.level==="green"){
        entry.level="yellow";
        entry.reason="Machine-translated field: compare the English meaning with the original wording.";
      }
      return [path,entry];
    }));
    const humanReviewed=new Set(),manualAcknowledged=new Set(),notOnDocument=new Set();
    let revision=0,checkedRevision=-1,busy=false,recheckCount=0;
    let selected=null,editMode=false;
    const cropper=window.BillyQuickVerifyCrop?.create(sourceFile)||null;
    disposeActiveCrop=()=>cropper?.dispose();
    // The original detailed UI remains functional, but is hidden by default.
    const advanced=create("section","ramp-advanced");
    advanced.hidden=true;
    while(root.firstChild)advanced.appendChild(root.firstChild);
    const evidence=create("section","ramp-evidence");
    evidence.hidden=true;
    const visual=advanced.querySelector(".review-visual");
    if(visual)evidence.appendChild(visual);
    const compact=create("section","ramp-ui");
    root.append(compact,evidence,advanced);
    const intro=create("div","ramp-header");
    intro.append(
      create("h3","ramp-heading","Document check"),
      create("p","ramp-intro","Yellow/red = needs attention. Blue ✓ = operator-checked. Green = no flagged issue, not proof of accuracy.")
    );
    compact.append(intro);
    if(translation?.status==="translated"){
      const info=create("p","ramp-translation-note",
        "Translated "+englishPairs.length+" text field(s) from "+
        String(translation.source_language||"unknown").toUpperCase()+
        " to English · original wording retained for review.");
      compact.append(info);
    }else if(translation?.status==="not_applied"&&
      !["en","und"].includes(translation.source_language)){
      compact.append(create("p","ramp-translation-note",
        "Detected "+String(translation.source_language).toUpperCase()+
        " source text. No verified English translations were extracted; review the original."));
    }
    const jar=create("div","ramp-jar");
    jar.setAttribute("role","group");
    jar.setAttribute("aria-label","Document fields. Select a yellow or red segment to verify it.");
    compact.append(jar);
    const detail=create("section","ramp-field-detail");
    detail.hidden=true;
    const fieldTitle=create("h4","ramp-field-title");
    const sourceTitle=create("p","ramp-source-caption","Original source · AI-estimated area");
    const sourceCrop=create("div","ramp-source-crop");
    const currentCaption=create("p","ramp-value-caption","BILLY EXTRACTED");
    const currentValue=create("div","ramp-current-value");
    const reason=create("p","ramp-reason");
    const fieldInput=create("input","ramp-field-input");
    fieldInput.type="text";fieldInput.autocomplete="off";fieldInput.hidden=true;
    const fieldButtons=create("div","ramp-detail-actions");
    const fieldConfirm=create("button","ramp-confirm","Correct");
    const fieldEdit=create("button","ramp-edit","Edit");
    fieldConfirm.type=fieldEdit.type="button";
    const fieldNotPresent=create("button","ramp-not-present","Not on document");
    fieldNotPresent.type="button";
    const fieldCancel=create("button","ramp-close","Close");
    fieldCancel.type="button";
    const minorActions=create("div","ramp-minor-actions");
    const inspectOriginal=create("button","ramp-inspect-original","View full document");
    inspectOriginal.type="button";
    minorActions.append(fieldNotPresent,inspectOriginal,fieldCancel);
    fieldButtons.append(fieldConfirm,fieldEdit);
    detail.append(fieldTitle,sourceTitle,sourceCrop,currentCaption,
      currentValue,fieldInput,reason,fieldButtons,minorActions);
    compact.append(detail);
    const feedback=create("p","ramp-feedback");
    feedback.setAttribute("role","status");feedback.setAttribute("aria-live","polite");
    compact.append(feedback);
    const controls=create("div","ramp-actions");
    const recheck=create("button","ramp-primary","Recheck with AI");
    const finish=create("button","ramp-primary","Approve & continue");
    recheck.type=finish.type="button";
    controls.append(recheck,finish);
    compact.append(controls);
    const extra=create("div","ramp-extras");
    const toggleEvidence=create("button","ramp-link","Show original document and colored regions");
    toggleEvidence.type="button";
    extra.append(toggleEvidence);
    compact.append(extra);
    const localStatus=create("p","ramp-local-ocr-status","");
    localStatus.setAttribute("role","status");
    localStatus.setAttribute("aria-live","polite");
    compact.append(localStatus);
    const localInput=path=>[...advanced.querySelectorAll("[data-evidence-path]")]
      .find(el=>el.dataset.evidencePath===path);
    let syncing=false;
    const markChanged=(path,value)=>{
      if(!paths.includes(path)) {
        paths.push(path);
        state.set(path,{level:"yellow",reason:"New field value. Recheck is required."});
      }
      setAt(doc,path,value);
      revision++;
      checkedRevision=-1;
      manualAcknowledged.delete(path);
      humanReviewed.delete(path);
      notOnDocument.delete(path);
      state.set(path,{level:"yellow",reason:"Updated by operator. Recheck is required."});
    };
    const saveValue=(path,value)=>{
      const el=localInput(path);
      if(!el)throw Error("The editable source field is unavailable: "+path);
      syncing=true;
      try{
        el.value=value??"";
        el.dispatchEvent(new Event(el.tagName==="SELECT"?"change":"input",{bubbles:true}));
      }finally{syncing=false;}
      markChanged(path,value);
    };
    const syncFromEvidence=event=>{
      if(syncing)return;
      const el=event.target;
      const path=el?.dataset?.evidencePath;
      if(!path||(!paths.includes(path)&&!Object.hasOwn(doc,path)))return;
      markChanged(path,el.value||null);
      paint();
    };
    advanced.addEventListener("input",syncFromEvidence);
    advanced.addEventListener("change",syncFromEvidence);
    const riskCounts=()=>{
      const count={green:0,blue:0,yellow:0,red:0};
      for(const entry of state.values())count[entry.level]++;
      return count;
    };
    // Blue means the operator acted; it is resolved only after any required recheck.
    const allResolved=()=>state.size>0&&[...state.values()]
      .every(entry=>entry.level==="green"||entry.level==="blue");
    // Preserve all client confirmations only as metadata. They are not OCR confidence.
    const readyToApprove=()=>!busy&&allResolved()&&
      (revision===0||checkedRevision===revision);
    window.BillyReview.canApprove=readyToApprove;
    window.BillyReview.rampAudit=()=>({
      ai_recheck_count:recheckCount,
      manual_confirmations:[...humanReviewed],
      ambiguity_acknowledgements:[...manualAcknowledged],
      not_on_document:[...notOnDocument],
      final_field_states:paths.map(field_path=>({
        field_path,
        status:notOnDocument.has(field_path)?"not_on_document":state.get(field_path)?.level||"unknown",
        basis:state.get(field_path)?.reason||""
      })),
      final_approval_gate:readyToApprove()?"passed":"not_passed",
      ai_assessment_not_a_calibrated_confidence:true
    });
    function paint(){
      jar.replaceChildren();
      let index=0;
      for(const path of paths){
        const item=state.get(path),button=create("button","ramp-segment ramp-"+item.level);
        button.type="button";
        button.setAttribute("aria-label",labelFor(path,type,doc)+": "+
          (item.level==="blue"?"checked by operator":item.level)+". "+item.reason);
        button.setAttribute("title",labelFor(path,type,doc)+" · "+item.reason);
        button.setAttribute("aria-pressed",String(selected===path));
        button.dataset.fieldPath=path;
        index++;
        if(item.level==="blue"){
          const icon=create("span","ramp-segment-check","✓");
          icon.setAttribute("aria-hidden","true");
          button.append(icon);
        }else button.append(create("span","ramp-segment-number",String(index).padStart(2,"0")));
        button.addEventListener("click",()=>openEditor(path));
        jar.append(button);
      }
      const totals=riskCounts();
      const pending=totals.red+totals.yellow;
      const needsReview=[...state].filter(([path,value])=>
        (value.level==="red"||value.level==="yellow")&&!humanReviewed.has(path));
      // A field explicitly marked absent changes the review, so still recheck the remaining values.
      recheck.hidden=needsReview.length>0||
        (pending===0&&(revision===0||checkedRevision===revision))||
        (pending>0&&checkedRevision===revision);
      finish.hidden=!readyToApprove();
      recheck.disabled=busy;
      finish.disabled=busy;
      if(busy)feedback.textContent="The AI engine is checking your values against the original image…";
      else if(pending===0){
        feedback.textContent=revision>0&&checkedRevision===revision
          ?"Review completed. Blue fields were checked by the operator."
          :revision>0?"Operator-checked fields are blue. Run AI recheck before approval."
          :"No flagged fields. Confirm the document before continuing.";
      }else if(needsReview.length){
        feedback.textContent="Verify "+needsReview.length+" highlighted field(s), then run AI recheck.";
      }else if(checkedRevision===revision){
        feedback.textContent="Review the remaining highlighted fields. Unclear scans require an explicit operator confirmation.";
      }else feedback.textContent="Fields confirmed. Run Recheck with AI.";
    }
    function setEditMode(enabled){
      editMode=enabled;
      const missing=!substantive(valueAt(doc,selected));
      fieldInput.hidden=!enabled;
      currentValue.hidden=enabled||missing;
      currentCaption.hidden=enabled||missing;
      fieldConfirm.textContent=enabled?(missing?"Save value":"Save correction"):missing?"Enter value":"Correct";
      fieldConfirm.disabled=!enabled&&!missing&&!substantive(valueAt(doc,selected));
      fieldEdit.textContent=enabled?"Cancel edit":missing?"Not on document":"Edit";
      if(enabled)fieldInput.focus();
      else fieldConfirm.focus();
    }
    function closeEditor(){
      selected=null;editMode=false;
      cropper?.cancel();
      sourceCrop.replaceChildren();
      detail.hidden=true;paint();
    }
    function nextAttention(afterPath){
      // Keep the user's place: next unresolved segment, wrapping if needed.
      const i=paths.indexOf(afterPath);
      const ordered=[...paths.slice(i+1),...paths.slice(0,i+1)];
      const next=ordered.find(path=>{
        const entry=state.get(path);
        return entry&&(entry.level==="yellow"||entry.level==="red")&&!humanReviewed.has(path);
      });
      if(next){openEditor(next);return;}
      closeEditor();
      if(!recheck.hidden){
        feedback.textContent="Ready for Recheck";
        recheck.focus();
      }else if(!finish.hidden){
        feedback.textContent="Ready for approval";
        finish.focus();
      }
    }
    function openEditor(path){
      if(busy||!state.has(path))return;
      selected=path;
      const entry=state.get(path);
      const missing=!substantive(valueAt(doc,path));
      detail.className=missing?"ramp-field-detail ramp-missing":"ramp-field-detail";
      fieldTitle.textContent=labelFor(path,type,doc)+(missing?" · Missing":"");
      fieldInput.value=valueAt(doc,path)??"";
      currentValue.textContent=missing?"":String(valueAt(doc,path));
      fieldNotPresent.textContent=notOnDocument.has(path)?"Not on document ✓":"Not on document";
      fieldNotPresent.hidden=missing;
      inspectOriginal.textContent=missing?"View document":"View full document";
      sourceTitle.hidden=missing;
      sourceCrop.hidden=missing;
      reason.hidden=missing;
      const pair=translatedPaths.get(path);
      reason.textContent=entry.reason+(pair?
        " Original ("+String(translation.source_language||"source").toUpperCase()+
        "): "+pair.source_text+". English result: "+pair.english_text+".":"");
      const region=regions.find(item=>item.field_path===path&&
        window.BillyQuickVerifyCrop?.validRegion(item));
      sourceTitle.textContent=region?
        "Original source · page "+region.page+" · AI-estimated area":
        "Original source · location unavailable";
      if(missing){
        // No source value: a blank crop/placeholder adds noise and implies evidence.
        cropper?.cancel();
        sourceCrop.replaceChildren();
      }else if(cropper)void cropper.show(region,sourceCrop);
      else {
        sourceCrop.replaceChildren(
          create("p","ramp-crop-status","Source crop unavailable · inspect the original document."));
      }
      detail.hidden=false;
      setEditMode(false);
      paint();
      detail.scrollIntoView?.({block:"nearest",behavior:"smooth"});
    }
    fieldCancel.addEventListener("click",closeEditor);
    inspectOriginal.addEventListener("click",()=>{
      evidence.hidden=false;
      toggleEvidence.textContent="Hide original document";
      evidence.scrollIntoView?.({block:"nearest",behavior:"smooth"});
    });
    fieldEdit.addEventListener("click",()=>{
      if(!selected)return;
      if(!editMode&&!substantive(valueAt(doc,selected))){
        // Missing fields are a two-choice decision, with no disabled Correct.
        fieldNotPresent.click();
        return;
      }
      if(editMode)fieldInput.value=valueAt(doc,selected)??"";
      setEditMode(!editMode);
    });
    fieldNotPresent.addEventListener("click",()=>{
      if(!selected)return;
      const path=selected;
      // "Absent" is an operator assertion, never an AI reading or a guessed empty value.
      saveValue(path,null);
      notOnDocument.add(path);
      humanReviewed.add(path);
      state.set(path,{level:"blue",reason:"Operator confirmed absent on the source document. AI did not read a value."});
      nextAttention(path);
    });
    fieldInput.addEventListener("keydown",event=>{
      if(event.key==="Enter"){event.preventDefault();fieldConfirm.click();}
      if(event.key==="Escape"){event.preventDefault();fieldCancel.click();}
    });
    fieldConfirm.addEventListener("click",()=>{
      if(!selected)return;
      if(!editMode&&!substantive(valueAt(doc,selected))){
        setEditMode(true); // Enter value, then save through the same button.
        return;
      }
      const path=selected;
      const value=editMode?fieldInput.value.trim():String(valueAt(doc,path)??"").trim();
      if(!value){feedback.textContent="Enter a value using Edit, or mark it Not on document.";return;}
      const before=valueAt(doc,path);
      const current=state.get(path);
      const changed=value!==String(before??"");
      const resolvingUnclear=current.level==="yellow"&&checkedRevision===revision&&
        humanReviewed.has(path)&&!changed;
      if(changed)saveValue(path,value);
      else if((current.level==="yellow"||current.level==="red")&&!resolvingUnclear){
        // A confirmation without a text edit still needs its own AI recheck.
        revision++;
        checkedRevision=-1;
      }
      humanReviewed.add(path);
      if(resolvingUnclear){
        manualAcknowledged.add(path);
        state.set(path,{level:"blue",reason:"Operator accepted unclear source evidence after AI recheck."});
      }else{
        state.set(path,{level:"blue",reason:checkedRevision===revision?
          "Verified by operator; AI recheck completed.":"Checked by operator; AI recheck is pending."});
      }
      nextAttention(path);
    });
    async function recheckWithAI(){
      if(busy||!sourceFile)return;
      const pending=[...state].filter(([path,entry])=>
        (entry.level==="red"||entry.level==="yellow")&&!humanReviewed.has(path));
      if(pending.length){feedback.textContent="Confirm each highlighted field before rechecking.";return;}
      busy=true;paint();recheck.disabled=true;
      const currentRevision=revision;
      let statusText="";
      try{
        const form=new FormData();
        form.append("file",sourceFile,sourceFile.name);
        form.append("extraction_id",result.extraction_id);
        form.append("document_type",type);
        form.append("reviewed_document",JSON.stringify(doc));
        form.append("not_on_document",JSON.stringify([...notOnDocument]));
        const response=await fetch(endpoint+"/api/vision/recheck",{
          method:"POST",headers:await getHeaders(),body:form
        });
        const payload=await response.json();
        if(!response.ok)throw Error(payload.detail||"Recheck request failed");
        if(revision!==currentRevision)throw Error("Document changed during recheck. Please run it again.");
        const map=new Map((payload.checks||[]).map(check=>[check.field_path,check]));
        const meterMismatch=(payload.deterministic_warnings||[]).some(w=>/Meter mismatch|Meter finish is less than start/i.test(String(w)));
        const totalsMismatch=(payload.deterministic_warnings||[]).some(w=>/Subtotal \+ VAT does not match|Sum of line net amounts differs|quantity × unit price differs/i.test(String(w)));
        for(const path of paths){
          if(notOnDocument.has(path)){
            state.set(path,{level:"blue",reason:"Operator confirmed absent; excluded from AI search."});
            continue;
          }
          const item=map.get(path);
          if(meterMismatch&&["delivered_quantity","meter_start","meter_finish"].includes(path)){
            state.set(path,{level:"red",reason:"Meter readings or fuel totals are mathematically inconsistent."});
            humanReviewed.delete(path);manualAcknowledged.delete(path);
            continue;
          }
          if(totalsMismatch&&["subtotal","vat_total","grand_total"].includes(path)){
            state.set(path,{level:"red",reason:"Document totals are mathematically inconsistent."});
            humanReviewed.delete(path);manualAcknowledged.delete(path);
            continue;
          }
          if(!item||item.status==="unclear"){
            state.set(path,{level:"yellow",reason:item?.reason||"AI could not verify this field from the image."});
          }else if(item.status==="mismatch"){
            state.set(path,{level:"red",reason:item.reason||"AI finds a mismatch with the original."});
            humanReviewed.delete(path);
            manualAcknowledged.delete(path);
          }else if(item.status==="match"){
            state.set(path,{level:humanReviewed.has(path)?"blue":"green",reason:
              humanReviewed.has(path)?"Checked by operator and supported by AI recheck.":
                "AI visually supports this value; review remains operator responsibility."});
          }
        }
        checkedRevision=revision;
        recheckCount++;
        for(const [path,entry] of state){
          if(entry.level==="yellow"&&manualAcknowledged.has(path)&&humanReviewed.has(path)){
            state.set(path,{level:"blue",reason:"Accepted by operator despite unclear AI evidence."});
          }
        }
        statusText=allResolved()
          ?"Recheck completed. Ready for operator approval."
          :"AI found remaining doubtful fields. Open the highlighted segments.";
      }catch(error){
        statusText="Recheck failed: "+(error.message||"Unexpected error")+". Nothing was approved.";
      }finally{busy=false;paint();if(statusText)feedback.textContent=statusText;}
    }
    recheck.addEventListener("click",recheckWithAI);
    finish.addEventListener("click",()=>{
      if(!readyToApprove())return;
      const oldButton=advanced.querySelector(".review-approve");
      if(!oldButton){feedback.textContent="Approval control is unavailable.";return;}
      finish.disabled=true;
      oldButton.click();
      // Existing approval routine emits billy:document-approved after the server confirms.
      // A failed request leaves the operator here with the complete advanced error.
    });
    toggleEvidence.addEventListener("click",()=>{
      evidence.hidden=!evidence.hidden;
      toggleEvidence.textContent=evidence.hidden?"Show original document and colored regions":"Hide original document";
    });
    window.addEventListener("billy:approval-failed",event=>{
      const message=String(event.detail?.message||"Approval failed.");
      paint();feedback.textContent=message;
    });
    paint();
    // On desktop, read source-localized handwriting with an independent
    // pretrained TrOCR worker. Never upload crops, train, or auto-approve.
    if(type==="fuel_release"&&window.BillyDesktopTrOCR?.desktop?.()){
      const local=window.BillyDesktopTrOCR.inspect({
        file:sourceFile,regions,
        onStatus:message=>{localStatus.textContent=message;},
        onReading:({field_path,page,text})=>{
          const region=regions.find(item=>
            item.field_path===field_path&&item.page===page);
          if(!region||!state.has(field_path))return;
          region.trocr_reading=text;
          const value=valueAt(doc,field_path);
          const norm=value=>String(value??"").trim().toLowerCase().replace(/\s+/g,"");
          const differs=!!norm(value)&&!!norm(text)&&norm(value)!==norm(text);
          region.handwriting_disagreement=differs;
          if(differs){
            if(!region.alternate_readings.includes(text))
              region.alternate_readings=[...region.alternate_readings,text].slice(0,3);
            if(region.visual_clarity==="clear")region.visual_clarity="slight_uncertainty";
            const current=state.get(field_path);
            if(current.level==="green"){
              state.set(field_path,{level:"yellow",
                reason:"AI engine and local TrOCR read this handwriting differently. Inspect the original."});
            }
          }
          paint();
          if(selected===field_path&&detail.hidden===false)
            reason.textContent=state.get(field_path).reason+
              " Local TrOCR reading: "+text.slice(0,120);
        }
      });
      disposeActiveCrop=()=>{
        local?.cancel?.();
        cropper?.dispose?.();
      };
    }
  }
  window.BillyReview.render=function(result,endpoint,getHeaders,sourceFile){
    if(disposeActiveCrop){disposeActiveCrop();disposeActiveCrop=null;}
    window.BillyReview.canApprove=null;
    window.BillyReview.rampAudit=null;
    originalRender(result,endpoint,getHeaders,sourceFile);
    mount(result,endpoint,getHeaders,sourceFile);
  };
})();
