/* BillyDPI / Progressive workflow.
   Each action reveals only the next functional action. Nothing is uploaded to
   company storage or Excel until a real server-side connector is configured. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const body = document.body;
  const screens = ["home", "new", "uploaded", "edit", "process", "review", "upload"];
  const names = {new:"New Document",uploaded:"Uploaded Documents",edit:"Edit Document",process:"Process Document",review:"Review Document",upload:"Upload Document"};
  const sessionFiles = [];
  let activeFile = null;
  let approved = false;

  function announce(message) {
    $("simpleFlowNotice").textContent = message || "";
    $("simpleFlowNotice").hidden = !message;
  }

  function showScreen(name) {
    const next = screens.includes(name) ? name : "home";
    body.dataset.billyScreen = next;
    for (const section of screens) {
      const el = $("simple" + section.charAt(0).toUpperCase() + section.slice(1));
      if (el) el.hidden = section !== next;
    }
    $("simpleFlowHeader").hidden = next === "home";
    $("simpleFlowTitle").textContent = names[next] || "";
    $("simpleReviewToUpload").hidden = !(next === "review" && approved);
    if (next === "edit") window.BillyWorkspace?.showView("capture");
    if (next === "review") window.BillyWorkspace?.showView("review");
    if (next === "process" || next === "upload" || next === "new" || next === "uploaded" || next === "home") {
      window.BillyWorkspace?.showView("capture");
    }
    announce("");
    if (next === "uploaded") renderUploaded();
    if (next === "process") updateProcess();
    if (next === "upload") updateUpload();
    $("workspaceStage").scrollTop = 0;
  }

  function updateProcess() {
    const ready = Boolean(window.BillyApp?.isOnline());
    const action = $("simpleRunProcess");
    action.disabled = !ready;
    $("simpleProcessStatus").textContent = ready
      ? "Ready."
      : "Vision AI is not connected yet. Processing requires a secure server.";
  }

  function updateUpload() {
    const exportable = approved;
    $("simpleExportCsv").disabled = !exportable;
    $("simpleExportJson").disabled = !exportable;
    $("simpleUploadNote").textContent = exportable
      ? "Approved and saved in the pilot review log. Company Excel upload is not connected yet."
      : "Review and approve the document before exporting.";
  }

  function recordFile(file) {
    activeFile = file;
    approved = false;
    let record = sessionFiles.find(record => record.file === file);
    if (!record) {
      record = {file, status:"Not processed", documentType:$("documentType").value};
      sessionFiles.unshift(record);
    } else {
      record.status = "Not processed";
    }
    showScreen("edit");
  }

  function renderUploaded() {
    const list = $("simpleDocumentsList");
    list.replaceChildren();
    $("simpleDocumentsEmpty").hidden = sessionFiles.length > 0;
    $("simpleDocumentsIntro").textContent = sessionFiles.length
      ? "Files added in this browser session. They are not uploaded to company storage."
      : "No documents have been uploaded to company storage.";
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
      list.appendChild(button);
    }
  }

  function goBack() {
    const now = body.dataset.billyScreen;
    if (now === "edit") showScreen("new");
    else if (now === "process") showScreen("edit");
    else if (now === "review") showScreen("process");
    else if (now === "upload") showScreen("review");
    else showScreen("home");
  }

  function bind(id, fn) {
    const el = $(id);
    if (!el) throw Error("BillyDPI control missing: " + id);
    el.addEventListener("click", fn);
  }
  bind("simpleHomeButton", () => showScreen("home"));
  bind("simpleBack", goBack);
  bind("simpleNewDocument", () => showScreen("new"));
  bind("simpleUploadedDocuments", () => showScreen("uploaded"));
  bind("simpleCapture", () => $("scanOpenCamera").click());
  bind("simpleAddFiles", () => $("filePicker").click());
  bind("simpleContinue", () => showScreen("process"));
  bind("simpleRunProcess", () => {
    if (!window.BillyApp?.isOnline()) { updateProcess(); return; }
    $("simpleRunProcess").disabled = true;
    $("scanButton").click();
  });
  bind("simpleExportCsv", () => window.BillyReview?.exportCSV());
  bind("simpleExportJson", () => window.BillyReview?.exportJSON());
  bind("simpleReviewAgain", () => showScreen("review"));
  bind("simpleReviewToUpload", () => { if (approved) showScreen("upload"); });
  bind("simpleNewFromUpload", () => showScreen("new"));
  bind("simpleUploadedBackToHome", () => showScreen("home"));

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
  window.addEventListener("billy:account-ready",() => {
    if (body.dataset.billyScreen === "process") updateProcess();
  });
  window.addEventListener("billy:document-approved",() => {
    approved = true;
    const rec = sessionFiles.find(item => item.file === activeFile);
    if (rec) rec.status = "Approved in pilot";
    showScreen("upload");
  });

  showScreen("home");
  window.BillySimple = {showScreen, getState:() => ({
    screen:body.dataset.billyScreen, sessionFiles:sessionFiles.length, approved
  })};
})();
