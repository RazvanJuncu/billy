/* BillyDPI / Progressive workflow, shared on phone, tablet and desktop.
   Each action reveals only the next functional action. Gemini extraction and
   reviewed fields may persist in Billy cloud; original files and Excel do not. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const body = document.body;
  const screens = ["home", "new", "uploaded", "edit", "type", "process", "review", "upload"];
  const names = {new:"New Document",uploaded:"Uploaded Documents",edit:"Edit Document",type:"Document Type",process:"Process Document",review:"Review Document",upload:"Upload Document"};
  const sessionFiles = [];
  let activeFile = null;
  let approved = false;
  let greetingSelected = false;
  const greetings = [
    ["Welcome back, {name}.", "Ready when you are."],
    ["Good to see you, {name}.", "Let's get something done."],
    ["Look who's back, back again.", "Your documents missed you."],
    ["Houston, we have a document.", "Consider it handled."],
    ["The paperwork strikes back.", "This time, we're ready."],
    ["Ctrl + Alt + Deliver.", "One clean workflow."],
    ["Welcome aboard, {name}.", "Ready for takeoff."],
    ["Another day, another document.", "Let's keep it simple."],
    ["Ready to roll, {name}?", "Start with a scan."],
    ["Back in business.", "Let's get straight to it."],
    ["Plot twist: paperwork is fun.", "Well, almost."],
    ["Your next document awaits.", "Take it from the top."],
    ["You had me at PDF.", "Let's get to work."],
    ["Great to have you back, {name}.", "Good things start here."],
    ["Paperwork? Not today.", "Let's make it effortless."]
  ];

  function chooseGreeting(firstName) {
    if (greetingSelected || !firstName) return;
    greetingSelected = true;
    const storageKey = "billydpi:last-greeting";
    let previous = -1;
    try {
      const saved = Number(window.localStorage.getItem(storageKey));
      if (Number.isInteger(saved) && saved >= 0 && saved < greetings.length) previous = saved;
    } catch {}
    const choice = previous < 0
      ? Math.floor(Math.random() * greetings.length)
      : (previous + 1 + Math.floor(Math.random() * (greetings.length - 1))) % greetings.length;
    try { window.localStorage.setItem(storageKey,String(choice)); } catch {}
    const [title,subtitle] = greetings[choice];
    $("simpleGreetingTitle").textContent = title.replaceAll("{name}",firstName);
    $("simpleGreetingSubtitle").textContent = subtitle;
  }

  function announce(message) {
    $("simpleFlowNotice").textContent = message || "";
    $("simpleFlowNotice").hidden = !message;
  }

  function selectedDocumentType() {
    const value = $("documentType").value;
    return value === "invoice" || value === "fuel_release" ? value : null;
  }

  function chooseDocumentType(type) {
    if (!activeFile || (type !== "invoice" && type !== "fuel_release")) return;
    const select = $("documentType");
    select.value = type;
    // Keep the original extraction engine's document-type value authoritative.
    select.dispatchEvent(new Event("change",{bubbles:true}));
    const rec = sessionFiles.find(item => item.file === activeFile);
    if (rec) rec.documentType = type;
    showScreen("process");
    // Choosing the document type is the final confirmation; process immediately
    // when the authenticated engine is available.
    if (window.BillyApp?.isOnline()) startProcessing();
  }

  function startProcessing() {
    if (!activeFile || !selectedDocumentType()) { showScreen("type"); return; }
    if (!window.BillyApp?.isOnline()) { updateProcess(); return; }
    const action = $("simpleRunProcess");
    if (action.disabled) return;
    action.disabled = true;
    $("scanButton").click();
  }

  function showScreen(name) {
    let next = screens.includes(name) ? name : "home";
    if (next === "process" && !selectedDocumentType()) next = activeFile ? "type" : "new";
    if (next === "type" && !activeFile) next = "new";
    body.dataset.billyScreen = next;
    for (const section of screens) {
      const el = $("simple" + section.charAt(0).toUpperCase() + section.slice(1));
      if (el) el.hidden = section !== next;
    }
    $("simpleFlowHeader").hidden = next === "home";
    $("simpleFlowTitle").textContent = names[next] || "";
    $("simpleReviewToUpload").hidden = !(next === "review" && approved);
    if (next === "edit") window.BillyWorkspace?.showView("capture");
    if (next === "type") {
      window.BillyWorkspace?.showView("capture");
      const selected = selectedDocumentType();
      for (const card of document.querySelectorAll(".simple-type-card")) {
        card.setAttribute("aria-pressed",String(card.dataset.documentType === selected));
      }
    }
    if (next === "review") window.BillyWorkspace?.showView("review");
    if (next === "process" || next === "upload" || next === "new" || next === "uploaded" || next === "home") {
      window.BillyWorkspace?.showView("capture");
    }
    announce("");
    if (next === "uploaded") renderUploaded();
    if (next === "process") {
      updateProcess();
      if(!window.BillyApp?.isOnline() && window.BillyAccounts?.active?.())
        window.BillyApp?.connectVision?.();
    }
    if (next === "upload") updateUpload();
    $("workspaceStage").scrollTop = 0;
  }

  function updateProcess() {
    const state = window.BillyApp?.visionStatus?.() || {};
    const ready = Boolean(window.BillyApp?.isOnline());
    const action = $("simpleRunProcess");
    const type = selectedDocumentType();
    action.disabled = !ready || !type;
    $("simpleSelectedType").textContent = type === "fuel_release" ? "Fuel Release" : type === "invoice" ? "Invoice" : "Not selected";
    $("simpleRetryVision").hidden = ready || Boolean(state.connecting);
    // Connection success is represented by the enabled Process button.
    // Show status copy only when a connection needs attention.
    $("simpleProcessStatus").hidden = ready;
    $("simpleProcessStatus").textContent = ready
      ? ""
      : state.connecting
        ? "Connecting to the AI engine…"
        : state.error
          ? "AI engine connection failed: " + state.error
          : "The AI engine is disconnected. Select Retry AI engine connection.";
  }

  function updateUpload() {
    const exportable = approved;
    $("simpleExportCsv").disabled = !exportable;
    $("simpleExportJson").disabled = !exportable;
    $("simpleUploadNote").textContent = exportable
      ? "Approved fields are saved to your Billy team records when connected to cloud. The original file and company Excel are not updated."
      : "Review and approve the document before exporting.";
    // Preview and CSV use the same approved document summary and entry rows.
    // Never display an unapproved AI extraction as an Excel-ready result.
    const sheet=exportable?window.BillyReview?.getApprovedSpreadsheetData?.():null;
    window.BillyExcelPreview?.render($("simpleExcelPreview"),sheet);
    if(!window.BillyExcelPreview)$("simpleExcelPreview").hidden=true;
  }

  function recordFile(file) {
    activeFile = file;
    approved = false;
    // Every new document must be classified explicitly; never inherit Invoice or the last choice.
    $("documentType").value = "";
    let record = sessionFiles.find(record => record.file === file);
    if (!record) {
      record = {file, status:"Not processed", documentType:null};
      sessionFiles.unshift(record);
    } else {
      record.status = "Not processed";
      record.documentType = null;
    }
    // Go straight from import/crop confirmation to document classification.
    // The edit screen is still available using Back if corrections are needed.
    showScreen("type");
  }

  // Development cleanup. Removing a session entry only forgets this browser's
  // current-session list. Deleting a cloud record is a permanent server action.
  function makeDocumentRow(button,deleteButton){
    const row=document.createElement("div");
    row.className="simple-document-row";
    row.append(button,deleteButton);
    return row;
  }
  function makeDeleteButton(label,onDelete){
    const button=document.createElement("button");
    button.type="button";
    button.className="simple-document-delete";
    button.textContent="Delete";
    button.setAttribute("aria-label","Delete "+label);
    button.title="Delete "+label;
    button.addEventListener("click",onDelete);
    return button;
  }

  async function renderUploaded(offset=0) {
    const list = $("simpleDocumentsList");
    list.replaceChildren();
    $("simpleDocumentsEmpty").hidden = sessionFiles.length > 0;
    $("simpleDocumentsIntro").textContent = "Current-session files are only on this device. Cloud records contain extracted/approved fields, not source PDFs or photographs.";
    for (const item of sessionFiles) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "simple-document-item";
      const name = document.createElement("span");
      name.className = "simple-document-name";
      name.textContent = item.file.name;
      const status = document.createElement("span");
      status.className = "simple-document-status";
      status.textContent = item.status;
      button.append(name, status);
      button.addEventListener("click",() => {
        // Opening a session file starts another draft; never imply persistence.
        window.BillyApp?.openFile(item.file);
      });
      const remove=makeDeleteButton(item.file.name,()=>{
        if(!window.confirm("Remove '"+item.file.name+"' from this browser session?\nThe original file on your device will not be deleted."))return;
        const index=sessionFiles.indexOf(item);
        if(index>=0)sessionFiles.splice(index,1);
        if(body.dataset.billyScreen==="uploaded")renderUploaded(offset);
      });
      list.appendChild(makeDocumentRow(button,remove));
    }
    const api = window.BILLY_AUTH_CONFIG?.apiUrl;
    if(!api || !window.BillyAccounts?.active?.())return;
    const title=document.createElement("strong");
    title.className="simple-document-name";
    title.textContent="Team cloud records";
    list.appendChild(title);
    try{
      const headers=await window.BillyAccounts.sessionHeaders();
      const reply=await fetch(api+"/api/vision/records?offset="+offset,{headers,cache:"no-store"});
      if(!reply.ok)throw Error("Team records could not be loaded");
      const result=await reply.json();
      if(body.dataset.billyScreen!=="uploaded")return;
      const rows=Array.isArray(result.records)?result.records:[];
      $("simpleDocumentsEmpty").hidden=sessionFiles.length>0 || rows.length>0;
      if(!rows.length && offset===0) {
        const empty=document.createElement("p");
        empty.textContent="No cloud records yet. Extract and approve a document first.";
        list.appendChild(empty);
      }
      for(const record of rows){
        if(!record || typeof record.id!=="string")continue;
        const button=document.createElement("button");
        button.type="button";
        button.className="simple-document-item";
        const name=document.createElement("span");
        name.className="simple-document-name";
        const date=new Date(record.created_at);
        const when=Number.isNaN(date.valueOf())?"":date.toLocaleDateString();
        name.textContent=(record.document_type==="fuel_release"?"Fuel Release":"Invoice")+" · "+when;
        const status=document.createElement("span");
        status.className="simple-document-status";
        status.textContent=record.state==="approved"?"Approved · download JSON":"Extracted · review not saved";
        button.append(name,status);
        if(record.state==="approved" && record.reviewed_data){
          button.addEventListener("click",()=>{
            const initial=record.extracted_data||null;
            const reviewed=record.reviewed_data;
            const changes=initial?Object.keys(reviewed).filter(key=>JSON.stringify(initial[key])!==JSON.stringify(reviewed[key]))
              .map(field_path=>({field_path,original:initial[field_path]??null,reviewed:reviewed[field_path]??null})):[];
            const content=JSON.stringify({
              schema_version:"0.7",approved:true,document_type:record.document_type,
              document:reviewed,original_extraction:initial,changes_from_original:changes,
              original_validation_warnings:record.original_validation_warnings||[],
              review_metadata:record.review_metadata||{},
              review_validation_warnings:record.validation_warnings||[],
              evidence_regions:record.regions_data||[],
              model:record.model_name||null,record_id:record.id,
              source_sha256:record.source_sha256||null
            },null,2);
            const url=URL.createObjectURL(new Blob([content],{type:"application/json"}));
            const link=document.createElement("a");
            link.href=url;link.download="billy-"+record.id+".json";
            document.body.appendChild(link);link.click();link.remove();
            setTimeout(()=>URL.revokeObjectURL(url),1000);
          });
        }else{
          button.disabled=true;
          button.title="Original source file is not archived. Reopen the original document to review.";
        }
        // Team members can view the shared ledger; only the creator can delete a record.
        const ownsRecord=record.created_by===window.BillyAccounts?.userId?.();
        if(ownsRecord){
          const remove=makeDeleteButton(name.textContent,async()=>{
            if(remove.disabled)return;
            const message="Permanently delete this Billy cloud record?\n\n"+
              name.textContent+"\n\nThis permanently deletes this document's extracted and approved data. It cannot be undone.";
            if(!window.confirm(message))return;
            remove.disabled=true;remove.textContent="Deleting…";
            try{
              const latestHeaders=await window.BillyAccounts.sessionHeaders();
              const response=await fetch(api+"/api/vision/delete",{
                method:"POST",
                headers:{"Content-Type":"application/json",...latestHeaders},
                body:JSON.stringify({record_id:record.id})
              });
              const outcome=await response.json();
              if(!response.ok||outcome.deleted!==true)
                throw Error(outcome.detail||"Could not delete this record.");
              if(body.dataset.billyScreen==="uploaded")await renderUploaded(offset);
            }catch(error){
              remove.disabled=false;remove.textContent="Delete";
              const info=$("simpleDocumentsIntro");
              info.textContent="Deletion failed: "+(error.message||"Unknown error")+". The record is still saved.";
            }
          });
          list.appendChild(makeDocumentRow(button,remove));
        }else{
          list.appendChild(button);
        }
      }
      // Cloud history is paginated in groups of 50 so older test records stay reachable.
      const navigation=document.createElement("div");
      navigation.className="simple-documents-pagination";
      if(offset>0){
        const newer=document.createElement("button");
        newer.type="button";newer.className="simple-secondary-action";
        newer.textContent="Newer records";
        newer.addEventListener("click",()=>renderUploaded(Math.max(0,offset-50)));
        navigation.appendChild(newer);
      }
      if(result.has_more&&Number.isInteger(result.next_offset)&&result.next_offset>offset){
        const older=document.createElement("button");
        older.type="button";older.className="simple-secondary-action";
        older.textContent="Older records";
        older.addEventListener("click",()=>renderUploaded(result.next_offset));
        navigation.appendChild(older);
      }
      if(navigation.children.length)list.appendChild(navigation);
    }catch(error){
      const info=document.createElement("p");
      info.textContent="Cloud history unavailable. Check the AI engine connection and team membership.";
      list.appendChild(info);
    }
  }

  function goBack() {
    const now = body.dataset.billyScreen;
    if (now === "edit") showScreen("new");
    else if (now === "process") showScreen("type");
    else if (now === "type") showScreen("edit");
    else if (now === "review") showScreen("process");
    else if (now === "upload") showScreen("review");
    else showScreen("home");
  }

  function startSnapCamera() {
    if (!window.BillyAccounts?.active?.()) return;
    // The phone starts in camera; captures accumulate in a local QuickScan session.
    if (window.BillyQuickScan?.begin) window.BillyQuickScan.begin();
    else window.BillyScanner?.startCamera?.();
  }

  // Intentionally transient: a refresh or relaunch returns to the one-button home.
  function toggleRevealedFunctions() {
    const revealed = body.classList.toggle("billy-functions-revealed");
    $("simpleRevealFunctions").textContent = revealed ? "Hide functions" : "Reveal functions";
    $("simpleRevealFunctions").setAttribute("aria-expanded", String(revealed));
  }

  function chooseSnapFile() {
    if (!window.BillyAccounts?.active?.()) return;
    // Dismiss the camera first; image imports continue through the shared crop editor.
    window.BillyScanner?.close?.();
    $("filePicker").click();
  }

  function bind(id, fn) {
    const el = $(id);
    if (!el) throw Error("BillyDPI control missing: " + id);
    el.addEventListener("click", fn);
  }
  bind("simpleHomeButton", () => showScreen("home"));
  bind("simpleBack", goBack);
  bind("simpleNewDocument", () => showScreen("new"));
  bind("simpleQuickSnap", startSnapCamera);
  bind("simpleRevealFunctions", toggleRevealedFunctions);
  bind("snapStartCamera", startSnapCamera);
  bind("snapLaunchUpload", chooseSnapFile);
  bind("snapCameraUpload", chooseSnapFile);
  bind("simpleUploadedDocuments", () => showScreen("uploaded"));
  bind("simpleCapture", () => $("scanOpenCamera").click());
  bind("simpleAddFiles", () => $("filePicker").click());
  bind("simpleContinue", () => showScreen("type"));
  bind("simpleChooseInvoice", () => chooseDocumentType("invoice"));
  bind("simpleChooseFuelRelease", () => chooseDocumentType("fuel_release"));
  bind("simpleChangeType", () => showScreen("type"));
  bind("simpleRetryVision", () => {
    if(window.BillyAccounts?.active?.()) window.BillyApp?.connectVision?.();
    updateProcess();
  });
  bind("simpleRunProcess", startProcessing);
  bind("simpleExportCsv", () => window.BillyReview?.exportCSV());
  bind("simpleExportJson", () => window.BillyReview?.exportJSON());
  bind("simpleReviewAgain", () => showScreen("review"));
  bind("simpleReviewToUpload", () => { if (approved) showScreen("upload"); });
  bind("simpleNewFromUpload", () => {
    // After saving feedback, start the next document with one tap on a phone.
    if (document.documentElement.dataset.billyMobile === "1" && window.BillyQuickScan?.begin) {
      showScreen("home");
      window.BillyQuickScan.begin();
      return;
    }
    showScreen("new");
  });
  bind("simpleUploadedBackToHome", () => showScreen("home"));
  if (document.documentElement.dataset.billyMobile === "1") {
    const label = $("simpleNewFromUpload").querySelector("span");
    if (label) label.textContent = "Scan another";
  }

  const addArea = $("simpleNew");
  addArea.addEventListener("dragover",event => {
    event.preventDefault();
    addArea.classList.add("simple-dragging");
  });
  addArea.addEventListener("dragleave",() => addArea.classList.remove("simple-dragging"));
  addArea.addEventListener("drop",event => {
    event.preventDefault();
    addArea.classList.remove("simple-dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) window.BillyApp?.acceptFile(file);
  });

  window.addEventListener("billy:document-loaded",event => {
    if (event.detail?.file) recordFile(event.detail.file);
  });
  window.addEventListener("billy:ocr-ready",() => {
    if (activeFile) {
      const rec = sessionFiles.find(item => item.file === activeFile);
      if (rec) rec.status = "Extracted · pending review";
    }
    $("simpleRunProcess").disabled = false;
    showScreen("review");
  });
  window.addEventListener("billy:process-complete",() => updateProcess());
  window.addEventListener("billy:engine-updated",() => { if (body.dataset.billyScreen === "process") updateProcess(); });
  window.addEventListener("billy:document-revised",() => {
    approved = false;
    const rec = sessionFiles.find(item => item.file === activeFile);
    if (rec) rec.status = "Not processed";
    if (body.dataset.billyScreen === "review" || body.dataset.billyScreen === "upload") showScreen("edit");
  });
  window.addEventListener("billy:account-ready",event => {
    chooseGreeting(String(event.detail?.firstName || "").trim().slice(0,32));
    if (body.dataset.billyScreen === "process") updateProcess();
  });
  window.addEventListener("billy:document-approved",() => {
    approved = true;
    const rec = sessionFiles.find(item => item.file === activeFile);
    if (rec) rec.status = "Approved in pilot";
    showScreen("upload");
  });

  showScreen("home");
  if (window.BillyAccounts?.active?.()) {
    chooseGreeting(String(window.BillyAccounts.firstName?.() || "").trim().slice(0,32));
  }
  window.BillySimple = {showScreen, getState:() => ({
    screen:body.dataset.billyScreen, sessionFiles:sessionFiles.length, approved, documentType:selectedDocumentType()
  })};
})();
