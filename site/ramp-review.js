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
  // Category-specific fields are visible only when present, or when truly
  // required to process that expense. Optional context must not turn yellow.
  const profileFields={
    fuel_invoice:{aircraft_registration:"Registration",flight_number:"Flight",airport_icao:"Airport",
      service_date:"Delivery date",fuel_quantity:"Fuel volume",fuel_unit:"Fuel unit",fuel_density:"Fuel density"},
    handling_invoice:{aircraft_registration:"Registration",flight_number:"Flight",airport_icao:"Airport",service_date:"Service date"},
    taxi_receipt:{service_date:"Travel date",route_from:"From",route_to:"To",payment_method:"Payment method"},
    city_tax_receipt:{property_name:"Property",guest_name:"Guest",stay_start:"Stay from",
      stay_end:"Stay to",night_count:"Taxable nights",tax_rate:"Tax rate"},
    catering_bill:{service_date:"Service date",delivery_location:"Delivery location",
      flight_number:"Flight",aircraft_registration:"Registration",service_reference:"Service reference",meal_count:"Meals"},
    hotel_bill:{guest_name:"Guest",check_in_date:"Check-in",check_out_date:"Check-out",
      number_of_nights:"Nights",booking_reference:"Booking #",property_city:"City"},
    pax_gifts_receipt:{service_date:"Purchase date",gift_description:"Gift description",
      item_count:"Items",aircraft_registration:"Registration",flight_number:"Flight"},
    parking_receipt:{parking_location:"Parking location",parking_start:"Start",parking_end:"End",
      vehicle_registration:"Vehicle",service_date:"Parking date"},
    crew_expense_receipt:{service_date:"Expense date",expense_purpose:"Purpose",
      crew_member:"Crew member",aircraft_registration:"Registration",
      flight_number:"Flight",payment_method:"Payment method"},
    aircraft_supplies_invoice:{aircraft_registration:"Registration",part_number:"Part number",
      purchase_order_number:"Purchase order",service_date:"Purchase date"},
    other_expense:{service_date:"Expense date",expense_purpose:"Purpose",payment_method:"Payment method"}
  };
  const requiredByProfile={
    fuel_invoice:["supplier_name","grand_total","fuel_quantity","fuel_unit"],
    handling_invoice:["supplier_name","grand_total","invoice_number"],
    taxi_receipt:["grand_total","supplier_name"],
    city_tax_receipt:["grand_total"],
    catering_bill:["supplier_name","grand_total"],
    hotel_bill:["supplier_name","grand_total"],
    pax_gifts_receipt:["grand_total"],
    parking_receipt:["grand_total"],
    crew_expense_receipt:["grand_total"],
    aircraft_supplies_invoice:["supplier_name","grand_total","invoice_number"],
    other_expense:["grand_total"],
    generic_receipt:["grand_total"],
    payment_slip:["grand_total"],
    supplier_statement:["supplier_name"],
    generic_document:[]
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
  // External checks run autonomously on the backend during extraction.
  const labelFor=(path,type,doc,profile="generic_invoice")=>{
    if(path.includes("[")){
      const match=path.match(/^(lines|handwritten_entries)\[(\d+)\]\.(\w+)$/);
      if(match){
        const name=match[1]==="lines"?"Line":"Handwriting";
        const row=doc[match[1]]?.[Number(match[2])];
        return name+" "+(Number(match[2])+1)+" · "+
          (match[3]==="transcription"?(row?.label||"Transcription"):match[3].replaceAll("_"," "));
      }
    }
    return (type==="invoice"?{...invoiceFields,...(profileFields[profile]||{})}:fuelFields)[path]||path.replaceAll("_"," ");
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
  const fieldsFor=(doc,type,profile="generic_invoice")=>{
    const items=[];
    const labels=type==="invoice"?{...invoiceFields,...(profileFields[profile]||{})}:fuelFields;
    const needed=type==="invoice"?(requiredByProfile[profile]||required.invoice):required.fuel_release;
    for(const key of Object.keys(labels)){
      // The compact review only exposes relevant fields for its profile.
      if(substantive(doc[key])||needed.includes(key))items.push(key);
    }
    const array=type==="invoice"?"lines":"handwritten_entries";
    const keys=type==="invoice"?["description","quantity","unit_price","net_amount","vat_rate","vat_amount"]:["transcription"];
    (doc[array]||[]).forEach((row,i)=>{
      for(const key of keys)if(substantive(row[key]))
        items.push(array+"["+i+"]."+key);
    });
    return items;
  };
  // Confidence Engine v1: risk flags, NOT a statistically calibrated
  // probability. Green means no active flag, not guaranteed correctness.
  function classification(path,doc,type,regions,warnings,profile="generic_invoice",originalSourceText=null) {
    const value=valueAt(doc,path);
    const important=highRisk.has(path)||(profile==="fuel_invoice"&&path==="fuel_quantity");
    if(!substantive(value))return {
      level:important?"red":"yellow",
      reason:"No value extracted. Verify the source, or choose Not on document if this field is absent.",
      signal:important?"missing_critical":"missing_value"
    };
    let level="green",reason="No issue flagged by the first AI pass. Still review before final approval.",
      signal="no_flag";
    const matches=regions.filter(region=>region.field_path===path);
    if(matches.length){
      for(const region of matches){
        const q=region.visual_clarity;
        const risk=q==="unreadable"||q==="ambiguous"?"red":
          q==="slight_uncertainty"||q==="unassessed"||!q?"yellow":"green";
        if(severity[risk]>severity[level]){
          level=risk;reason=region.visual_reason||"Source text needs verification.";
          signal=q==="unreadable"?"source_unreadable":
            q==="ambiguous"?"source_ambiguous":
            q==="slight_uncertainty"?"source_slight_uncertainty":"source_unassessed";
        }
        // Alternative numeric readings remain significant even if the model
        // describes the primary reading as visually clear.
        const normalized=v=>{
          const text=String(v??"").normalize("NFKC").toUpperCase();
          // Keep punctuation for numeric readings: 12.5 is not 125.
          return /^(meter_start|meter_finish|delivered_quantity|requested_quantity|grand_total|subtotal|vat_total)$/.test(path)
            ?text.replace(/\s+/g,""):text.replace(/[^A-Z0-9]/g,"");
        };
        // The region alternatives refer to ORIGINAL source text. When a display
        // field is translated, comparing Romanian source alternatives to its
        // English value would invent a false competing reading.
        const chosen=normalized(originalSourceText??value);
        const alternate=(region.alternate_readings||[]).find(a=>{
          const other=normalized(a);
          if(!other||other===chosen)return false;
          // A single optional prefix (e.g. M04569 vs 04569) is formatting,
          // not a competing reading of the handwritten number.
          if(chosen.endsWith(other)&&chosen.length-other.length<=1)return false;
          if(other.endsWith(chosen)&&other.length-chosen.length<=1)return false;
          return true;
        });
        if(alternate&&severity.yellow>severity[level]){
          level="yellow";
          reason="AI also considered '"+String(alternate).slice(0,90)+"'. Verify the original writing.";
          signal="competing_reading";
        }
      }
    }else if(important){
      level="yellow";reason="No localized visual evidence is available. Verify this value.";
      signal="missing_visual_evidence";
    }else{
      signal="no_evidence_low_risk";
    }
    for(const warning of warnings) {
      const line=String(warning);
      // A correct arithmetic equality is a useful *consistency check*, not
      // an uncertainty warning. It is NOT grounds by itself to mark all
      // three fuel meter/quantity readings yellow; independent visual
      // ambiguity, alternatives or missing evidence still keep them flagged.
      if(/^Meter arithmetic matches \(/i.test(line))continue;
      const related=line.includes(path)||line.toLowerCase().includes(path.replaceAll("_"," "))||
        (["meter_start","meter_finish","delivered_quantity"].includes(path)&&
          /^(?:Meter mismatch|Meter finish is less than start|Only one meter reading|Meter difference is )/i.test(line))||
        (path==="quantity_unit"&&/Fuel quantity unit missing or unreadable/i.test(line))||
        (path==="grand_total"&&/total not found/i.test(line));
      if(!related)continue;
      const risk=/mismatch|invalid|missing|unreadable/i.test(line)?"red":"yellow";
      if(severity[risk]>=severity[level]){
        level=risk;reason=line;signal="validation_warning";
      }
    }
    return {level,reason,signal};
  }
  function mount(result,endpoint,getHeaders,sourceFile){
    const root=$("formattedOutput");
    const type=result.document_type;
    const profile=result.classification?.profile||"generic_invoice";
    const source=type==="fuel_release"?result.fuel_release:result.invoice;
    if(!source||!sourceFile||!endpoint.includes("/functions/v1/billy-vision"))return;
    const doc=structuredClone(source);
    const regions=Array.isArray(result.regions)?result.regions:[];
    const warnings=Array.isArray(result.validation_warnings)?result.validation_warnings:[];
    const externalChecks=Array.isArray(result.external_checks?.checks)?result.external_checks.checks:[];
    const normalizedData=result.normalized_data||null;
    const normalizationIssues=Array.isArray(normalizedData?.issues)?normalizedData.issues:[];
    const paths=fieldsFor(doc,type,profile);
    // Currency is critical for financial inventory even when a receipt did not
    // print it. Surface missing currency for correction rather than burying it.
    if(normalizationIssues.some(issue=>issue.field_path==="currency")&&!paths.includes("currency"))
      paths.push("currency");
    const translation=result.translation||null;
    const englishPairs=Array.isArray(translation?.translations)?translation.translations:[];
    const translatedPaths=new Map(englishPairs.map(pair=>[pair.field_path,pair]));
    const state=new Map(paths.map(path=>{
      const translated=translatedPaths.get(path);
      const entry=classification(path,doc,type,regions,warnings,profile,
        typeof translated?.source_text==="string"?translated.source_text:null);
      // A public identity that prompted a lookup remains an operator task.
      // Search can offer a suggestion, never certify the OCR transcription.
      const normalizationIssue=normalizationIssues.find(issue=>issue.field_path===path);
      if(normalizationIssue&&entry.level==="green"){
        entry.level="yellow";
        entry.signal="normalization_needs_review";
        entry.reason=normalizationIssue.message||"Standardized value is ambiguous; verify the original.";
      }
      const check=externalChecks.find(item=>item.field_path===path);
      if(check&&entry.level==="green"){
        entry.level="yellow";
        entry.signal="external_identity_needs_confirmation";
        entry.reason="Entity identity needs double-check. Compare the document with the public sources.";
      }
      return [path,entry];
    }));
    // Snapshot the initial decisions; later operator/recheck state is separate.
    const initialState=new Map([...state].map(([path,entry])=>[path,{
      level:entry.level,signal:entry.signal||"unclassified"
    }]));
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
    if(externalChecks.length)compact.append(create("p","ramp-external-summary",
      "Billy checked "+externalChecks.length+" unclear public reference(s) online. Review original and sources where needed."));
    if(result.classification){
      const title=profile.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());
      const category=String(result.classification.expense_category||"unknown").replaceAll("_"," ");
      compact.append(create("p","ramp-profile",title+" · "+category));
    }
    // Successful translations remain visible in each field's original/English
    // detail and in the audit metadata, not as a global warning banner.
    if(translation?.status==="not_applied"&&
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
    const normalizedHint=create("p","ramp-normalized-hint");
    normalizedHint.hidden=true;
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
    const onlinePanel=create("section","ramp-online-panel");
    onlinePanel.hidden=true;
    const minorActions=create("div","ramp-minor-actions");
    const inspectOriginal=create("button","ramp-inspect-original","View full document");
    inspectOriginal.type="button";
    minorActions.append(fieldNotPresent,inspectOriginal,fieldCancel);
    fieldButtons.append(fieldConfirm,fieldEdit);
    detail.append(fieldTitle,sourceTitle,sourceCrop,currentCaption,
      currentValue,fieldInput,reason,normalizedHint,onlinePanel,fieldButtons,minorActions);
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
      confidence_engine:{
        version:"1.0",
        field_reviews:paths.slice(0,180).map(field_path=>{
          const initial=initialState.get(field_path);
          const before=valueAt(source,field_path);
          const after=valueAt(doc,field_path);
          const action=notOnDocument.has(field_path)?"absent":
            String(before??"")!==String(after??"")?"corrected":
            humanReviewed.has(field_path)?"confirmed":"unreviewed";
          return {
            field_path,initial_level:initial?.level||"new",
            initial_signal:initial?.signal||"new_field",
            final_level:state.get(field_path)?.level||"unknown",action
          };
        })
      },
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
        button.setAttribute("aria-label",labelFor(path,type,doc,profile)+": "+
          (item.level==="blue"?"checked by operator":item.level)+". "+item.reason);
        button.setAttribute("title",labelFor(path,type,doc,profile)+" · "+item.reason);
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
      onlinePanel.replaceChildren();
      onlinePanel.hidden=true;
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
      onlinePanel.replaceChildren();
      onlinePanel.hidden=true;
      const publicCheck=externalChecks.find(item=>item.field_path===path);
      if(publicCheck){
        onlinePanel.hidden=false;
        const message=publicCheck.status==="possible_match"&&publicCheck.suggested_name?
          "Possible public match: "+publicCheck.suggested_name:
          publicCheck.status==="conflicting"?"Multiple plausible public identities.":
          publicCheck.status==="unavailable"?"Online lookup unavailable.":
          "Identity not confirmed from public sources.";
        onlinePanel.append(create("p","ramp-online-status","Billy · External Double-Check"));
        onlinePanel.append(create("p","ramp-online-description",message));
        if(publicCheck.airport_icao)onlinePanel.append(create("p","ramp-online-description","Airport code: "+publicCheck.airport_icao));
        if(publicCheck.explanation)onlinePanel.append(create("p","ramp-online-description",String(publicCheck.explanation).slice(0,230)));
        const sources=create("div","ramp-online-sources");
        for(const source of (Array.isArray(publicCheck.sources)?publicCheck.sources:[]).slice(0,4)){
          try{
            const u=new URL(source.url);
            if(u.protocol!=="https:")continue;
            const a=create("a","ramp-online-link",String(source.title||"Public source").slice(0,95));
            a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";sources.append(a);
          }catch{}
        }
        onlinePanel.append(sources);
        if(typeof publicCheck.search_suggestions==="string"&&publicCheck.search_suggestions){
          const widget=create("iframe","ramp-search-suggestions");
          widget.title="Google Search suggestions";
          widget.setAttribute("sandbox","allow-popups allow-popups-to-escape-sandbox");
          widget.setAttribute("referrerpolicy","no-referrer");
          widget.srcdoc=publicCheck.search_suggestions;onlinePanel.append(widget);
        }
        onlinePanel.append(create("p","ramp-online-disclaimer",
          "Public sources are suggestions, not proof of wording printed on this document. Billy never fills this field automatically."));
      }
      fieldTitle.textContent=labelFor(path,type,doc,profile)+(missing?" · Missing":"");
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
      const canonical=normalizedData?.fields?.[path];
      const canShow=canonical&&canonical.value!==null&&canonical.value!==undefined&&
        String(valueAt(doc,path)??"").trim()===canonical.raw&&
        String(canonical.value)!==canonical.raw;
      normalizedHint.hidden=!canShow;
      normalizedHint.textContent=canShow?"Inventory format: "+String(canonical.value)+
        (canonical.unit?" "+canonical.unit:""):"";
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
  }
  window.BillyReview.render=function(result,endpoint,getHeaders,sourceFile){
    if(disposeActiveCrop){disposeActiveCrop();disposeActiveCrop=null;}
    window.BillyReview.canApprove=null;
    window.BillyReview.rampAudit=null;
    originalRender(result,endpoint,getHeaders,sourceFile);
    mount(result,endpoint,getHeaders,sourceFile);
  };
})();
